"""
Tareas Celery del módulo de visión.

La tarea ``procesar_foto`` ejecuta la inferencia YOLO sobre una
``FotoInspeccion`` y persiste el resultado en Postgres. El procesamiento de
imagen (preprocesado + inferencia + anotación) se delega íntegramente a
``core_engine.ImageProcessor.process_and_visualize`` — esta capa sólo
orquesta E/S de disco, transición de estado y categorización de severidad.

DLQ (Dead Letter Queue):
  Cuando una tarea agota reintentos o falla de forma no recuperable, se envía
  un mensaje a la cola ``vision.dead`` vía la tarea ``dead_letter``. Visible
  en Flower como tarea separada para diagnóstico y requeue manual.
"""
import asyncio
import io
import logging
import os
import uuid

from PIL import Image
from celery import shared_task
from django.conf import settings

from .inference import get_processor
from .models import FotoInspeccion
from .pubsub import publicar_evento
from .ratelimit import track_concurrent_end

logger = logging.getLogger(__name__)

# Debe coincidir con retry_kwargs["max_retries"] de procesar_foto.
_MAX_RETRIES = 3


# ─────────────────────────────────────────────────────────────────────────────
# Post-procesado de resultados (no es procesamiento de imagen — sólo
# categorización de las detecciones que devuelve nautic_core)
# ─────────────────────────────────────────────────────────────────────────────

_SEVERITY_MAP = {
    "corrosion":     "critical",
    "defect":        "high",
    "marine_growth": "medium",
    "paint_peel":    "low",
}
_SEVERITY_ORDER = ["critical", "high", "medium", "low"]


def _calcular_severidad(detections):
    """Nivel de severidad más alto entre las detecciones."""
    worst = None
    for det in detections:
        sev = _SEVERITY_MAP.get(det.get("class_name"))
        if not sev:
            continue
        if worst is None or _SEVERITY_ORDER.index(sev) < _SEVERITY_ORDER.index(worst):
            worst = sev
    return worst


def _agrupar_detecciones(detections):
    """Colapsa la lista cruda a una entrada por clase única."""
    grouped = {}
    for det in detections:
        cn = det.get("class_name", "")
        if cn not in grouped:
            grouped[cn] = {"class_name": cn, "count": 0, "max_confidence": 0.0}
        grouped[cn]["count"] += 1
        grouped[cn]["max_confidence"] = max(
            grouped[cn]["max_confidence"],
            det.get("confidence", 0.0),
        )
    return list(grouped.values())


def _notificar(foto: FotoInspeccion) -> None:
    """Publica el estado actual de la foto al canal pub/sub de su inspección."""
    publicar_evento(
        foto.inspeccion_id,
        event="foto-updated",
        data={
            "foto_id": foto.pk,
            "inspeccion_id": foto.inspeccion_id,
            "estado": foto.estado,
            "severidad": foto.severidad,
            "detecciones": foto.detecciones,
            "tiempo_inferencia_ms": foto.tiempo_inferencia_ms,
            "imagen_anotada": foto.imagen_anotada,
            "error_detalle": foto.error_detalle,
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Dead Letter Queue
# ─────────────────────────────────────────────────────────────────────────────

@shared_task(name="vision.dead_letter", ignore_result=True)
def dead_letter(
    foto_id: int,
    error_type: str,
    error_detail: str,
    original_task_id: str,
) -> None:
    """
    Registra tareas que agotaron reintentos o fallaron de forma no recuperable.

    Visible en Flower bajo la cola ``vision.dead``. Para reencolar manualmente:
        from vision.tasks import procesar_foto
        procesar_foto.apply_async([foto_id])
    """
    logger.error(
        "DEAD_LETTER | foto=%s | %s: %s | original_task=%s",
        foto_id,
        error_type,
        error_detail[:300],
        original_task_id,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Tarea principal
# ─────────────────────────────────────────────────────────────────────────────

@shared_task(
    bind=True,
    name="vision.procesar_foto",
    autoretry_for=(IOError, OSError),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    retry_kwargs={"max_retries": _MAX_RETRIES},
)
def procesar_foto(self, foto_id: int):
    """Ejecuta la inferencia YOLO sobre una ``FotoInspeccion``.

    Pasos:
      1. Marca la foto como ``en_proceso`` (idempotente: si ya está
         ``completada`` la tarea retorna sin reprocesar).
      2. Lee bytes desde disco y verifica que la imagen es válida.
      3. Delega procesado + anotación a ``ImageProcessor.process_and_visualize``
         del paquete ``nautic_core``.
      4. Persiste imagen anotada, detecciones agrupadas, severidad y estado.
      5. Ante excepción, marca ``error`` con detalle y reintenta si aplica.
      6. Al finalizar (éxito, error final o skip) libera el slot de concurrencia.
    """
    try:
        foto = FotoInspeccion.objects.get(pk=foto_id)
    except FotoInspeccion.DoesNotExist:
        logger.warning("FotoInspeccion %s no existe; tarea abortada.", foto_id)
        track_concurrent_end(foto_id)
        return

    # Idempotencia: re-deliveries por acks_late no deben reprocesar lo ya hecho
    if foto.estado == FotoInspeccion.Estado.COMPLETADA:
        logger.info("Foto %s ya completada; tarea ignorada.", foto_id)
        track_concurrent_end(foto_id)
        return

    foto.estado = FotoInspeccion.Estado.EN_PROCESO
    foto.error_detalle = None
    foto.save(update_fields=["estado", "error_detalle"])
    _notificar(foto)

    try:
        ruta_original = os.path.join(settings.BASE_DIR, foto.imagen_original)
        with open(ruta_original, "rb") as fh:
            imagen_bytes = fh.read()

        # Validación de integridad (no es procesamiento — sólo defensa contra
        # archivos corruptos o renombrados con extensión falsa)
        try:
            Image.open(io.BytesIO(imagen_bytes)).verify()
        except Exception:
            raise ValueError("El archivo almacenado no es una imagen válida.")

        # Procesado + anotación íntegramente vía nautic_core
        processor = get_processor()
        imagen_anotada_bytes, resultados = asyncio.run(
            processor.process_and_visualize(imagen_bytes)
        )

        # Persistir imagen anotada en disco
        nombre_anotada = (
            f"media/inspecciones/anotadas/{foto_id}_{uuid.uuid4().hex[:8]}.jpg"
        )
        ruta_anotada = os.path.join(settings.BASE_DIR, nombre_anotada)
        os.makedirs(os.path.dirname(ruta_anotada), exist_ok=True)
        with open(ruta_anotada, "wb") as fh:
            fh.write(imagen_anotada_bytes)

        raw_detections = resultados.get("detections", [])

        foto.imagen_anotada = nombre_anotada
        foto.detecciones = _agrupar_detecciones(raw_detections)
        foto.tiempo_inferencia_ms = round(resultados.get("inference_time_ms", 0), 2)
        foto.severidad = _calcular_severidad(raw_detections)
        foto.estado = FotoInspeccion.Estado.COMPLETADA
        foto.error_detalle = None
        foto.save(update_fields=[
            "imagen_anotada", "detecciones", "tiempo_inferencia_ms",
            "severidad", "estado", "error_detalle",
        ])
        logger.info(
            "Foto %s procesada (%.2f ms, severidad=%s, detecciones=%d)",
            foto_id, foto.tiempo_inferencia_ms, foto.severidad, len(raw_detections),
        )
        _notificar(foto)
        track_concurrent_end(foto_id)  # éxito: liberar slot

    except Exception as exc:
        logger.exception("Error procesando foto %s", foto_id)
        try:
            foto.refresh_from_db()
            foto.estado = FotoInspeccion.Estado.ERROR
            foto.error_detalle = str(exc)[:500]
            foto.save(update_fields=["estado", "error_detalle"])
            _notificar(foto)
        except Exception:
            logger.exception(
                "No se pudo persistir estado de error de foto %s", foto_id
            )

        # DLQ: liberar slot y enviar a dead letter si es fallo final.
        # IOError/OSError → autoretry_for reintenta hasta _MAX_RETRIES.
        # Cualquier otra excepción → no hay retry, es fallo terminal.
        is_retryable = isinstance(exc, (IOError, OSError))
        is_final = not is_retryable or self.request.retries >= _MAX_RETRIES
        if is_final:
            track_concurrent_end(foto_id)
            try:
                dead_letter.apply_async(
                    args=[foto_id, type(exc).__name__, str(exc)[:500], self.request.id],
                    queue="vision.dead",
                )
            except Exception:
                logger.exception("No se pudo enviar a DLQ (foto=%s)", foto_id)
        raise
