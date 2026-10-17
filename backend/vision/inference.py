"""
Adaptador de inferencia sobre ``core_engine.vision`` (nautic_core v3).

``core_engine`` ya cachea cada detector por modelo dentro del proceso: los
pesos se cargan **una sola vez** (servidor Django o worker Celery) y se
reutilizan en las inferencias subsiguientes. Por eso este módulo no mantiene
un singleton propio; sólo expone un punto de entrada estable para el resto de
``vision/`` (``run_inference``) y precarga el modelo al arrancar cada
subproceso del worker Celery, de modo que la primera tarea no paga la latencia
de inicialización.

Los pesos se resuelven con ``$NAUTIC_WEIGHTS_DIR/<archivo>`` (ver
``backend/.env.example``). Si no existen, ``FileNotFoundError`` lista las
rutas probadas.
"""
import logging
from typing import Any, Dict, Optional, Tuple

from celery.signals import worker_process_init
from django.conf import settings

logger = logging.getLogger(__name__)

# Umbral de confianza por defecto de la API de visión (el default calibrado de
# cada modelo en core_engine es distinto; aquí se conserva el histórico 0.25).
DEFAULT_CONFIDENCE = 0.25


def _modelo_id() -> str:
    """Id del modelo de ``core_engine`` a usar (``VISION_MODEL_ID``)."""
    return settings.VISION_MODEL_ID


def run_inference(
    image_bytes: bytes,
    confidence: Optional[float] = None,
    incluir_mascaras: bool = False,
) -> Tuple[bytes, Dict[str, Any]]:
    """Ejecuta inferencia + anotación sobre una imagen codificada.

    Args:
        image_bytes: imagen codificada (JPEG, PNG, ...).
        confidence: umbral mínimo de confianza; ``None`` usa
            ``DEFAULT_CONFIDENCE``.
        incluir_mascaras: si es ``False`` (default) elimina la máscara RLE de
            cada detección para mantener el payload liviano, igual que en v2.

    Returns:
        ``(jpeg_anotado, resultado)``. ``resultado`` es el dict de
        ``InferenceResult.to_dict()`` más la clave ``"model"``.

    Raises:
        FileNotFoundError: si los pesos del modelo no se encuentran.
        ValueError: imagen no decodificable o ``VISION_MODEL_ID`` desconocido.
    """
    from core_engine.vision import analyze

    if confidence is None:
        confidence = DEFAULT_CONFIDENCE

    anotada, resultado = analyze(
        image_bytes,
        model_id=_modelo_id(),
        confidence=confidence,
        annotate=True,
    )

    if not incluir_mascaras:
        for det in resultado.get("detections", []):
            det.pop("mask", None)

    return anotada, resultado


@worker_process_init.connect
def _precargar_modelo_en_worker(**_kwargs):
    """Precarga el modelo al arrancar cada proceso worker de Celery."""
    try:
        from core_engine.vision import get_detector

        modelo_id = _modelo_id()
        logger.info("Cargando modelo de visión '%s'", modelo_id)
        get_detector(modelo_id)
        logger.info("Modelo de visión '%s' cargado en memoria.", modelo_id)
    except Exception:
        logger.exception("Fallo precargando modelo de visión en worker")
        raise
