"""
Singleton del ImageProcessor de ``nautic_core``.

El modelo YOLO se carga **una sola vez por proceso** (servidor Django o worker
Celery) y se reutiliza para todas las inferencias subsiguientes. Esto evita
el coste de recargar el modelo desde disco en cada petición/tarea.

En workers Celery (pool prefork) la señal ``worker_process_init`` precarga el
modelo al arrancar cada subproceso, de modo que la primera tarea no paga la
latencia de inicialización.
"""
import logging
from threading import Lock
from typing import Optional

from celery.signals import worker_process_init
from core_engine import ImageProcessor

logger = logging.getLogger(__name__)

DEFAULT_CONFIDENCE = 0.25
DEFAULT_IOU = 0.45

_processor: Optional[ImageProcessor] = None
_lock = Lock()


def get_processor() -> ImageProcessor:
    """Devuelve la instancia única de ``ImageProcessor``.

    Thread-safe: si dos hilos intentan inicializar a la vez, sólo uno carga
    el modelo y el otro reutiliza la instancia ya creada.
    """
    global _processor
    if _processor is None:
        with _lock:
            if _processor is None:
                logger.info(
                    "Cargando modelo YOLO (ImageProcessor) — conf=%s iou=%s",
                    DEFAULT_CONFIDENCE,
                    DEFAULT_IOU,
                )
                _processor = ImageProcessor(
                    confidence_threshold=DEFAULT_CONFIDENCE,
                    iou_threshold=DEFAULT_IOU,
                )
                logger.info("Modelo YOLO cargado en memoria.")
    return _processor


@worker_process_init.connect
def _precargar_modelo_en_worker(**_kwargs):
    """Precarga el modelo al arrancar cada proceso worker de Celery."""
    try:
        get_processor()
    except Exception:
        logger.exception("Fallo precargando modelo YOLO en worker")
        raise
