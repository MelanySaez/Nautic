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
rutas probadas. La disponibilidad de cada modelo (pesos y dependencias) se
consulta con la API pública ``model_availability`` / ``models_availability``
de ``core_engine`` (nautic_core v3.1), que no carga ningún framework de ML.
"""
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from celery.signals import worker_init, worker_process_init
from core_engine.vision import (
    ModelAvailability, model_availability, models_availability,
)
from django.conf import settings

logger = logging.getLogger(__name__)

# Umbral que usa el endpoint directo ``/api/ai/anomalias/`` cuando el cliente no
# envía ``confidence``. El pipeline de inspecciones no lo usa: ahí cada modelo
# aplica su propio umbral calibrado (``ModelInfo.default_confidence``).
DEFAULT_CONFIDENCE = 0.25


def _modelo_id() -> str:
    """Id del modelo de ``core_engine`` a usar (``VISION_MODEL_ID``)."""
    return settings.VISION_MODEL_ID


def modelo_por_defecto() -> str:
    """Id del modelo que se usa cuando la petición no elige uno."""
    return _modelo_id()


def _disponibilidad(model_id: str) -> Optional[ModelAvailability]:
    """Disponibilidad de un modelo según ``core_engine``.

    ``model_availability`` no importa torch ni ultralytics ni carga pesos.

    Returns:
        ``None`` si el id no existe en el catálogo: no hay nada que verificar y
        se trata como disponible (``ids_modelos()`` es quien valida los ids).
    """
    try:
        return model_availability(model_id)
    except ValueError:
        return None


def _mensaje_no_disponible(estado: ModelAvailability) -> str:
    """Mensaje en español, apto para el cliente, de lo que le falta a un modelo.

    Sólo usa nombres (pesos y módulos) y el ``install_hint`` de ``core_engine``;
    nunca rutas del servidor.
    """
    partes = []
    if estado.missing_weights:
        partes.append(
            "Faltan los pesos del modelo en el servidor: "
            + ", ".join(estado.missing_weights) + "."
        )
    if estado.missing_modules:
        parte = (
            "Faltan dependencias del modelo en el servidor: "
            + ", ".join(estado.missing_modules) + "."
        )
        if estado.install_hint:
            parte += f" Instalación: {estado.install_hint}."
        partes.append(parte)
    return " ".join(partes) or "El modelo no está disponible en el servidor."


def motivo_no_disponible(model_id: str) -> Optional[str]:
    """Por qué un modelo no puede ejecutarse en este servidor.

    Delega en ``core_engine.vision.model_availability`` (pesos y módulos
    requeridos), que no carga ningún framework de ML.

    Returns:
        ``None`` si el modelo está disponible (o el id no existe en el
        catálogo); si no, un mensaje corto en español, apto para el cliente
        (nombres de pesos y módulos, sin rutas del servidor).
    """
    estado = _disponibilidad(model_id)
    if estado is None or estado.available:
        return None
    logger.debug(
        "Modelo '%s' no disponible: pesos=%s módulos=%s",
        model_id, estado.missing_weights, estado.missing_modules,
    )
    return _mensaje_no_disponible(estado)


def modelo_disponible(model_id: str) -> bool:
    """``True`` si el modelo tiene pesos y dependencias en este servidor."""
    return motivo_no_disponible(model_id) is None


def ids_modelos() -> List[str]:
    """Ids del catálogo de ``core_engine``, en el orden del catálogo."""
    from core_engine.vision import available_models

    return [m.id for m in available_models()]


def severidad_por_clase() -> Dict[str, str]:
    """Severidad de cada clase de anomalía según la taxonomía de ``core_engine``.

    Las clases de componente (casco, hélice, ánodo...) no tienen severidad y no
    aparecen. Importar la taxonomía no carga torch ni ultralytics.
    """
    from core_engine.vision.domain import severity_map

    return severity_map()


def listar_modelos() -> List[Dict[str, Any]]:
    """Catálogo de modelos para el cliente, en el orden de ``core_engine``.

    Cada elemento lleva la descripción del modelo, ``por_defecto`` (es el de
    ``VISION_MODEL_ID``) y ``disponible`` (pesos y dependencias presentes).
    """
    from core_engine.vision import available_models

    por_defecto = modelo_por_defecto()
    disponibles = {a.model_id: a.available for a in models_availability()}
    return [
        {
            "id": m.id,
            "label": m.label,
            "descripcion": m.description,
            "arquitectura": m.architecture,
            "version": m.version,
            "produce_mascaras": m.produces_masks,
            "confianza_por_defecto": m.default_confidence,
            "por_defecto": m.id == por_defecto,
            "disponible": disponibles.get(m.id, True),
        }
        for m in available_models()
    ]


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
    model_id: Optional[str] = None,
) -> Tuple[bytes, Dict[str, Any]]:
    """Ejecuta inferencia + anotación sobre una imagen codificada.

    Args:
        image_bytes: imagen codificada (JPEG, PNG, ...).
        confidence: umbral mínimo de confianza; ``None`` deja que el modelo
            use su propio umbral calibrado (``ModelInfo.default_confidence``).
        incluir_mascaras: si es ``False`` (default) elimina la máscara RLE de
            cada detección para mantener el payload liviano, igual que en v2.
        model_id: id del modelo de ``core_engine``; ``None`` usa
            ``VISION_MODEL_ID``.

    Returns:
        ``(jpeg_anotado, resultado)``. ``resultado`` es el dict de
        ``InferenceResult.to_dict()`` más la clave ``"model"``.

    Raises:
        FileNotFoundError: si los pesos del modelo no se encuentran.
        ValueError: imagen no decodificable o modelo desconocido.
    """
    from core_engine.vision import analyze

    anotada, resultado = analyze(
        image_bytes,
        model_id=model_id or _modelo_id(),
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
