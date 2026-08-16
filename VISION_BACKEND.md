# Vision Module — Backend Technical Reference

Stack: Django 5.1 · Celery 5.4 · RabbitMQ (AMQP) · Redis · PostgreSQL · nautic_core (YOLO)

---

## Arquitectura general

```
Cliente HTTP
    │
    ▼
Django views (vision/views.py)
    │  Upload foto → guarda en disco → publica foto-created (Redis)
    │  POST analizar → rate limit → procesar_foto.apply_async(kwargs={"foto_id": foto_id}) → RabbitMQ
    │  GET stream/ → StreamingHttpResponse (SSE) ← Redis SUBSCRIBE
    │
    ▼
RabbitMQ cola: vision
    │
    ▼
Celery worker (vision/tasks.py)
    │  Carga modelo una vez por proceso (worker_process_init)
    │  Lee imagen → valida → ImageProcessor.process_and_visualize()
    │  Guarda imagen anotada → actualiza Postgres → publica evento Redis
    │
    ▼
Redis canal: vision:inspeccion:{id}
    │
    ▼
SSE endpoint → browser (EventSource)
```

---

## Modelos de datos (`vision/models.py`)

### `SeccionCasco`
Catálogo estático de zonas físicas del casco. Aplica a todos los buques.

| Campo | Tipo | Descripción |
|---|---|---|
| `codigo` | CharField(20) unique | Identificador corto: `FWD-BTM`, `MID-SS-P` |
| `nombre` | CharField(100) | Nombre legible: `Fondo - Proa` |
| `descripcion` | TextField | Descripción extendida (opcional) |
| `orden` | IntegerField | Orden de presentación en la UI |

Tabla: `seccion_casco`. Ordenada por `orden, codigo`.

### `InspeccionCasco`
Sesión de inspección: agrupa fotos de una misma campaña sobre un buque.

| Campo | Tipo | Descripción |
|---|---|---|
| `buque` | FK → `api.Buque` | Embarcación inspeccionada (CASCADE) |
| `descripcion` | TextField | Contexto libre de la campaña |
| `tomado_por` | CharField(255) | Nombre del inspector |
| `fecha_creacion` | DateTimeField | Auto (auto_now_add) |
| `fecha_modificacion` | DateTimeField | Auto (auto_now) |

Tabla: `inspeccion_casco`. Ordenada por `-fecha_creacion`.

### `FotoInspeccion`
Foto individual analizada por YOLO. Máquina de estados asíncrona.

| Campo | Tipo | Descripción |
|---|---|---|
| `inspeccion` | FK → InspeccionCasco | Inspección padre (CASCADE) |
| `seccion` | FK → SeccionCasco | Zona del casco (PROTECT) |
| `imagen_original` | CharField(500) | Path relativo desde `BASE_DIR`: `media/inspecciones/originales/...` |
| `imagen_anotada` | CharField(500) null | Path relativo de la imagen con bounding boxes |
| `detecciones` | JSONField null | Lista colapsada por clase: `[{class_name, count, max_confidence}]` |
| `tiempo_inferencia_ms` | FloatField null | Tiempo de inferencia reportado por nautic_core |
| `severidad` | CharField(20) null | `critical` / `high` / `medium` / `low` |
| `estado` | CharField(20) | Estado actual (ver máquina de estados) |
| `error_detalle` | CharField(500) null | Mensaje de error si `estado=error` |
| `fecha_creacion` | DateTimeField | Auto (auto_now_add) |

**Máquina de estados `FotoInspeccion.Estado`:**
```
pendiente → en_proceso → completada
                       ↘ error → (pendiente si se reintenta)
```

**Estructura `detecciones` (JSONField):**
```json
[
  {"class_name": "corrosion", "count": 2, "max_confidence": 0.924},
  {"class_name": "paint_peel", "count": 1, "max_confidence": 0.761}
]
```

---

## API Endpoints (`vision/urls.py`)

Todos bajo prefijo base de `backend/urls.py`.

| Método | URL | Vista | Descripción |
|--------|-----|-------|-------------|
| POST | `/api/ai/anomalias/` | `api_ai_anomalias` | Inferencia directa sin persistencia (retorna imagen JPEG o JSON con base64) |
| GET | `/api/vision/secciones/` | `api_vision_secciones` | Catálogo completo de secciones del casco |
| GET | `/api/vision/inspecciones/` | `api_vision_inspecciones` | Lista inspecciones (`?buque_id=` opcional) |
| POST | `/api/vision/inspecciones/` | `api_vision_inspecciones` | Crear inspección (`buque_id`, `descripcion`, `tomado_por`) |
| GET | `/api/vision/inspecciones/<id>/` | `api_vision_inspeccion_detalle` | Detalle con fotos anidadas |
| DELETE | `/api/vision/inspecciones/<id>/` | `api_vision_inspeccion_detalle` | Elimina inspección y archivos físicos |
| POST | `/api/vision/inspecciones/<id>/fotos/` | `api_vision_subir_foto` | Sube foto (multipart: `imagen`, `seccion_id`) → HTTP 202 |
| GET | `/api/vision/fotos/<id>/` | `api_vision_foto_detalle` | Estado y resultado de una foto |
| POST | `/api/vision/fotos/<id>/` | `api_vision_foto_detalle` | Disparar análisis (estado `pendiente` o `error`) |
| DELETE | `/api/vision/fotos/<id>/` | `api_vision_foto_detalle` | Elimina foto y archivos físicos |
| POST | `/api/vision/inspecciones/<id>/analizar/` | `api_vision_analizar_inspeccion` | Disparar YOLO para todas las fotos `pendiente` |
| GET | `/api/vision/inspecciones/<id>/stream/` | `api_vision_inspeccion_stream` | Stream SSE (text/event-stream) |

### Endpoint SSE — `/api/vision/inspecciones/<id>/stream/`

Implementado con `StreamingHttpResponse` (view Django pura, no DRF — incompatibilidad con `@api_view`). No usa `Connection: keep-alive` (prohibido en WSGI como hop-by-hop header). Headers de respuesta:

```
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no   ← deshabilita buffering de nginx
```

Handshake al conectar:
```
event: ready
data: {"inspeccion_id": 1, "ts": 1715000000}

retry: 5000
```

Keepalive cada `SSE_KEEPALIVE_SECONDS` (default 15s):
```
:keepalive
```

---

## Celery + RabbitMQ (`backend/celery.py`, `backend/settings.py`)

### Configuración de colas

```python
CELERY_TASK_QUEUES = (
    Queue("vision",                         # cola principal
        exchange=Exchange("vision"),
        routing_key="vision",
        queue_arguments={
            "x-dead-letter-exchange":     "vision.dlx",
            "x-dead-letter-routing-key":  "vision.dead",
        },
    ),
    Queue("vision.dead",                    # Dead Letter Queue
        exchange=Exchange("vision.dlx", type="direct"),
        routing_key="vision.dead",
    ),
)
```

> **Nota de migración**: si la cola `vision` ya existía sin DLX, hay que borrarla antes de arrancar el worker:  
> `sudo rabbitmqctl delete_queue vision`  
> RabbitMQ rechaza redeclaración con argumentos distintos (`PRECONDITION_FAILED`).

### Parámetros clave

| Setting | Valor | Propósito |
|---|---|---|
| `CELERY_BROKER_URL` | `amqp://guest:guest@localhost:5672//` | Broker RabbitMQ |
| `CELERY_RESULT_BACKEND` | `None` | Sin result backend — Postgres es fuente de verdad |
| `CELERY_TASK_IGNORE_RESULT` | `True` | No persiste resultados en broker |
| `CELERY_WORKER_PREFETCH_MULTIPLIER` | `1` | Worker toma 1 tarea a la vez (crítico para tareas largas ML) |
| `CELERY_TASK_ACKS_LATE` | `True` | Ack después de completar (no al recibir) |
| `CELERY_TASK_REJECT_ON_WORKER_LOST` | `True` | Nack si el worker muere; RabbitMQ reencola |
| `CELERY_TASK_SOFT_TIME_LIMIT` | `270` s | Lanza `SoftTimeLimitExceeded` |
| `CELERY_TASK_TIME_LIMIT` | `300` s | SIGKILL al proceso |
| `CELERY_TASK_TRACK_STARTED` | `True` | Flower muestra estado STARTED |
| `CELERY_TASK_ALWAYS_EAGER` | `False` (env) | `True` para tests/CI sin broker |

### Arranque del worker

```bash
celery -A backend worker -Q vision -l info --concurrency=2 --pool=prefork
```

`--concurrency=2` = 2 procesos, cada uno con el modelo YOLO cargado una vez.

---

## Singleton del modelo YOLO (`vision/inference.py`)

```python
_processor: Optional[ImageProcessor] = None
_lock = Lock()

def get_processor() -> ImageProcessor:
    if _processor is None:
        with _lock:          # double-checked locking
            if _processor is None:
                _processor = ImageProcessor(
                    confidence_threshold=DEFAULT_CONFIDENCE,
                    iou_threshold=DEFAULT_IOU,
                )
    return _processor

@worker_process_init.connect
def _precargar_modelo_en_worker(**_kwargs):
    get_processor()          # warm-up al arrancar el proceso
```

La señal `worker_process_init` garantiza que la primera tarea no paga la latencia de carga del modelo YOLO. El patrón double-checked locking protege contra inicialización concurrente en el proceso Django (servidor de desarrollo).

Umbrales por defecto exportados como constantes:
- `DEFAULT_CONFIDENCE = 0.25`
- `DEFAULT_IOU = 0.45`

---

## Tarea principal (`vision/tasks.py`)

### `procesar_foto(self, foto_id: int)`

```python
@shared_task(
    bind=True,
    name="vision.procesar_foto",
    autoretry_for=(IOError, OSError),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    retry_kwargs={"max_retries": 3},
)
```

**Flujo:**

1. Fetch `FotoInspeccion` por PK — si no existe, `track_concurrent_end` + return
2. Idempotencia: si `estado == COMPLETADA`, `track_concurrent_end` + return (re-delivery por `acks_late`)
3. Marca `EN_PROCESO` → save → publica `foto-updated`
4. Lee bytes desde disco (`imagen_original`)
5. Valida integridad con `PIL.Image.open().verify()`
6. Delega a `asyncio.run(ImageProcessor.process_and_visualize(imagen_bytes))` → `(bytes_anotada, resultados)` — `asyncio.run` necesario porque `process_and_visualize` es una corrutina (`async def`) ejecutada desde el contexto síncrono del worker Celery
7. Persiste imagen anotada en `media/inspecciones/anotadas/{foto_id}_{uuid8}.jpg`
8. Agrupa detecciones por clase (`_agrupar_detecciones`)
9. Calcula severidad máxima (`_calcular_severidad`)
10. Marca `COMPLETADA` → save → publica `foto-updated` → `track_concurrent_end`

**En excepción:**
- Marca `ERROR` con `error_detalle[:500]`
- Detecta si es fallo final:
  - `IOError/OSError` con `retries >= 3` → final
  - Cualquier otra excepción → siempre final (no en `autoretry_for`)
- Si final: `track_concurrent_end` + `dead_letter.apply_async(queue="vision.dead")`
- Re-lanza la excepción (permite a `autoretry_for` reintentar si corresponde)

### `dead_letter(foto_id, error_type, error_detail, original_task_id)`

```python
@shared_task(name="vision.dead_letter", ignore_result=True)
```

Registra en log de nivel ERROR con formato estructurado. Visible en Flower como tarea en cola `vision.dead`. Para reencolar manualmente:

```python
from vision.tasks import procesar_foto
procesar_foto.apply_async(kwargs={"foto_id": 42})
```

### Helpers internos

**`_calcular_severidad(detections)`** — Retorna el nivel más crítico entre todas las detecciones:

| Clase | Severidad |
|---|---|
| `corrosion` | `critical` |
| `defect` | `high` |
| `marine_growth` | `medium` |
| `paint_peel` | `low` |

Clases estructurales (`ship_hull`, `propeller`, `bilge_keel`, `anode`, etc.) no tienen severidad asignada.

**`_agrupar_detecciones(detections)`** — Colapsa lista raw de detecciones YOLO a una entrada por clase única con `count` y `max_confidence`.

**`_notificar(foto)`** — Publica `foto-updated` al canal Redis de la inspección con el estado completo de la foto.

---

## Redis pub/sub (`vision/pubsub.py`)

### Canal de notificación

```
vision:inspeccion:{inspeccion_id}
```

### Envelope de mensaje

Todo evento publicado sigue el formato:
```json
{
  "event": "foto-updated",
  "data": { ... }
}
```

El endpoint SSE desempaqueta el envelope y emite `event: foto-updated` al browser.

### Eventos publicados

| Evento | Publicado desde | Payload `data` |
|--------|----------------|----------------|
| `foto-created` | `api_vision_subir_foto` | `{"foto": {foto_dict completo}}` |
| `foto-updated` | `procesar_foto` task (×2: EN_PROCESO + COMPLETADA/ERROR) | `{foto_id, inspeccion_id, estado, severidad, detecciones, tiempo_inferencia_ms, imagen_anotada, error_detalle}` |
| `foto-deleted` | `api_vision_foto_detalle` DELETE | `{foto_id, inspeccion_id}` |

### Cliente Redis singleton

```python
_client: Optional[redis.Redis] = None

def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_keepalive=True,
            health_check_interval=30,
        )
    return _client
```

`decode_responses=True` → todos los valores retornan como `str`, no `bytes`.

Configuración: `REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")`

---

## Rate limiting (`vision/ratelimit.py`)

Basado en Redis. Falla abierto (fail-open) si Redis no responde — la operación continúa.

### Control 1: Fixed-window counter de uploads por IP

```
Clave Redis: rl:upload:{ip}
TTL: 60 segundos
Operación: INCR (contador atómico)
```

- Límite: `VISION_RATE_LIMIT_UPLOADS_PER_MINUTE` (default: 20)
- Aplicado en: `api_vision_subir_foto` POST
- Respuesta al exceder: HTTP 429

### Control 2: Concurrent tracker por IP

```
Clave set activo: rl:active:{ip}         TTL: 3600s (safety)
Clave mapeo:      rl:foto_ip:{foto_id}   TTL: 7200s
```

- Límite: `VISION_RATE_LIMIT_MAX_CONCURRENT` (default: 10)
- `track_concurrent_start(ip, foto_id)` → agrega `foto_id` al set activo
- `track_concurrent_end(foto_id)` → lee IP del mapeo, elimina del set, borra mapeo
- Aplicado en:
  - `api_vision_foto_detalle` POST (análisis individual)
  - `api_vision_analizar_inspeccion` POST (bulk — despacha hasta slots disponibles, retorna `omitidas_por_limite`)
- El worker llama `track_concurrent_end` al finalizar la tarea (éxito, error final o skip)

### Extracción de IP real

```python
def get_client_ip(request) -> str:
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()   # primer IP en cadena de proxies
    return request.META.get("REMOTE_ADDR", "127.0.0.1")
```

### Variables de entorno configurables

| Variable | Default | Descripción |
|---|---|---|
| `CELERY_BROKER_URL` | `amqp://guest:guest@localhost:5672//` | Broker RabbitMQ |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis pub/sub y rate limiting |
| `SSE_KEEPALIVE_SECONDS` | `15` | Intervalo keepalive SSE |
| `VISION_RATE_LIMIT_UPLOADS_PER_MINUTE` | `20` | Max uploads/min por IP |
| `VISION_RATE_LIMIT_MAX_CONCURRENT` | `10` | Max fotos activas simultáneas por IP |
| `CELERY_TASK_ALWAYS_EAGER` | `False` | `True` ejecuta tareas inline (tests/CI) |

---

## Monitoreo con Flower

```bash
# Arranque con management API de RabbitMQ
celery -A backend flower --port=5555 \
  --broker_api=http://guest:guest@localhost:15672/api/
```

Tareas registradas visibles en Flower:
- `vision.procesar_foto` — tarea principal de inferencia
- `vision.dead_letter` — registra fallos terminales en cola `vision.dead`

Para que el **Broker tab** muestre métricas de colas, el management plugin de RabbitMQ debe estar activo:
```bash
sudo rabbitmq-plugins enable rabbitmq_management
```

---

## Orden de arranque de servicios

```bash
# 1. Servicios base
sudo systemctl start rabbitmq-server redis

# 2. Worker Celery
source .venv/bin/activate
celery -A backend worker -Q vision -l info --concurrency=2

# 3. Flower (opcional, monitoreo)
celery -A backend flower --port=5555 \
  --broker_api=http://guest:guest@localhost:15672/api/

# 4. Django
python manage.py runserver
```

---

## Árbol de archivos del módulo

```
vision/
├── models.py        # SeccionCasco, InspeccionCasco, FotoInspeccion
├── views.py         # Endpoints REST + SSE stream
├── tasks.py         # procesar_foto (Celery) + dead_letter
├── pubsub.py        # Cliente Redis + publicar_evento + suscribirse
├── ratelimit.py     # Fixed-window counter upload + concurrent tracker
├── inference.py     # Singleton ImageProcessor (nautic_core)
├── urls.py          # Routing del módulo
└── admin.py         # (Django admin)
```
