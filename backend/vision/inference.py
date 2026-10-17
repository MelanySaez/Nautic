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
import os
from typing import Any, Dict, List, Optional, Tuple

from celery.signals import worker_init, worker_process_init
from django.conf import settings

logger = logging.getLogger(__name__)

# Umbral de confianza por defecto de la API de visión (el default calibrado de
# cada modelo en core_engine es distinto; aquí se conserva el histórico 0.25).
DEFAULT_CONFIDENCE = 0.25


def _modelo_id() -> str:
    """Id del modelo de ``core_engine`` a usar (``VISION_MODEL_ID``)."""
    return settings.VISION_MODEL_ID


def verificar_configuracion() -> List[str]:
    """Valida la configuración de inferencia sin cargar el modelo.

    Comprueba que ``VISION_MODEL_ID`` exista en el catálogo de ``core_engine``
    y que ``NAUTIC_WEIGHTS_DIR`` apunte a un directorio existente.

    Returns:
        Lista de mensajes de error; vacía si la configuración es válida.
    """
    errores = []

    modelo_id = _modelo_id()
    try:
        from core_engine.vision import available_models

        ids_validos = [m.id for m in available_models()]
    except Exception as e:
        errores.append(f"No se pudo cargar el catálogo de modelos de core_engine: {e}")
        ids_validos = None

    if ids_validos is not None and modelo_id not in ids_validos:
        errores.append(
            f"VISION_MODEL_ID='{modelo_id}' no existe en core_engine. "
            f"Valores válidos: {', '.join(ids_validos)}."
        )

    pesos_dir = os.getenv("NAUTIC_WEIGHTS_DIR")
    if not pesos_dir:
        errores.append(
            "NAUTIC_WEIGHTS_DIR no está definido. Debe apuntar al directorio "
            "con los pesos de los modelos (ver backend/.env.example)."
        )
    elif not os.path.isdir(pesos_dir):
        errores.append(
            f"NAUTIC_WEIGHTS_DIR='{pesos_dir}' no es un directorio existente."
        )

    return errores


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


@worker_init.connect
def _validar_configuracion_en_worker(**_kwargs):
    """Aborta el arranque del worker si la configuración es inválida.

    Corre en el proceso principal, antes de crear los subprocesos: un fallo
    aquí detiene el worker con un mensaje claro en lugar de dejar al pool
    reiniciando subprocesos que fallan en ``worker_process_init``.
    """
    errores = verificar_configuracion()
    if errores:
        for error in errores:
            logger.error(error)
        # SystemExit (BaseException) y no RuntimeError: Signal.send de Celery
        # captura y sólo registra cualquier Exception de los receivers.
        raise SystemExit(
            "Configuración de visión inválida: " + " ".join(errores)
        )


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
