"""Photo storage helpers.

Every inspection photo goes through ``default_storage``, so the same code runs
against the local disk in development and a bucket in production (see
``config.almacenamiento``). The database stores the *storage key*
(``inspecciones/originales/<uuid>.jpg``), never a URL and never a ``media/``
prefix; URLs are produced at response time by :func:`url_archivo`.

Never use ``open()`` / ``os.remove()`` / ``os.makedirs()`` on photo paths.
"""

import logging
import os
import uuid

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)

PREFIJO_ORIGINALES = "inspecciones/originales"
PREFIJO_ANOTADAS = "inspecciones/anotadas"


def clave_original(nombre_archivo: str) -> str:
    """Key for a new original photo; keeps the (lower-cased) extension of the upload."""
    extension = os.path.splitext(nombre_archivo or "")[1].lower() or ".jpg"
    return f"{PREFIJO_ORIGINALES}/{uuid.uuid4().hex}{extension}"


def clave_anotada(foto_id: int) -> str:
    """Key for the annotated image of ``foto_id``; the suffix avoids overwriting retries."""
    return f"{PREFIJO_ANOTADAS}/{foto_id}_{uuid.uuid4().hex[:8]}.jpg"


def guardar_original(archivo) -> str:
    """Stream an ``UploadedFile`` to storage and return the key actually stored.

    The returned name must be persisted: a backend may alter the requested key
    (e.g. to avoid a collision).
    """
    return default_storage.save(clave_original(archivo.name), archivo)


def guardar_anotada(foto_id: int, contenido: bytes) -> str:
    """Store the annotated JPEG bytes and return the key actually stored."""
    return default_storage.save(clave_anotada(foto_id), ContentFile(contenido))


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
    url = default_storage.url(clave)
    if request is not None and url.startswith("/"):
        return request.build_absolute_uri(url)
    return url
