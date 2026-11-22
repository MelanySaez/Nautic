"""
Cola de análisis: fotos que esperan un lugar libre bajo el límite de concurrencia.

``POST /analizar/`` lanza las fotos que entran en ``VISION_RATE_LIMIT_MAX_CONCURRENT``
y marca el resto con la IP que las pidió (``FotoInspeccion.cola_ip``). Cada vez que el
worker libera un lugar (``track_concurrent_end``) llama a ``despachar_cola(ip)``, que
lanza las fotos encoladas de esa IP, de la más antigua a la más nueva, mientras haya
lugar. Postgres es la fuente de verdad de la cola: sobrevive a reinicios y no depende
de que el navegador siga abierto.

Cada foto se reclama con ``select_for_update(skip_locked=True)``, así dos workers que
liberan lugares a la vez nunca lanzan la misma foto.
"""
import logging

from django.db import transaction

from .models import FotoInspeccion
from .ratelimit import track_concurrent_end, track_concurrent_start

logger = logging.getLogger(__name__)


def _lanzar(foto_id: int) -> None:
    """Encola la tarea Celery de la foto (import diferido: tasks importa este módulo)."""
    from .tasks import procesar_foto

    procesar_foto.apply_async(kwargs={"foto_id": foto_id})


def _reclamar_siguiente(ip: str) -> FotoInspeccion | None:
    """Saca de la cola la foto pendiente más antigua de ``ip`` si hay un lugar libre."""
    with transaction.atomic():
        foto = (
            FotoInspeccion.objects.select_for_update(skip_locked=True)
            .filter(cola_ip=ip, estado=FotoInspeccion.Estado.PENDIENTE)
            .order_by("id")
            .first()
        )
        if foto is None:
            return None
        ok, _ = track_concurrent_start(ip, foto.id)
        if not ok:
            return None
        foto.cola_ip = None
        foto.save(update_fields=["cola_ip"])
        return foto


def despachar_cola(ip) -> int:
    """Lanza las fotos encoladas de ``ip`` mientras haya lugar. Devuelve cuántas lanzó.

    Sin IP conocida (Redis perdió el mapeo, o falló) no hace nada: las fotos siguen
    ``pendiente`` y en la cola, y un nuevo "Iniciar análisis" las vuelve a intentar.
    """
    if not isinstance(ip, str) or not ip:
        return 0
    lanzadas = 0
    while True:
        try:
            foto = _reclamar_siguiente(ip)
        except Exception:
            logger.exception("No se pudo leer la cola de análisis (ip=%s)", ip)
            return lanzadas
        if foto is None:
            return lanzadas
        try:
            _lanzar(foto.id)
        except Exception:
            # Broker caído: la foto vuelve a la cola y su lugar queda libre.
            logger.exception("No se pudo lanzar la foto encolada %s", foto.id)
            FotoInspeccion.objects.filter(pk=foto.id).update(cola_ip=ip)
            track_concurrent_end(foto.id)
            return lanzadas
        lanzadas += 1
