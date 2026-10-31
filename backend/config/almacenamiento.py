"""Selección del backend de almacenamiento por entorno.

``configurar_storages(os.environ)`` devuelve el diccionario ``STORAGES`` de
Django. El resto del código sólo usa ``default_storage``; no sabe si los
archivos viven en disco o en un bucket.

Variables de entorno
--------------------
``STORAGE_BACKEND``         ``local`` (por defecto) o ``s3``.

Sólo con ``s3``:

``S3_BUCKET``               Nombre del bucket (obligatorio).
``S3_ACCESS_KEY_ID``        Opcional. Si falta se usa la cadena de credenciales
``S3_SECRET_ACCESS_KEY``    por defecto de boto3 (rol IAM, ~/.aws, etc.).
``S3_ENDPOINT_URL``         Opcional. Para S3-compatibles (R2, MinIO, ...).
``S3_REGION``               Opcional.
``S3_LOCATION``             Opcional. Prefijo de claves dentro del bucket.
``S3_URL_EXPIRE_SECONDS``   Vigencia de las URL firmadas (por defecto 900).

Nunca se registran ni se incluyen en mensajes de error los valores de las
credenciales.
"""

from collections.abc import Mapping

from django.core.exceptions import ImproperlyConfigured

BACKEND_LOCAL = "local"
BACKEND_S3 = "s3"
BACKENDS_VALIDOS = (BACKEND_LOCAL, BACKEND_S3)

EXPIRACION_POR_DEFECTO = 900

_STATICFILES = {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}
_LOCAL = {"BACKEND": "django.core.files.storage.FileSystemStorage"}


def _valor(env: Mapping, nombre: str) -> str | None:
    """Valor de ``nombre`` sin espacios; cadena vacía cuenta como ausente."""
    valor = (env.get(nombre) or "").strip()
    return valor or None


def _expiracion(env: Mapping) -> int:
    crudo = _valor(env, "S3_URL_EXPIRE_SECONDS")
    if crudo is None:
        return EXPIRACION_POR_DEFECTO
    try:
        segundos = int(crudo)
    except ValueError:
        segundos = 0
    if segundos <= 0:
        raise ImproperlyConfigured(
            "S3_URL_EXPIRE_SECONDS debe ser un entero positivo (segundos)."
        )
    return segundos


def _s3(env: Mapping) -> dict:
    bucket = _valor(env, "S3_BUCKET")
    if bucket is None:
        raise ImproperlyConfigured(
            "STORAGE_BACKEND=s3 requiere S3_BUCKET (nombre del bucket)."
        )

    opciones = {
        "bucket_name": bucket,
        # Bucket privado: las fotos se sirven con URL firmadas que expiran.
        "querystring_auth": True,
        "querystring_expire": _expiracion(env),
        "default_acl": None,
        "file_overwrite": False,
        "signature_version": "s3v4",
    }

    access_key = _valor(env, "S3_ACCESS_KEY_ID")
    secret_key = _valor(env, "S3_SECRET_ACCESS_KEY")
    if bool(access_key) != bool(secret_key):
        raise ImproperlyConfigured(
            "S3_ACCESS_KEY_ID y S3_SECRET_ACCESS_KEY deben definirse juntas "
            "(o ninguna, para usar las credenciales por defecto de boto3)."
        )
    if access_key:
        opciones["access_key"] = access_key
        opciones["secret_key"] = secret_key

    for variable, opcion in (
        ("S3_ENDPOINT_URL", "endpoint_url"),
        ("S3_REGION", "region_name"),
        ("S3_LOCATION", "location"),
    ):
        valor = _valor(env, variable)
        if valor is not None:
            opciones[opcion] = valor

    return {"BACKEND": "storages.backends.s3.S3Storage", "OPTIONS": opciones}


def configurar_storages(env: Mapping) -> dict:
    """Construye ``settings.STORAGES`` a partir de variables de entorno.

    Lanza ``ImproperlyConfigured`` si la configuración es inválida, de modo que
    el proceso falle al arrancar y no al primer upload.
    """
    backend = (_valor(env, "STORAGE_BACKEND") or BACKEND_LOCAL).lower()
    if backend not in BACKENDS_VALIDOS:
        raise ImproperlyConfigured(
            f"STORAGE_BACKEND desconocido: {backend!r}. "
            f"Valores válidos: {', '.join(BACKENDS_VALIDOS)}."
        )
    default = _s3(env) if backend == BACKEND_S3 else dict(_LOCAL)
    return {"default": default, "staticfiles": dict(_STATICFILES)}
