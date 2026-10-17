"""
Cliente Redis pub/sub para notificación SSE.

Worker Celery publica eventos al terminar una foto; el endpoint SSE de Django
se suscribe al canal y empuja los mensajes al browser sobre ``text/event-stream``.

Canal por inspección: ``vision:inspeccion:{inspeccion_id}``
Canal global (no usado aún): ``vision:eventos``
"""
import json
import logging
from typing import Any, Optional

import redis
from django.conf import settings

logger = logging.getLogger(__name__)

_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    """Cliente Redis singleton (lazy). decode_responses=True → strings, no bytes."""
    global _client
    if _client is None:
        _client = redis.Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_keepalive=True,
            health_check_interval=30,
        )
    return _client


def canal_inspeccion(inspeccion_id: int) -> str:
    return f"vision:inspeccion:{inspeccion_id}"


def publicar_evento(
    inspeccion_id: int,
    event: str,
    data: dict[str, Any],
) -> None:
    """Publica un evento tipado al canal de la inspección.

    El payload que viaja en Redis tiene la forma::

        {"event": "<tipo>", "data": {...}}

    El endpoint SSE lo desempaqueta y emite ``event: <tipo>`` al browser.

    No falla la operación de negocio si Redis está caído — sólo loguea.
    """
    wrapped = {"event": event, "data": data}
    try:
        client = get_redis()
        client.publish(canal_inspeccion(inspeccion_id), json.dumps(wrapped))
    except Exception:
        logger.exception(
            "Fallo publicando evento SSE (inspeccion=%s event=%s)",
            inspeccion_id, event,
        )


def suscribirse(inspeccion_id: int) -> redis.client.PubSub:
    """Devuelve un PubSub suscrito al canal de la inspección.

    Uso típico::

        ps = suscribirse(insp_id)
        for msg in ps.listen():
            if msg['type'] == 'message':
                yield msg['data']
    """
    ps = get_redis().pubsub(ignore_subscribe_messages=True)
    ps.subscribe(canal_inspeccion(inspeccion_id))
    return ps
