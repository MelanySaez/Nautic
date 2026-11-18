"""Photo storage helpers.

Every inspection photo goes through ``default_storage``, so the same code runs
against the local disk in development and a bucket in production (see
``config.almacenamiento``). The database stores the *storage key*
(``inspecciones/originales/<uuid>.jpg``), never a URL and never a ``media/``
prefix; URLs are produced at response time by :func:`url_archivo`.

Never use ``open()`` / ``os.remove()`` / ``os.makedirs()`` on photo paths.
"""

import hashlib
import logging
import os
import time
import uuid

from django.core.cache import caches
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)

PREFIJO_ORIGINALES = "inspecciones/originales"
PREFIJO_ANOTADAS = "inspecciones/anotadas"
PREFIJO_DETECCIONES = "inspecciones/detecciones"

# Cache shared by Django and the Celery worker (Redis), see settings.CACHES.
CACHE_COMPARTIDA = "compartida"
# Seconds the shared cache is skipped after a failure (see _pausar_cache).
PAUSA_CACHE_SEGUNDOS = 30
_cache_en_pausa_hasta = 0.0
# S3Storage options a signed URL depends on; part of its cache key.
_ALCANCE_FIRMA = (
    "bucket_name", "endpoint_url", "custom_domain", "region_name", "location",
    "signature_version", "addressing_style", "querystring_expire", "access_key",
)


def clave_original(nombre_archivo: str) -> str:
    """Key for a new original photo; keeps the (lower-cased) extension of the upload."""
    extension = os.path.splitext(nombre_archivo or "")[1].lower() or ".jpg"
    return f"{PREFIJO_ORIGINALES}/{uuid.uuid4().hex}{extension}"


def clave_anotada(foto_id: int) -> str:
    """Key for the annotated image of ``foto_id``; the suffix avoids overwriting retries."""
    return f"{PREFIJO_ANOTADAS}/{foto_id}_{uuid.uuid4().hex[:8]}.jpg"


def clave_detecciones(foto_id: int) -> str:
    """Key for the raw detections JSON of ``foto_id``; the suffix avoids overwriting re-analyses."""
    return f"{PREFIJO_DETECCIONES}/{foto_id}_{uuid.uuid4().hex[:8]}.json"


def guardar_original(archivo) -> str:
    """Stream an ``UploadedFile`` to storage and return the key actually stored.

    The returned name must be persisted: a backend may alter the requested key
    (e.g. to avoid a collision).
    """
    return default_storage.save(clave_original(archivo.name), archivo)


def guardar_anotada(foto_id: int, contenido: bytes) -> str:
    """Store the annotated JPEG bytes and return the key actually stored."""
    return default_storage.save(clave_anotada(foto_id), ContentFile(contenido))


def guardar_detecciones(foto_id: int, contenido: bytes) -> str:
    """Store the raw detections JSON bytes and return the key actually stored."""
    return default_storage.save(clave_detecciones(foto_id), ContentFile(contenido))


def leer_archivo(clave: str) -> bytes:
    """Read a stored file fully into memory (the inference step needs the bytes)."""
    with default_storage.open(clave, "rb") as fh:
        return fh.read()


def borrar_archivo(clave) -> bool:
    """Delete a stored file; never raises.

    A storage failure is logged and reported as ``False`` so that deleting a
    record is not blocked (or turned into a 500) by an unreachable backend.
    """
    if not clave:
        return False
    try:
        default_storage.delete(clave)
        return True
    except Exception:
        logger.exception("No se pudo borrar el archivo almacenado %s", clave)
        return False


def url_archivo(clave, request=None):
    """URL for a stored file, or ``None`` when there is no key.

    Local storage yields a relative URL (``/media/<key>``), made absolute when
    a request is available. Remote backends already return absolute (signed)
    URLs, which are passed through untouched.
    """
    if not clave:
        return None
    url = _url_firmada(clave) if _vigencia_firma() else default_storage.url(clave)
    if request is not None and url.startswith("/"):
        return request.build_absolute_uri(url)
    return url


def _vigencia_firma():
    """Lifetime in seconds of the storage's signed URLs, or ``None`` when it does not sign them."""
    if not getattr(default_storage, "querystring_auth", False):
        return None
    return getattr(default_storage, "querystring_expire", None) or None


def _llave_url_firmada(clave):
    """Cache key of a signed URL: the object key plus everything the signature depends on.

    Changing any storage option that shapes the signed URL starts from fresh
    URLs instead of serving ones signed for the previous configuration.
    """
    alcance = "|".join(str(getattr(default_storage, atributo, "") or "") for atributo in _ALCANCE_FIRMA)
    return "url-firmada:" + hashlib.sha256(f"{alcance}|{clave}".encode()).hexdigest()


def _cache_en_pausa():
    return time.monotonic() < _cache_en_pausa_hasta


def _pausar_cache(mensaje):
    """After a cache failure, skip the cache for a while: an unreachable Redis would
    otherwise cost its timeout on every URL of a response."""
    global _cache_en_pausa_hasta
    logger.warning(mensaje, exc_info=True)
    _cache_en_pausa_hasta = time.monotonic() + PAUSA_CACHE_SEGUNDOS


def _url_firmada(clave):
    """Signed URL of ``clave``, reused while it has at least half its lifetime left.

    A fresh signature on every response changes the URL, so the browser would
    download the same photo again on every visit. The shared cache (Redis) also
    covers the URLs the Celery worker puts in SSE events. A cache failure only
    costs a fresh signature.
    """
    if _cache_en_pausa():
        return default_storage.url(clave)
    llave = _llave_url_firmada(clave)
    try:
        url = caches[CACHE_COMPARTIDA].get(llave)
    except Exception:
        _pausar_cache("No se pudo leer la cache de URL firmadas")
        return default_storage.url(clave)
    if url:
        return url
    url = default_storage.url(clave)
    try:
        caches[CACHE_COMPARTIDA].set(llave, url, _vigencia_firma() // 2)
    except Exception:
        _pausar_cache("No se pudo guardar la URL firmada en la cache")
    return url
