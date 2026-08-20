import os
from pathlib import Path
from dotenv import load_dotenv
from kombu import Exchange, Queue

BASE_DIR = Path(__file__).resolve().parent.parent

# Carga variables desde .env en la raíz del proyecto (ignorado por git)
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv(
    "SECRET_KEY", "django-insecure-)metn&v=qwbgusvgpw8frdhrzw!g#)(oy*2k*4$$v#x_fzhz^("
)

DEBUG = os.getenv("DEBUG", "True") == "True"

ALLOWED_HOSTS = ["*"]  # Permitir todas las conexiones (en desarrollo)
X_FRAME_OPTIONS = "SAMEORIGIN"

# Aplicaciones instaladas
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",  # Para tus APIs
    "corsheaders",  # Para permitir llamadas desde React o cualquier origen
    "drf_spectacular",  # Documentación automática de API (OpenAPI 3)
    "api",  # App de negocio principal
    "vision",  # Módulo de visión artificial (nautic_core)
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",  # <---- Importante para CORS
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # "api.middleware.JWTAuthMiddleware",  # Deshabilitado en versión lite
]

ROOT_URLCONF = "backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],  # Aquí irán tus rondas.html y demás
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "backend.wsgi.application"

# settings.py
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME", "rondasdos"),
        "USER": os.getenv("DB_USER", "postgres"),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", "localhost"),
        "PORT": os.getenv("DB_PORT", "5432"),
        "OPTIONS": {
            # fuerza UTF-8 del lado de libpq
            "options": "-c client_encoding=UTF8"
        },
    }
}


# Configuración de archivos estáticos
STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]

# Configuración para archivos media (carga de imágenes como hacías en Flask)
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"  # Aquí se guardarán las imágenes cargadas por usuarios
# Configuración CORS para aceptar peticiones desde cualquier origen (útil para React)
# CORS_ALLOW_ALL_ORIGINS = True

# CORS (con credenciales)
# NO usar '*' cuando withCredentials=true
# -----------------------------
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    # Puertos alternos comunes en dev (cuando 3000 está ocupado)
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    # Vite y otras herramientas
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://10.230.0.33:3000",
    "http://192.168.93.79:3000",
    # agrega tu dominio en producci n, por ej. "https://tu-dominio.com"
]
# Si ten as CORS_ALLOW_ALL_ORIGINS=True, elim nalo para poder usar credenciales

# (Opcional, si haces POST desde el front a dominios externos)
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://10.230.0.33:3000",
    "http://192.168.93.79:3000",
]


# Cookies (Lax)   el login ya fija JWT con HttpOnly y SameSite=Lax

SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
# En dev (HTTP):
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
# En producci n (HTTPS) cambia ambos a True

# -----------------------------
# DRF — sin autenticación por defecto (usamos JWT propio en middleware)
# Evita CSRF derivado de SessionAuthentication
# -----------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# -----------------------------
# drf-spectacular — configuración de documentación OpenAPI 3
# Acceso: /api/docs/         → Swagger UI
#         /api/docs/redoc/   → ReDoc
#         /api/schema/       → esquema OpenAPI 3 en YAML/JSON
# -----------------------------
SPECTACULAR_SETTINGS = {
    "TITLE": "PSCV-Lite Nautic Module API",
    "DESCRIPTION": (
        "API REST del sistema de gestión de mantenimiento naval. "
        "Incluye módulos de rondas, equipos, buques, parámetros "
        "y visión artificial para detección de anomalías."
    ),
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "backend.spectacular_hooks.auto_tag_endpoints",
    ],
    "TAGS": [
        {
            "name": "Inspección IA",
            "description": "Inspección de casco con visión artificial (YOLO)",
        },
        {
            "name": "Visión Artificial",
            "description": "Detección de anomalías con YOLO (nautic_core) — inferencia directa",
        },
        {"name": "Buques", "description": "Gestión de buques"},
        {"name": "Equipos", "description": "Gestión de equipos"},
        {"name": "Rondas", "description": "Rondas de mantenimiento"},
        {"name": "Parámetros", "description": "Parámetros de equipos y subsistemas"},
        {
            "name": "Catálogos SWBS",
            "description": "Grupos, subgrupos, sistemas y subsistemas SWBS",
        },
        {"name": "Testing", "description": "Generación y limpieza de datos de prueba"},
    ],
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# Idioma y zona horaria
LANGUAGE_CODE = "es-co"
TIME_ZONE = "America/Bogota"
USE_I18N = True
USE_TZ = False  # Desactivar conversiones automáticas de timezone

# =============================================================================
# Celery — cola de tareas asíncronas (broker RabbitMQ)
# =============================================================================
# El broker se configura vía variable de entorno CELERY_BROKER_URL.
# Ejemplo dev: amqp://guest:guest@localhost:5672//
# Ejemplo prod: amqp://user:pass@rabbitmq.internal:5672/vhost
CELERY_BROKER_URL = os.getenv(
    "CELERY_BROKER_URL",
    "amqp://guest:guest@localhost:5672//",
)

# Sin result backend: el estado de cada foto vive en FotoInspeccion.estado
# (Postgres es la fuente de verdad). El frontend se entera de los cambios por
# SSE, no consultando el resultado de la tarea, así que un result backend sólo
# añadiría escrituras que nadie lee.
CELERY_RESULT_BACKEND = None
CELERY_TASK_IGNORE_RESULT = True

# Colas: vision (principal) + vision.dead (DLQ para tareas que agotan reintentos).
# vision usa x-dead-letter-exchange → RabbitMQ reencamina mensajes rechazados/expirados.
# IMPORTANTE: si la cola 'vision' ya existe sin DLX, borrarla antes de arrancar el worker:
#   rabbitmqctl delete_queue vision   (sin mensajes pendientes es seguro)
_dlx = Exchange("vision.dlx", type="direct")
_vision_exchange = Exchange("vision", type="direct")
CELERY_TASK_QUEUES = (
    Queue(
        "vision",
        exchange=_vision_exchange,
        routing_key="vision",
        queue_arguments={
            "x-dead-letter-exchange": "vision.dlx",
            "x-dead-letter-routing-key": "vision.dead",
        },
    ),
    Queue(
        "vision.dead",
        exchange=_dlx,
        routing_key="vision.dead",
    ),
)
CELERY_TASK_DEFAULT_QUEUE = "vision"
CELERY_TASK_DEFAULT_ROUTING_KEY = "vision"

# Serialización JSON (no pickle por seguridad).
CELERY_TASK_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_RESULT_SERIALIZER = "json"

# Prefetch = 1 → cada worker toma una tarea a la vez. Crítico para tareas
# largas de ML; evita que un worker acapare la cola mientras otros están libres.
CELERY_WORKER_PREFETCH_MULTIPLIER = 1

# acks_late + reject_on_worker_lost → si el worker muere a mitad de inferencia,
# RabbitMQ re-encola la tarea en otro worker. Idempotencia garantizada por la
# verificación de estado dentro de la tarea.
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True

# Time limits (segundos). Soft → SoftTimeLimitExceeded en la tarea; hard → SIGKILL.
CELERY_TASK_SOFT_TIME_LIMIT = 270
CELERY_TASK_TIME_LIMIT = 300

# Visibilidad: marca la tarea como STARTED al comenzar (útil para Flower/monitoreo).
CELERY_TASK_TRACK_STARTED = True

# Reintenta conexión al broker durante el boot (Celery 5.3+: silencia warning).
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

# Modo eager (síncrono) para tests/CI: setear CELERY_TASK_ALWAYS_EAGER=True en env.
CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "False") == "True"
CELERY_TASK_EAGER_PROPAGATES = True


# =============================================================================
# Redis — pub/sub para SSE (worker publica eventos, Django stream a frontend)
# =============================================================================
# Canal: vision:inspeccion:{id}
# Payload: JSON {foto_id, estado, severidad, detecciones, ...}
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Tiempo entre keepalives SSE (comentarios `:\n\n`). Mantiene viva la conexión
# detrás de proxies/load balancers con timeouts agresivos.
SSE_KEEPALIVE_SECONDS = int(os.getenv("SSE_KEEPALIVE_SECONDS", "15"))


# =============================================================================
# Rate limiting — controles por IP usando contadores Redis
# =============================================================================
# Uploads por minuto: ventana fija de 60 s. Protege contra flooding de disco.
VISION_RATE_LIMIT_UPLOADS_PER_MINUTE = int(
    os.getenv("VISION_RATE_LIMIT_UPLOADS_PER_MINUTE", "20")
)
# Máximo de fotos en proceso simultáneo por IP (pendiente + en_proceso en worker).
# Si se alcanza, nuevos disparos de análisis retornan 429 hasta que finalicen las actuales.
VISION_RATE_LIMIT_MAX_CONCURRENT = int(
    os.getenv("VISION_RATE_LIMIT_MAX_CONCURRENT", "10")
)


# Webhook configuration
N8N_WEBHOOK_URL = "http://localhost:5678/webhook/DELETE_DOCUMENT"
N8N_UPLOAD_WEBHOOK_URL = "http://localhost:5678/webhook/REDACTED"
WEBHOOK_TIMEOUT = 70


# Logging: asegurar salida por consola para desarrollo
import sys

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "stream": sys.stdout,
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": True,
        },
        # Mostrar solicitudes HTTP entrantes (nivel INFO)
        "django.request": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}
