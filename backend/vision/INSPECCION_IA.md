# Módulo de Inspección IA — Documentación técnica

## Índice

1. [Visión general](#1-visión-general)
2. [Arquitectura y stack](#2-arquitectura-y-stack)
3. [Modelos de base de datos](#3-modelos-de-base-de-datos)
4. [API REST, SSE y rate limiting](#4-api-rest-sse-y-rate-limiting)
5. [Procesamiento YOLO asíncrono (Celery)](#5-procesamiento-yolo-asíncrono-celery)
6. [Persistencia de imágenes en disco](#6-persistencia-de-imágenes-en-disco)
7. [Frontend — Componentes React](#7-frontend--componentes-react)
8. [Servicio API en el frontend](#8-servicio-api-en-el-frontend)
9. [Sistema de severidad de anomalías](#9-sistema-de-severidad-de-anomalías)
10. [Flujo completo de uso](#10-flujo-completo-de-uso)
11. [Decisiones de diseño](#11-decisiones-de-diseño)

---

## 1. Visión general

El módulo de Inspección IA permite a los inspectores navales fotografiar secciones del casco de un buque y obtener detecciones automáticas de anomalías usando un modelo YOLO (`core_engine.ImageProcessor`). Las inspecciones se agrupan por buque y sesión, las fotos se organizan por sección del casco, y el análisis corre en workers Celery sin bloquear la interfaz. El progreso llega al browser por Server-Sent Events.

Clases detectables por el modelo:

| `class_name` | Descripción | Tipo |
|---|---|---|
| `corrosion` | Corrosión | Anomalía |
| `defect` | Defecto estructural | Anomalía |
| `marine_growth` | Incrustación marina | Anomalía |
| `paint_peel` | Descascaramiento de pintura | Anomalía |
| `ship_hull` | Casco del buque | Componente |
| `bilge_keel` | Quilla de balance | Componente |
| `propeller` | Hélice | Componente |
| `anode` | Ánodo de sacrificio | Componente |
| `sea_chest_grating` | Rejilla de toma de mar | Componente |
| `over_board_valve` | Válvula de descarga | Componente |

---

## 2. Arquitectura y stack

Stack: Django 5.1 · Celery 5.4 · RabbitMQ (broker) · Redis (pub/sub + rate limit) · PostgreSQL · React 18

```
frontend/src/components/AIInspection.js   ← componente principal React
frontend/src/components/AIInspection.css  ← estilos alineados al design system
frontend/src/components/CameraCapture.js  ← captura desde cámara (modal)
frontend/src/services/api.js              ← cliente HTTP (axios) + stream SSE

vision/models.py       ← modelos Django (SeccionCasco, InspeccionCasco, FotoInspeccion)
vision/views.py        ← endpoints REST + endpoint SSE
vision/tasks.py        ← tarea Celery procesar_foto + DLQ
vision/inference.py    ← singleton del ImageProcessor (YOLO)
vision/pubsub.py       ← cliente Redis pub/sub para eventos SSE
vision/ratelimit.py    ← rate limiting por IP (uploads + concurrencia)
vision/urls.py         ← registro de rutas
vision/management/commands/seed_secciones_casco.py  ← comando para poblar el catálogo

backend/celery.py      ← app Celery del proyecto
backend/settings.py    ← config CELERY_*, REDIS_URL, SSE_*, VISION_RATE_LIMIT_*
```

**Flujo de datos:**

```
Django view (upload)  → guarda en disco → publica foto-created (Redis)
Django view (analizar)→ rate limit → procesar_foto.apply_async() → RabbitMQ cola "vision"
Celery worker         → inferencia YOLO → guarda en Postgres → publica foto-updated (Redis)
Django view (stream)  → SUBSCRIBE Redis → StreamingHttpResponse (SSE) → browser EventSource
```

**Dependencias clave:**
- `core_engine.ImageProcessor` — wrapper del modelo YOLO (paquete externo)
- `celery` + RabbitMQ — cola de tareas para la inferencia
- `redis` — pub/sub de eventos SSE y contadores de rate limiting
- `PIL` (Pillow) — validación de imágenes antes de guardarlas o procesarlas
- `SweetAlert2` — diálogos de confirmación en el frontend
- Bootstrap Icons (`bi-*`) — iconografía de la interfaz

> Detalle ampliado del backend en [`VISION_BACKEND.md`](../VISION_BACKEND.md) y del frontend en [`VISION_FRONTEND.md`](../VISION_FRONTEND.md).

---

## 3. Modelos de base de datos

### `SeccionCasco`
Catálogo estático de zonas físicas del casco. Es genérico (no depende de ningún buque ni inspección). Se puebla con el comando `python manage.py seed_secciones_casco`.

```python
class SeccionCasco(models.Model):
    codigo      = models.CharField(max_length=20, unique=True)  # ej: "FWD-BTM"
    nombre      = models.CharField(max_length=100)              # ej: "Fondo - Proa"
    descripcion = models.TextField(blank=True)
    orden       = models.IntegerField(default=0)
```

**Decisión:** Separar el catálogo de secciones como entidad independiente permite reutilizarlo en cualquier inspección sin duplicar datos. El campo `orden` permite controlar el orden visual en la cuadrícula del frontend sin depender del orden de inserción.

---

### `InspeccionCasco`
Sesión de inspección: agrupa todas las fotos de una campaña de revisión de un buque.

```python
class InspeccionCasco(models.Model):
    buque              = models.ForeignKey('api.Buque', on_delete=models.CASCADE)
    descripcion        = models.TextField(blank=True)
    tomado_por         = models.CharField(max_length=255, blank=True)
    fecha_creacion     = models.DateTimeField(auto_now_add=True)
    fecha_modificacion = models.DateTimeField(auto_now=True)
```

**Decisión:** El campo `tomado_por` es texto libre, no una FK a un usuario, porque el sistema es versión lite y no tiene módulo de autenticación. Esto simplifica la creación sin requerir login.

---

### `FotoInspeccion`
Unidad atómica del módulo: una foto individual analizada por YOLO.

```python
class FotoInspeccion(models.Model):
    class Estado(models.TextChoices):
        PENDIENTE  = 'pendiente'
        EN_PROCESO = 'en_proceso'
        COMPLETADA = 'completada'
        ERROR      = 'error'

    inspeccion           = models.ForeignKey(InspeccionCasco, on_delete=models.CASCADE, related_name='fotos')
    seccion              = models.ForeignKey(SeccionCasco, on_delete=models.PROTECT, related_name='fotos')
    imagen_original      = models.CharField(max_length=500)
    imagen_anotada       = models.CharField(max_length=500, blank=True, null=True)
    detecciones          = models.JSONField(null=True, blank=True)
    tiempo_inferencia_ms = models.FloatField(null=True, blank=True)
    severidad            = models.CharField(max_length=20, null=True, blank=True)
    estado               = models.CharField(choices=Estado.choices, default=Estado.PENDIENTE)
    error_detalle        = models.TextField(blank=True, null=True)
    fecha_creacion       = models.DateTimeField(auto_now_add=True)
```

Los resultados del análisis YOLO se dividen en tres campos independientes:

| Campo | Tipo | Contenido |
|---|---|---|
| `detecciones` | `JSONField` | Clases únicas detectadas (una entrada por clase) |
| `tiempo_inferencia_ms` | `FloatField` | Tiempo de inferencia del modelo en milisegundos |
| `severidad` | `CharField` | Severidad general de la foto (`critical`/`high`/`medium`/`low`/null) |

Estructura de `detecciones` — una entrada por clase única, sin repeticiones:

```json
[
  {"class_name": "corrosion", "count": 3, "max_confidence": 0.92},
  {"class_name": "marine_growth", "count": 1, "max_confidence": 0.74},
  {"class_name": "ship_hull", "count": 1, "max_confidence": 0.88}
]
```

Cada entrada incluye:
- `class_name` — identificador de la clase YOLO
- `count` — cantidad de veces que esa clase fue detectada en la imagen
- `max_confidence` — la mayor confianza entre todas las detecciones de esa clase

**Decisión de fragmentar los campos:** la versión inicial guardaba el resultado crudo completo del modelo YOLO como un solo JSON (bboxes, confidence, tiempos, metadatos de imagen). Esto producía un blob ilegible en la base de datos. Se dividió en tres campos con propósitos claros: `detecciones` para las clases, `tiempo_inferencia_ms` para el rendimiento, y `severidad` para la clasificación de riesgo. La agrupación por clase única se realiza en el backend con `_agrupar_detecciones()` al momento del procesamiento.

**Otras decisiones:**
- `imagen_original` y `imagen_anotada` son `CharField`, no `ImageField`. Esto es consistente con el enfoque del resto del proyecto (`api.Buque.imagen`, `api.Equipo.imagen`) y permite mayor control manual sobre las rutas de almacenamiento.
- La FK a `SeccionCasco` usa `on_delete=PROTECT` (no CASCADE): si una sección tiene fotos asociadas no se puede eliminar accidentalmente del catálogo.
- Los índices `(inspeccion, estado)` y `(seccion)` optimizan el filtrado de fotos pendientes (endpoint `/analizar/`) y la agrupación por sección de la vista de resultados.

---

## 4. API REST, SSE y rate limiting

Todos registrados en `vision/urls.py` y prefijados con `/api/`.

| Método | URL | Descripción |
|---|---|---|
| `GET` | `/api/vision/secciones/` | Catálogo completo de secciones del casco |
| `GET` | `/api/vision/inspecciones/` | Lista todas las inspecciones (acepta `?buque_id=`) |
| `POST` | `/api/vision/inspecciones/` | Crear nueva inspección |
| `GET` | `/api/vision/inspecciones/<id>/` | Detalle de inspección con todas sus fotos |
| `DELETE` | `/api/vision/inspecciones/<id>/` | Eliminar inspección + archivos físicos |
| `POST` | `/api/vision/inspecciones/<id>/fotos/` | Subir foto (multipart) |
| `GET` | `/api/vision/fotos/<id>/` | Estado de una foto (consulta puntual / fallback) |
| `POST` | `/api/vision/fotos/<id>/` | Disparar análisis de foto en estado `pendiente` o `error` |
| `DELETE` | `/api/vision/fotos/<id>/` | Eliminar foto + archivos físicos |
| `POST` | `/api/vision/inspecciones/<id>/analizar/` | Iniciar análisis de todas las fotos pendientes |
| `GET` | `/api/vision/inspecciones/<id>/stream/` | Stream SSE de eventos de la inspección |

### Rate limiting (`vision/ratelimit.py`)

Dos controles por IP respaldados por contadores Redis. Ambos **fallan abiertos**: si Redis no responde, la operación pasa igualmente (no se bloquea el negocio por indisponibilidad del cache).

| Control | Dónde aplica | Límite (env) | Respuesta al superarlo |
|---|---|---|---|
| Uploads por minuto (ventana de 60 s) | `POST .../fotos/` | `VISION_RATE_LIMIT_UPLOADS_PER_MINUTE` (20) | `429` |
| Fotos activas simultáneas | `POST /fotos/<id>/` y `POST .../analizar/` | `VISION_RATE_LIMIT_MAX_CONCURRENT` (10) | `429` (o parcial, ver abajo) |

`track_concurrent_start(ip, foto_id)` se llama desde la vista al disparar; `track_concurrent_end(foto_id)` desde el worker al terminar (éxito, error final o skip). El mapeo `foto → IP` vive en Redis con TTL de 2 h.

En `POST .../analizar/` el límite se aplica foto por foto: la respuesta `202` devuelve `{"iniciadas": N, "omitidas_por_limite": M}`. Solo devuelve `429` si no se pudo disparar ninguna.

La IP real se extrae respetando `X-Forwarded-For` (primer valor) para funcionar detrás de nginx/proxies.

### Eventos SSE emitidos

`GET /api/vision/inspecciones/<id>/stream/` devuelve `text/event-stream`. Emite un `ready` de handshake, sugiere `retry: 5000` al browser, y envía un comentario `:keepalive` cada `SSE_KEEPALIVE_SECONDS` (15 por defecto) para sobrevivir proxies con timeouts agresivos.

| Evento | Emisor | Payload |
|---|---|---|
| `ready` | vista SSE | `{inspeccion_id, ts}` |
| `foto-created` | vista de upload | `{foto: {...}}` |
| `foto-updated` | worker Celery | `{foto_id, inspeccion_id, estado, severidad, detecciones, tiempo_inferencia_ms, imagen_anotada, error_detalle}` |
| `foto-deleted` | vista de borrado | `{foto_id, inspeccion_id}` |

**Nota sobre rutas de imagen:** el worker Celery no tiene `request`, por lo que `foto-updated` viaja con paths relativos (`media/...`), mientras que el `GET` de detalle devuelve URLs absolutas. El frontend normaliza con `_absMediaUrl()` antes del merge para no pisar una URL buena con un path roto.

### Endpoint legado

`POST /api/ai/anomalias/` — inferencia directa sin persistencia. Recibe una imagen y devuelve la imagen anotada en JPEG o un JSON con detecciones + imagen en base64. Se mantiene por compatibilidad pero no lo usa el flujo de inspección.

### Validación de imágenes en el servidor

Antes de guardar cualquier archivo, `_validar_imagen()` aplica tres comprobaciones:
1. Extensión permitida (`.jpg`, `.jpeg`, `.png`, `.bmp`, `.webp`, `.tiff`)
2. Content-Type del navegador dentro de la lista aceptada
3. `PIL.Image.open().verify()` — verifica magic bytes para rechazar archivos renombrados con extensión falsa

**Decisión:** La validación a nivel de bytes (PIL) es la única verificación real. Las otras dos son filtros rápidos de primera línea. Verificar con PIL antes de guardar evita que el worker YOLO reciba archivos corruptos horas después del upload.

---

## 5. Procesamiento YOLO asíncrono (Celery)

### Por qué asíncrono

La inferencia YOLO puede tardar entre 100ms y varios segundos dependiendo del hardware. Bloquear el worker HTTP de Django durante ese tiempo colapsaría la capacidad de respuesta del servidor ante múltiples uploads simultáneos.

### Implementación con Celery + RabbitMQ

La vista solo encola. Toda la inferencia vive en el worker.

```python
# vision/views.py
def _disparar_procesamiento(foto_id):
    """Encola la tarea Celery ``vision.procesar_foto`` para la foto dada."""
    procesar_foto.apply_async(kwargs={"foto_id": foto_id})
```

**Colas** (`backend/settings.py`): `vision` es la cola principal, declarada con `x-dead-letter-exchange: vision.dlx`; `vision.dead` recoge lo que RabbitMQ reencamina y las tareas que agotan reintentos.

Parámetros relevantes:

| Setting | Valor | Razón |
|---|---|---|
| `CELERY_RESULT_BACKEND` | `None` | Postgres (`FotoInspeccion.estado`) es la fuente de verdad; no hace falta backend de resultados |
| `CELERY_WORKER_PREFETCH_MULTIPLIER` | `1` | Tareas largas de ML: evita que un worker acapare la cola |
| `CELERY_TASK_ACKS_LATE` | `True` | Si el worker muere a mitad de inferencia, RabbitMQ re-encola en otro |
| `CELERY_TASK_REJECT_ON_WORKER_LOST` | `True` | Complemento del anterior |
| `CELERY_TASK_SOFT_TIME_LIMIT` / `TIME_LIMIT` | `270` / `300` s | Soft lanza excepción; hard mata el proceso |
| `CELERY_TASK_ALWAYS_EAGER` | env, `False` | Modo síncrono para tests/CI |

Arranque del worker:

```bash
celery -A backend worker -Q vision -l info --concurrency=2 --pool=prefork
```

### Singleton del modelo YOLO (`vision/inference.py`)

`get_processor()` carga `ImageProcessor` **una sola vez por proceso** y lo reutiliza, protegido con un `Lock` para el caso de dos hilos inicializando a la vez. En workers prefork, la señal `worker_process_init` precarga el modelo al arrancar cada subproceso, de modo que la primera tarea no paga la latencia de inicialización.

### Flujo de la tarea (`vision/tasks.py`)

```python
@shared_task(
    bind=True,
    name="vision.procesar_foto",
    autoretry_for=(IOError, OSError),
    retry_backoff=True, retry_backoff_max=60, retry_jitter=True,
    retry_kwargs={"max_retries": 3},
)
def procesar_foto(self, foto_id):
    si la foto no existe        → track_concurrent_end + return
    si estado == 'completada'   → track_concurrent_end + return   # idempotencia
    foto.estado = 'en_proceso'  → guarda → _notificar()           # evento SSE
    lee imagen del disco
    valida con PIL (protege contra archivos corruptos en disco)
    processor = get_processor()                                   # singleton
    imagen_anotada_bytes, resultados = asyncio.run(processor.process_and_visualize(...))
    guarda imagen anotada en disco

    raw_detections = resultados['detections']
    foto.imagen_anotada       = ruta
    foto.detecciones          = _agrupar_detecciones(raw_detections)
    foto.tiempo_inferencia_ms = round(resultados['inference_time_ms'], 2)
    foto.severidad            = _calcular_severidad(raw_detections)
    foto.estado = 'completada'  → guarda → _notificar() → track_concurrent_end()

    # si falla en cualquier punto:
    foto.estado = 'error'; foto.error_detalle = str(exc)[:500] → _notificar()
    # IOError/OSError → reintenta con backoff hasta 3 veces
    # cualquier otra excepción → fallo terminal → dead_letter en cola vision.dead
```

**Idempotencia:** con `acks_late`, RabbitMQ puede re-entregar una tarea cuyo worker murió. La comprobación `estado == 'completada'` al inicio evita reprocesar trabajo ya hecho.

**Dead Letter Queue:** `dead_letter(foto_id, error_type, error_detail, original_task_id)` es una tarea aparte en la cola `vision.dead`. No repara nada — registra el fallo con nivel `ERROR` y queda visible en Flower para diagnóstico y requeue manual:

```python
from vision.tasks import procesar_foto
procesar_foto.apply_async([foto_id])
```

La tarea aplica dos transformaciones sobre la salida cruda del modelo antes de guardar:

- **`_agrupar_detecciones(raw_detections)`** — colapsa la lista de detecciones individuales en una entrada por clase única, conservando el conteo de apariciones y la confianza máxima.
- **`_calcular_severidad(raw_detections)`** — evalúa todas las clases detectadas contra `_SEVERITY_MAP` y retorna el nivel más alto encontrado (`critical` > `high` > `medium` > `low`). Si no hay anomalías reales entre las detecciones, retorna `None`.

### Por qué NO se inicia automáticamente al subir

**Decisión deliberada:** el análisis no se dispara al subir la foto. El inspector puede subir múltiples fotos a distintas secciones, revisarlas, eliminar errores, y solo cuando considera que el lote está completo presiona **"Iniciar análisis"**. Esto evita consumir recursos de GPU/CPU en fotos que se iban a eliminar de todas formas.

El endpoint `POST /api/vision/inspecciones/<id>/analizar/` itera todas las fotos en estado `pendiente`, reserva slot de concurrencia para cada una y llama `_disparar_procesamiento`.

### Reintentar fotos en error

`POST /api/vision/fotos/<id>/` permite reintentar el análisis de una foto en estado `error` **o** `pendiente`. Restablece el estado a `pendiente`, limpia `error_detalle` y re-encola la tarea. Útil cuando el fallo fue terminal (sin reintento automático) o cuando ya se agotaron los 3 reintentos de Celery.

---

## 6. Persistencia de imágenes en disco

### Estructura de directorios

```
<BASE_DIR>/
└── media/
    └── inspecciones/
        ├── originales/    ← fotos subidas por el usuario
        │   └── <uuid_hex><ext>
        └── anotadas/      ← imágenes procesadas por YOLO
            └── <foto_id>_<uuid_hex[:8]>.jpg
```

### Convención de rutas — alineación con el módulo SWBS

El path almacenado en la base de datos **incluye el prefijo `media/`**, por ejemplo:

```
media/inspecciones/originales/3f7a1b2c9e4d.jpg
```

Esto es consistente con `api.Buque.imagen` y `api.Equipo.imagen` (módulo SWBS), que también almacenan paths con prefijo `media/` y usan `settings.BASE_DIR` como raíz para operaciones de disco.

**Diferencia respecto a la versión inicial:** la versión inicial usaba `settings.MEDIA_ROOT` como raíz y guardaba paths sin prefijo (`inspecciones/originales/uuid.jpg`). Se migró al enfoque del módulo SWBS para mantener coherencia interna en el proyecto.

### Conversión a URL

```python
def _media_url(path, request=None):
    s = path.replace('\\', '/')
    if request:
        return request.build_absolute_uri('/' + s.lstrip('/'))
    return '/' + s.lstrip('/')
```

Mismo patrón que `_absurl()` en `api/views.py`. Convierte `media/inspecciones/originales/foto.jpg` → `http://HOST/media/inspecciones/originales/foto.jpg`.

### Nombres de archivo

- **Original:** `uuid.uuid4().hex + extension` — garantiza unicidad sin depender del nombre original del archivo (que podría contener caracteres especiales o colisionar).
- **Anotada:** `{foto_id}_{uuid4().hex[:8]}.jpg` — incluye el ID de la foto para facilitar rastreo, más un sufijo aleatorio corto para evitar colisiones en reintento.

### Eliminación de archivos

Al eliminar una foto o una inspección completa, el backend elimina primero los archivos físicos antes de borrar los registros de la BD. Si el archivo ya no existe en disco (`os.path.exists`), se ignora silenciosamente para no bloquear la operación:

```python
for path_field in [foto.imagen_original, foto.imagen_anotada]:
    if path_field:
        full_path = os.path.join(settings.BASE_DIR, path_field)
        if os.path.exists(full_path):
            os.remove(full_path)
foto.delete()
```

---

## 7. Frontend — Componentes React

### Arquitectura de componentes

`AIInspection` es un componente contenedor que determina la fase activa mediante la URL y delega el render:

```
AIInspection (enrutador de fases)
├── InspeccionLista   → /ai-inspection
├── NuevaInspeccion   → /ai-inspection/nueva
├── SubirFotos        → /ai-inspection/<id>/fotos
└── Resultados        → /ai-inspection/<id>/resultados
    └── FotoCard      → reutilizable (compacto y completo)
```

**Decisión:** Una sola ruta `/ai-inspection` con sub-rutas en lugar de rutas separadas en el router principal. La detección de fase usa `useLocation` + `useMemo` sobre `location.pathname`, lo que mantiene la lógica de navegación encapsulada en un solo componente.

---

### `InspeccionLista`

Muestra todas las inspecciones ordenadas por fecha (más reciente primero). Cada card navega a `/resultados` al hacer clic. Incluye botón de eliminación con `e.stopPropagation()` para evitar que el clic en el botón active la navegación de la card.

Tras confirmar la eliminación, filtra la inspección del estado local (`setInspecciones(prev => prev.filter(...))`) en lugar de recargar la lista completa, lo que evita un round-trip innecesario al servidor.

---

### `NuevaInspeccion`

Flujo en dos pasos dentro de la misma vista:
1. Seleccionar buque (cards clickeables con estado `selected`)
2. Completar descripción e inspector (campos opcionales)

Al crear, navega directamente a `/<id>/fotos`.

---

### `SubirFotos`

Vista principal de trabajo. Contiene:

- **Cuadrícula de secciones** — muestra todas las `SeccionCasco` como cards clickeables. La sección activa despliega un panel debajo. El badge de conteo en cada sección se actualiza en tiempo real.
- **Panel de sección activa** — contiene el botón de upload y la lista de fotos de esa sección en modo compacto.
- **Botón "Iniciar análisis"** — habilitado solo si hay fotos en estado `pendiente`. Muestra un badge con el conteo de pendientes. Deshabilitado durante el proceso (`analizando` state).
- **Stream SSE** — al montar, abre `abrirStreamInspeccion(inspeccionId, handlers)` y mergea los eventos `foto-created` / `foto-updated` / `foto-deleted` sobre el estado local. El `EventSource` se cierra en el cleanup del `useEffect`.
- **Límite de concurrencia** — la constante `CONCURRENT_LIMIT = 10` en `AIInspection.js:181` debe coincidir con `VISION_RATE_LIMIT_MAX_CONCURRENT` del backend. El frontend calcula las fotos activas y avisa antes de que el servidor devuelva `429`.

**Decisión sobre SSE en lugar de polling:** la versión anterior consultaba el detalle completo de la inspección cada 3 segundos con `setInterval`. Con Celery el worker ya sabe exactamente cuándo cambia el estado de una foto, así que publica el evento a Redis y Django lo empuja por `text/event-stream`. Esto elimina las peticiones en vacío y baja la latencia percibida de ~3 s a inmediata. El `GET` de detalle sigue existiendo para la carga inicial de la vista.

---

### `Resultados`

Vista de lectura de los resultados del análisis. Agrupa las fotos por sección con `reduce` sobre `fotos[]`. Abre su propio stream SSE igual que `SubirFotos`, de modo que los reintentos disparados desde esta vista se reflejan en tiempo real.

Incluye:
- Botón "Subir foto" — navega de vuelta a `SubirFotos` para añadir más fotos a la inspección
- Botón "Eliminar inspección" — elimina la sesión completa y navega al listado
- Por cada foto: botón de reintentar (si estado=`error`) + botón de eliminar foto individual

---

### `FotoCard`

Componente reutilizable con dos modos controlados por la prop `compact`:

**Modo compacto** (usado en `SubirFotos`):
- Header con badge de estado, contador de detecciones, spinner si está procesando, botón de eliminación
- Imagen a ancho completo con `objectFit: contain`
- Toggle "Imagen anotada / Imagen original" como pills (visible solo si ambas imágenes existen)

**Modo completo** (usado en `Resultados`):
- Imagen clickeable con toggle por clic (además de los botones pill)
- Badge de estado superpuesto en la esquina de la imagen
- Lista de clases únicas detectadas, cada una con badge de severidad (si es anomalía) y confianza máxima
- Badge de severidad global de la foto (leído directamente del campo `severidad` en la BD)
- Tiempo de inferencia del modelo (leído del campo `tiempo_inferencia_ms`)
- Botón "Eliminar foto" fijo al fondo del card (`mt-auto` en flex column) para alineación consistente entre cards de distinta altura

**Decisión sobre `card-body d-flex flex-column` + `mt-auto`:** sin esto, el botón de eliminar flota a distintas alturas según el contenido de cada card. Con `flex-column` + `mt-auto` el botón siempre queda pegado al borde inferior de la card, independientemente de cuántas detecciones tenga.

---

## 8. Servicio API en el frontend

Todas las funciones del módulo viven en `frontend/src/services/api.js` bajo la sección de "Inspección IA":

```js
fetchSeccionesCasco()              // GET  /vision/secciones/
fetchInspecciones(buqueId?)        // GET  /vision/inspecciones/
crearInspeccion({ buqueId, ... })  // POST /vision/inspecciones/
fetchInspeccionDetalle(id)         // GET  /vision/inspecciones/<id>/
abrirStreamInspeccion(id, handlers)// GET  /vision/inspecciones/<id>/stream/  (EventSource)
eliminarInspeccion(id)             // DELETE /vision/inspecciones/<id>/
subirFotoInspeccion(id, { imagen, seccionId })  // POST multipart /vision/inspecciones/<id>/fotos/
fetchFotoDetalle(fotoId)           // GET  /vision/fotos/<id>/
reintentarFoto(fotoId)             // POST /vision/fotos/<id>/
eliminarFoto(fotoId)               // DELETE /vision/fotos/<id>/
iniciarAnalisis(inspeccionId)      // POST /vision/inspecciones/<id>/analizar/
```

El cliente axios base normaliza la URL en `normalizedBase` para asegurar el prefijo `/api/` sin duplicación. Las funciones del módulo usan rutas relativas `/vision/...`.

### Estructura de respuesta de una foto

```json
{
  "id": 42,
  "seccion": { "id": 3, "codigo": "MID-BTM", "nombre": "Fondo - Centro", ... },
  "imagen_original": "http://HOST/media/inspecciones/originales/uuid.jpg",
  "imagen_anotada": "http://HOST/media/inspecciones/anotadas/42_hex.jpg",
  "detecciones": [
    { "class_name": "corrosion", "count": 3, "max_confidence": 0.92 },
    { "class_name": "ship_hull", "count": 1, "max_confidence": 0.88 }
  ],
  "tiempo_inferencia_ms": 186.42,
  "severidad": "critical",
  "estado": "completada",
  "error_detalle": null,
  "fecha_creacion": "2026-03-13T..."
}
```

---

## 9. Sistema de severidad de anomalías

### Criterio de clasificación

Solo se asigna severidad a las clases que representan **fallas o daños reales**. Las clases que el modelo detecta como referencia estructural (componentes del casco) no tienen nivel de severidad asignado y se muestran en la lista sin badge.

```js
const SEVERITY_MAP = {
  corrosion:     { level: 'critical', color: '#dc2626' },  // rojo
  defect:        { level: 'high',     color: '#ea580c' },  // naranja
  marine_growth: { level: 'medium',   color: '#d97706' },  // ámbar
  paint_peel:    { level: 'low',      color: '#2563eb' },  // azul
};

// Sin severidad (componentes, no fallas):
// ship_hull, bilge_keel, propeller, anode, sea_chest_grating, over_board_valve
```

### Severidad global de la foto

La severidad se calcula en el worker Celery durante el procesamiento YOLO y se persiste en el campo `FotoInspeccion.severidad`. `_calcular_severidad()` evalúa todas las detecciones contra `_SEVERITY_MAP` y retorna la peor encontrada. Se muestra como badge en el encabezado de la lista de detecciones.

```python
# Backend: vision/tasks.py
_SEVERITY_MAP = {
    'corrosion':     'critical',
    'defect':        'high',
    'marine_growth': 'medium',
    'paint_peel':    'low',
}
```

El frontend lee `foto.severidad` directamente y lo mapea a color/label usando `SEVERITY_MAP` en el componente. No calcula la severidad — la recibe ya resuelta de la API.

**Decisión:** persistir la severidad en la BD permite filtros y reportes sin recalcular, y mantiene el frontend como capa de presentación pura.

### Colores elegidos

- `critical` → rojo (#dc2626): urgencia máxima, corrosión activa
- `high` → naranja (#ea580c): defecto estructural importante
- `medium` → ámbar (#d97706): incrustación marina, requiere atención
- `low` → azul (#2563eb): descascaramiento de pintura, mantenimiento preventivo

Se usa azul (no verde) para "Bajo" porque verde implicaría que no hay problema, cuando en realidad sigue siendo una anomalía que requiere acción.

---

## 10. Flujo completo de uso

```
1. /ai-inspection
   └── Ver listado de inspecciones existentes
       └── Clic en card → navega a /resultados
       └── Botón "Eliminar inspección" → confirma → borra archivos + BD

2. /ai-inspection/nueva
   └── Seleccionar buque (obligatorio)
   └── Descripción + inspector (opcionales)
   └── "Iniciar inspección" → crea InspeccionCasco → navega a /fotos

3. /ai-inspection/<id>/fotos
   └── Cuadrícula de secciones del casco
   └── Clic en sección → abre panel
       └── "Subir foto" → multipart POST → foto guardada en disco con estado=pendiente
       └── Las fotos subidas se muestran en modo compacto con su estado
       └── Botón "Eliminar foto" en header de cada card compacta
   └── Botón "Iniciar análisis" (habilitado si hay pendientes)
       └── POST /analizar/ → encola una tarea Celery por cada foto pendiente (cola "vision")
       └── El worker publica foto-updated en Redis a cada cambio de estado
       └── El frontend recibe los eventos por SSE y actualiza las cards en tiempo real
   └── "Ver resultados" → navega a /resultados

4. /ai-inspection/<id>/resultados
   └── Fotos agrupadas por sección
   └── Cada foto muestra: imagen anotada, toggle original/anotada,
       lista de detecciones con badge de severidad por clase,
       badge de severidad global de la foto
   └── Fotos en error muestran mensaje + botón "Reintentar"
   └── Botón "Eliminar foto" fijo al fondo de cada card
   └── Botón "Eliminar inspección" en el encabezado
```

---

## 11. Decisiones de diseño

### Análisis manual vs automático

**Problema:** si el análisis arranca automáticamente al subir cada foto, el inspector puede subir una foto incorrecta, darse cuenta del error, y el worker ya está consumiendo recursos (CPU/GPU) para analizarla.

**Solución:** el upload solo guarda el archivo y crea el registro con `estado=pendiente`. El inspector revisa, elimina errores si los hay, y cuando el lote está listo presiona "Iniciar análisis".

### De hilos daemon a Celery + RabbitMQ

**Estado inicial:** el análisis corría en un `threading.Thread(daemon=True)` lanzado desde la vista. Funcionaba en desarrollo, pero tenía tres problemas serios:

1. **Pérdida de jobs.** Un hilo daemon muere con el proceso. Cualquier reinicio del servidor (deploy, crash, recarga del autoreloader) perdía en silencio todas las inferencias en vuelo, dejando fotos clavadas en `en_proceso` para siempre.
2. **Sin reintentos ni visibilidad.** Un fallo de E/S transitorio marcaba la foto como `error` definitivamente. No había forma de saber cuántos jobs fallaron ni por qué, más allá de leer logs.
3. **Sin control de carga.** Nada limitaba cuántos hilos se lanzaban a la vez. Con un lote grande, N hilos competían por CPU/GPU y degradaban el servidor HTTP del que colgaban.

**Estado actual:** RabbitMQ persiste la cola, así que un reinicio no pierde trabajo; `acks_late` + `reject_on_worker_lost` re-encolan lo que quedó a medias, y la comprobación de `estado == 'completada'` al inicio de la tarea garantiza idempotencia frente a re-entregas. Los fallos de E/S reintentan con backoff exponencial y jitter; los terminales van a la DLQ `vision.dead`, visible en Flower. La concurrencia queda acotada por `--concurrency` del worker y por el rate limit por IP.

**Costo asumido:** el stack pasó de "solo Django" a Django + RabbitMQ + Redis + worker. Es más infraestructura que operar, y el módulo deja de funcionar si el broker está caído — a diferencia de los hilos, que al menos degradaban solos. Se aceptó porque perder inferencias en silencio era peor que la complejidad operativa.

### Por qué Redis pub/sub para las notificaciones

Con el worker en otro proceso, Django ya no sabe cuándo termina una foto. Las opciones eran seguir haciendo polling contra Postgres, o que el worker avisara.

Se eligió Redis pub/sub porque Redis ya entraba al stack para el rate limiting, el canal por inspección (`vision:inspeccion:{id}`) aísla naturalmente a los clientes de cada sesión, y `publicar_evento()` no rompe la operación de negocio si Redis está caído — solo loguea y sigue. Se perdería la actualización en vivo, pero la foto se procesa igual y la próxima carga de la vista muestra el estado real desde Postgres.

Se descartó WebSockets: el flujo es unidireccional (servidor → browser), y SSE se resuelve con `StreamingHttpResponse` sin meter Channels ni ASGI en el proyecto.

### Rate limiting fail-open

Ambos controles de `ratelimit.py` dejan pasar la petición si Redis no responde. La alternativa (fail-closed) convertiría una caída del cache en una caída total del módulo. Se prioriza disponibilidad: el rate limit protege contra uso accidental abusivo, no es un control de seguridad.

### `on_delete=CASCADE` en `FotoInspeccion`

Al eliminar una `InspeccionCasco`, Django elimina automáticamente todos los `FotoInspeccion` asociados en cascada. Sin embargo, los archivos físicos en disco no se eliminan en cascada automáticamente — Django no conoce la semántica de negocio del almacenamiento. Por eso el endpoint `DELETE /inspecciones/<id>/` itera las fotos manualmente y borra los archivos antes de llamar `insp.delete()`.

### Carga inicial por REST, actualizaciones por SSE

La vista carga el estado completo con `GET /inspecciones/<id>/` (una sola query, con `select_related('seccion')`) y a partir de ahí solo aplica deltas recibidos por SSE. El stream no reenvía el estado completo: si el browser pierde la conexión, `EventSource` reconecta solo (`retry: 5000`) pero los eventos ocurridos durante el corte se pierden. Se acepta porque cualquier navegación a la vista vuelve a leer el estado real desde Postgres, que sigue siendo la fuente de verdad.

### Eliminación optimista en el listado

Al eliminar una inspección desde el listado, el frontend actualiza el estado local con `filter()` sin recargar la lista completa desde el servidor. Esto da una respuesta inmediata al usuario. Si la petición fallara, SweetAlert2 mostraría el error y el item permanecería visible.

### i18n integrado

El módulo incluye su propio objeto `i18n` con strings en español e inglés. Escucha el evento `app:language` en `window` para sincronizarse con el selector de idioma global de la aplicación sin depender de ninguna librería externa de internacionalización.
