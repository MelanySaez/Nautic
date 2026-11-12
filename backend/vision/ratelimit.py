"""
Rate limiting para el módulo de visión, basado en Redis.

Dos controles independientes:

1. Fixed-window 60 s por IP (upload):
   Max VISION_RATE_LIMIT_UPLOADS_PER_MINUTE cargas por minuto.
   Previene flooding de disco por carga masiva accidental.
   La ventana arranca con la primera carga y expira 60 s después, así que en
   el peor caso (final de una ventana + inicio de la siguiente) admite hasta
   2× el límite en un intervalo corto. Aceptable para este uso.

2. Concurrent tracker por IP (dispatch):
   Max VISION_RATE_LIMIT_MAX_CONCURRENT fotos activas simultáneas.
   Previene que un usuario sature el worker Celery y bloquee a otros.
   - track_concurrent_start  → se llama al disparar la tarea (vista)
   - track_concurrent_end    → se llama al finalizar la tarea (worker)
   El enlace foto→IP se guarda en Redis con TTL de 2 h.

Ambos controles fallan abiertos (fail-open) si Redis no responde,
para no bloquear la operación por indisponibilidad del cache.
"""
import logging

from django.conf import settings

from .pubsub import get_redis

logger = logging.getLogger(__name__)

_KEY_UPLOAD = "rl:upload:{ip}"
_KEY_ACTIVE = "rl:active:{ip}"
_KEY_IP_MAP = "rl:foto_ip:{foto_id}"
_ACTIVE_TTL = 3600   # safety TTL para entradas huérfanas (1 h)
_IP_MAP_TTL = 7200   # 2 h — mayor que CELERY_TASK_TIME_LIMIT (300 s)


def get_client_ip(request) -> str:
    """Extrae IP real del cliente respetando X-Forwarded-For (proxies/nginx)."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "127.0.0.1")


def check_upload_rate(ip: str) -> tuple[bool, str | None]:
    """
    Ventana fija de 60 s (INCR + EXPIRE en el primer hit).
    Retorna (permitido, mensaje_error). Falla abierto si Redis no responde.
    """
    limit = getattr(settings, "VISION_RATE_LIMIT_UPLOADS_PER_MINUTE", 20)
    try:
        client = get_redis()
        key = _KEY_UPLOAD.format(ip=ip)
        count = client.incr(key)
        if count == 1:
            client.expire(key, 60)
        if count > limit:
            return False, (
                f"Límite de {limit} cargas por minuto alcanzado. "
                "Intenta en breve."
            )
        return True, None
    except Exception:
        logger.exception("Rate limit error (upload check) ip=%s", ip)
        return True, None  # fail-open


def track_concurrent_start(ip: str, foto_id: int) -> tuple[bool, str | None]:
    """
    Registra el inicio de procesamiento de una foto.
    Agrega foto_id al set activo del IP y guarda el mapeo foto→IP en Redis.
    Retorna (permitido, mensaje_error). No agrega si ya se superó el límite.
    """
    limit = getattr(settings, "VISION_RATE_LIMIT_MAX_CONCURRENT", 10)
    try:
        client = get_redis()
        active_key = _KEY_ACTIVE.format(ip=ip)
        ip_map_key = _KEY_IP_MAP.format(foto_id=foto_id)

        if client.scard(active_key) >= limit:
            return False, (
                f"Máximo de {limit} imágenes en proceso simultáneo. "
                "Espera a que finalicen las actuales."
            )

        client.sadd(active_key, str(foto_id))
        client.expire(active_key, _ACTIVE_TTL)
        client.set(ip_map_key, ip, ex=_IP_MAP_TTL)
        return True, None
    except Exception:
        logger.exception(
            "Rate limit error (concurrent start) ip=%s foto=%s", ip, foto_id
        )
        return True, None  # fail-open


def track_concurrent_end(foto_id: int) -> None:
    """
    Registra el fin de procesamiento de una foto.
    Llamar desde la tarea Celery al terminar (éxito, error final, o skip).
    No lanza excepción — falla silenciosamente para no interrumpir el worker.
    """
    try:
        client = get_redis()
        ip_map_key = _KEY_IP_MAP.format(foto_id=foto_id)
        ip = client.get(ip_map_key)
        if ip:
            client.srem(_KEY_ACTIVE.format(ip=ip), str(foto_id))
            client.delete(ip_map_key)
    except Exception:
        logger.exception("Rate limit error (concurrent end) foto=%s", foto_id)
