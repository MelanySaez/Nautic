# Módulo de Inspección IA — Documentación técnica

## Índice

1. [Visión general](#1-visión-general)
2. [Arquitectura y stack](#2-arquitectura-y-stack)
3. [Modelos de base de datos](#3-modelos-de-base-de-datos)
4. [API REST — Endpoints](#4-api-rest--endpoints)
5. [Procesamiento YOLO asíncrono](#5-procesamiento-yolo-asíncrono)
6. [Persistencia de imágenes en disco](#6-persistencia-de-imágenes-en-disco)
7. [Frontend — Componentes React](#7-frontend--componentes-react)
8. [Servicio API en el frontend](#8-servicio-api-en-el-frontend)
9. [Sistema de severidad de anomalías](#9-sistema-de-severidad-de-anomalías)
10. [Flujo completo de uso](#10-flujo-completo-de-uso)
11. [Decisiones de diseño](#11-decisiones-de-diseño)

---

## 1. Visión general

El módulo de Inspección IA permite a los inspectores navales fotografiar secciones del casco de un buque y obtener detecciones automáticas de anomalías usando un modelo YOLO (`nautic_core.ImageProcessor`). Las inspecciones se agrupan por buque y sesión, las fotos se organizan por sección del casco, y el análisis corre de forma asíncrona sin bloquear la interfaz.

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

```
frontend/src/components/AIInspection.js   ← componente principal React
frontend/src/components/AIInspection.css  ← estilos alineados al design system
frontend/src/services/api.js              ← funciones de cliente HTTP (axios)

vision/models.py       ← modelos Django (SeccionCasco, InspeccionCasco, FotoInspeccion)
vision/views.py        ← lógica de endpoints + worker YOLO
vision/urls.py         ← registro de rutas
vision/management/commands/seed_secciones_casco.py  ← comando para poblar el catálogo
```

**Dependencias clave:**
- `nautic_core.ImageProcessor` — wrapper del modelo YOLO (paquete externo)
- `PIL` (Pillow) — validación de imágenes antes de guardarlas o procesarlas
- `threading` — ejecución del worker YOLO en hilo daemon
- `SweetAlert2` — diálogos de confirmación en el frontend
- Bootstrap Icons (`bi-*`) — iconografía de la interfaz

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
- Los índices `(inspeccion, estado)` y `(seccion)` optimizan las consultas de polling y agrupación por sección que el frontend realiza periódicamente.

---

## 4. API REST — Endpoints

Todos registrados en `vision/urls.py` y prefijados con `/api/`.

| Método | URL | Descripción |
|---|---|---|
| `GET` | `/api/vision/secciones/` | Catálogo completo de secciones del casco |
| `GET` | `/api/vision/inspecciones/` | Lista todas las inspecciones (acepta `?buque_id=`) |
| `POST` | `/api/vision/inspecciones/` | Crear nueva inspección |
| `GET` | `/api/vision/inspecciones/<id>/` | Detalle de inspección con todas sus fotos |
| `DELETE` | `/api/vision/inspecciones/<id>/` | Eliminar inspección + archivos físicos |
| `POST` | `/api/vision/inspecciones/<id>/fotos/` | Subir foto (multipart) |
| `GET` | `/api/vision/fotos/<id>/` | Estado de una foto (usado para polling) |
| `POST` | `/api/vision/fotos/<id>/` | Disparar análisis de foto en estado `pendiente` o `error` |
| `DELETE` | `/api/vision/fotos/<id>/` | Eliminar foto + archivos físicos |
| `POST` | `/api/vision/inspecciones/<id>/analizar/` | Iniciar análisis de todas las fotos pendientes |

### Endpoint legado

`POST /api/ai/anomalias/` — inferencia directa sin persistencia. Recibe una imagen y devuelve la imagen anotada en JPEG o un JSON con detecciones + imagen en base64. Se mantiene por compatibilidad pero no lo usa el flujo de inspección.

### Validación de imágenes en el servidor

Antes de guardar cualquier archivo, `_validar_imagen()` aplica tres comprobaciones:
1. Extensión permitida (`.jpg`, `.jpeg`, `.png`, `.bmp`, `.webp`, `.tiff`)
2. Content-Type del navegador dentro de la lista aceptada
3. `PIL.Image.open().verify()` — verifica magic bytes para rechazar archivos renombrados con extensión falsa

**Decisión:** La validación a nivel de bytes (PIL) es la única verificación real. Las otras dos son filtros rápidos de primera línea. Verificar con PIL antes de guardar evita que el worker YOLO reciba archivos corruptos horas después del upload.

---

## 5. Procesamiento YOLO asíncrono

### Por qué asíncrono

La inferencia YOLO puede tardar entre 100ms y varios segundos dependiendo del hardware. Bloquear el worker HTTP de Django durante ese tiempo colapsaría la capacidad de respuesta del servidor ante múltiples uploads simultáneos.

### Implementación con `threading`

```python
def _disparar_procesamiento(foto_id):
    t = threading.Thread(target=_procesar_foto_worker, args=(foto_id,), daemon=True)
    t.start()
```

El hilo es `daemon=True`: si el proceso principal de Django muere, el hilo no bloquea el cierre.

### Flujo del worker

```python
def _procesar_foto_worker(foto_id):
    foto.estado = 'en_proceso'  → guarda
    lee imagen del disco
    valida con PIL (protege contra archivos corruptos en disco)
    processor = ImageProcessor(confidence=0.25, iou=0.45)
    imagen_anotada_bytes, resultados = asyncio.run(processor.process_and_visualize(...))
    guarda imagen anotada en disco

    raw_detections = resultados['detections']
    foto.imagen_anotada       = ruta
    foto.detecciones          = _agrupar_detecciones(raw_detections)
    foto.tiempo_inferencia_ms = resultados['inference_time_ms']
    foto.severidad            = _calcular_severidad(raw_detections)
    foto.estado = 'completada'  → guarda

    # si falla en cualquier punto:
    foto.estado = 'error'
    foto.error_detalle = str(exc)
```

El worker aplica dos transformaciones sobre la salida cruda del modelo antes de guardar:

- **`_agrupar_detecciones(raw_detections)`** — colapsa la lista de detecciones individuales en una entrada por clase única, conservando el conteo de apariciones y la confianza máxima.
- **`_calcular_severidad(raw_detections)`** — evalúa todas las clases detectadas contra `_SEVERITY_MAP` y retorna el nivel más alto encontrado (`critical` > `high` > `medium` > `low`). Si no hay anomalías reales entre las detecciones, retorna `None`.

### Por qué NO se inicia automáticamente al subir

**Decisión deliberada:** el análisis no se dispara al subir la foto. El inspector puede subir múltiples fotos a distintas secciones, revisarlas, eliminar errores, y solo cuando considera que el lote está completo presiona **"Iniciar análisis"**. Esto evita consumir recursos de GPU/CPU en fotos que se iban a eliminar de todas formas.

El endpoint `POST /api/vision/inspecciones/<id>/analizar/` itera todas las fotos en estado `pendiente` y llama `_disparar_procesamiento` para cada una.

### Punto de migración a Celery

El código incluye un comentario explícito indicando que `_disparar_procesamiento` es el punto de reemplazo cuando se migre a un sistema de colas (Celery + Redis/RabbitMQ). La firma de la función worker no necesitaría cambiar.

### Reintentar fotos en error

`POST /api/vision/fotos/<id>/` permite reintentar el análisis de una foto en estado `error` **o** `pendiente`. Restablece el estado a `pendiente` y lanza el worker nuevamente. Útil cuando el modelo falla por un pico de carga o un error transitorio.

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
- **Polling automático** — cuando hay fotos en `pendiente` o `en_proceso`, el componente consulta el estado de la inspección cada 3 segundos con `setInterval`. El intervalo se limpia al desmontar o cuando ya no hay fotos pendientes.

**Decisión sobre el polling:** en lugar de polling por foto individual, se consulta el detalle completo de la inspección. Esto actualiza el estado de todas las fotos en una sola petición, lo cual es más eficiente cuando hay varias fotos procesándose en paralelo.

---

### `Resultados`

Vista de lectura de los resultados del análisis. Agrupa las fotos por sección con `reduce` sobre `fotos[]`. Mantiene el mismo polling de 3 segundos que `SubirFotos` mientras haya fotos pendientes.

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

La severidad se calcula en el backend durante el procesamiento YOLO y se persiste en el campo `FotoInspeccion.severidad`. El worker usa `_calcular_severidad()` que evalúa todas las detecciones contra `_SEVERITY_MAP` y retorna la peor encontrada. Se muestra como badge en el encabezado de la lista de detecciones.

```python
# Backend: vision/views.py
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
       └── POST /analizar/ → lanza worker YOLO en hilo separado por cada foto pendiente
       └── El frontend hace polling cada 3s hasta que todas pasen a completada/error
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

### Threading vs Celery

Threading es adecuado para desarrollo y despliegues con carga moderada. Los hilos daemon no sobreviven si el proceso Django muere, lo que significa que un reinicio del servidor puede perder jobs en vuelo. El código señala explícitamente el punto de migración a Celery para producción.

### `on_delete=CASCADE` en `FotoInspeccion`

Al eliminar una `InspeccionCasco`, Django elimina automáticamente todos los `FotoInspeccion` asociados en cascada. Sin embargo, los archivos físicos en disco no se eliminan en cascada automáticamente — Django no conoce la semántica de negocio del almacenamiento. Por eso el endpoint `DELETE /inspecciones/<id>/` itera las fotos manualmente y borra los archivos antes de llamar `insp.delete()`.

### Polling del frontend

El frontend hace polling sobre el detalle completo de la inspección (no sobre cada foto individualmente) porque:
1. Una sola petición actualiza el estado de todas las fotos
2. Cuando hay N fotos procesándose, hacer N peticiones en paralelo cada 3 segundos saturaria el servidor
3. El endpoint de detalle ya incluye `select_related('seccion')` y el prefetch de fotos, por lo que es una sola query

El intervalo de 3 segundos es un balance entre latencia percibida y carga al servidor.

### Eliminación optimista en el listado

Al eliminar una inspección desde el listado, el frontend actualiza el estado local con `filter()` sin recargar la lista completa desde el servidor. Esto da una respuesta inmediata al usuario. Si la petición fallara, SweetAlert2 mostraría el error y el item permanecería visible.

### i18n integrado

El módulo incluye su propio objeto `i18n` con strings en español e inglés. Escucha el evento `app:language` en `window` para sincronizarse con el selector de idioma global de la aplicación sin depender de ninguna librería externa de internacionalización.
