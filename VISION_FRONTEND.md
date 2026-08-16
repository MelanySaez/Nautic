# Vision Module — Frontend Technical Reference

Stack: React 18 · SweetAlert2 · Bootstrap 5 + Tabler · Bootstrap Icons · Axios · EventSource API

---

## Estructura de rutas y fases

El módulo vive en `/ai-inspection` y deriva la fase activa desde la URL:

| URL | Fase (`phase`) | Componente renderizado |
|-----|---------------|----------------------|
| `/ai-inspection` | `lista` | `InspeccionLista` |
| `/ai-inspection/nueva` | `nueva` | `NuevaInspeccion` |
| `/ai-inspection/:id/fotos` | `fotos` | `SubirFotos` |
| `/ai-inspection/:id/resultados` | `resultados` | `Resultados` |

La fase se computa con `useMemo` sobre `location.pathname` e `inspeccionId`. El componente raíz `AIInspection` solo actúa como router — no mantiene estado propio del negocio.

---

## Árbol de componentes

```
AIInspection (router + i18n)
├── InspeccionLista
│   └── card de inspección × N (click → /resultados)
├── NuevaInspeccion
│   └── cards de buques (selección) + form descripción/inspector
├── SubirFotos
│   ├── grid de SeccionCasco cards (selección activa)
│   ├── panel de sección activa
│   │   ├── botón "Subir foto" (input[multiple])
│   │   ├── botón "Tomar foto" (CameraCapture via SweetAlert2)
│   │   └── FotoCard × N (modo compact)
│   └── botón "Iniciar análisis" + badge contador pendientes
└── Resultados
    ├── agrupación por sección
    └── FotoCard × N (modo completo)
```

`FotoCard` es el único componente reutilizable — recibe prop `compact` para alternar entre dos modos de visualización.

---

## i18n

Sistema propio sin librerías. Dos idiomas: `es` (default) y `en`.

```js
const LANG_KEY = 'app_lang';
const loadLang = () => localStorage.getItem(LANG_KEY) || navigator.language?.slice(0, 2) || 'es';
```

Cambio de idioma global vía evento personalizado de `window`:
```js
window.dispatchEvent(new CustomEvent('app:language', { detail: { lang: 'en' } }));
```

Todas las strings del módulo viven en el objeto `i18n` (incluidas las funciones de template para mensajes con variables):

```js
uploadLimitMsg: (n) => `${n} foto${n !== 1 ? 's' : ''} en proceso. Espera a que finalicen.`
```

---

## Capa de servicios (`src/services/api.js`)

### Base URL

```js
const normalizedBase = /\/api\/?$/.test(API_BASE)
  ? API_BASE.replace(/\/$/, '')
  : `${API_BASE.replace(/\/$/, '')}/api`;
```

La `API_BASE` viene de `src/config.js`. El normalizador evita `/api/api/` si la config ya incluye el prefijo.

### Instancia Axios

```js
const api = axios.create({ baseURL: normalizedBase, withCredentials: false });
```

Sin credenciales — la versión Lite no usa autenticación por cookie/sesión.

### Interceptor de respuesta — refresh de token

Maneja 401 con un lock que previene múltiples refreshes simultáneos:
- `isRefreshing` — flag booleano
- `waitQueue` — cola de promesas pendientes mientras el refresh está en curso
- `refreshCooldownUntil` — timestamp que bloquea refreshes en cascada (cooldown de 10s tras fallo)

### Funciones del módulo de visión

| Función exportada | Método HTTP | Endpoint |
|---|---|---|
| `fetchSeccionesCasco()` | GET | `/vision/secciones/` |
| `fetchInspecciones(buqueId?)` | GET | `/vision/inspecciones/?buque_id=` |
| `crearInspeccion({buqueId, descripcion, tomadoPor})` | POST | `/vision/inspecciones/` |
| `fetchInspeccionDetalle(id)` | GET | `/vision/inspecciones/{id}/` |
| `eliminarInspeccion(id)` | DELETE | `/vision/inspecciones/{id}/` |
| `subirFotoInspeccion(id, {imagen, seccionId})` | POST multipart | `/vision/inspecciones/{id}/fotos/` |
| `fetchFotoDetalle(id)` | GET | `/vision/fotos/{id}/` |
| `reintentarFoto(id)` | POST | `/vision/fotos/{id}/` |
| `eliminarFoto(id)` | DELETE | `/vision/fotos/{id}/` |
| `iniciarAnalisis(id)` | POST | `/vision/inspecciones/{id}/analizar/` |
| `abrirStreamInspeccion(id, handlers)` | SSE | `/vision/inspecciones/{id}/stream/` |

### Normalización de URLs de media

El worker Celery no tiene objeto `request` para construir URLs absolutas — el campo `imagen_anotada` en eventos SSE llega como path relativo (`media/inspecciones/...`). El GET inicial usa `build_absolute_uri` y llega absoluto.

Para que el merge no sobreescriba la URL buena con el path relativo:

```js
const _absMediaUrl = (path) => {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;      // ya absoluta
  const host = API_BASE.replace(/\/$/, '');
  return `${host}/${String(path).replace(/^\/+/, '')}`;
};
```

Se aplica en `_normalizeFoto` (para `foto-created`) y directamente en el handler de `foto-updated`.

---

## Server-Sent Events (SSE)

### `abrirStreamInspeccion(inspeccionId, handlers)`

Conecta `EventSource` al endpoint `/vision/inspecciones/{id}/stream/`. Retorna el objeto `EventSource` — el caller debe llamar `.close()` en el cleanup del `useEffect`.

```js
const es = abrirStreamInspeccion(inspeccionId, {
  onReady:   (payload) => {},           // handshake inicial
  onUpdate:  (payload) => {},           // transición de estado de una foto
  onCreated: (foto)    => {},           // nueva foto subida
  onDeleted: ({foto_id, inspeccion_id}) => {},
  onError:   (err)     => {},
});
return () => es.close();
```

El browser reconecta automáticamente (`retry: 5000` del servidor). El handler `onError` es informativo — no cancela la reconexión.

### Eventos tipados recibidos

| `event:` | Tipo del payload | Acción en estado React |
|----------|-----------------|----------------------|
| `ready` | `{inspeccion_id, ts}` | Handshake — no actualiza fotos |
| `foto-updated` | `{foto_id, estado, severidad, detecciones, tiempo_inferencia_ms, imagen_anotada, error_detalle}` | Merge in-place sobre la foto correspondiente |
| `foto-created` | `{foto: {...}}` | Append a `prev.fotos` (con dedup por id) |
| `foto-deleted` | `{foto_id, inspeccion_id}` | Filter de `prev.fotos` |
| `:keepalive` | — | Comentario SSE, ignorado por EventSource |

### Patrón de merge (`foto-updated`)

```js
onUpdate: (payload) => {
  setInspeccion((prev) => {
    const fotos = prev.fotos.map((f) =>
      f.id === payload.foto_id
        ? { ...f, ...payload, id: f.id }  // preserva id original (evita colisión foto_id vs id)
        : f
    );
    return { ...prev, fotos };
  });
},
```

El spread `...payload` incluye `foto_id` pero la foto en estado tiene `id`. Se fuerza `id: f.id` para mantener coherencia.

### Dedup en `foto-created`

```js
const existe = prev.fotos?.some((f) => f.id === foto.id);
if (existe) return prev;   // dedup multi-tab / multi-usuario: el SSE puede llegar dos veces si dos clientes comparten la misma inspección
```

> **Nota**: `handleUpload` no llama `fetchInspeccionDetalle` tras subir — el `foto-created` via SSE es la única fuente de append al estado. El dedup protege frente a múltiples consumidores SSE conectados simultáneamente (pestaña duplicada, inspector y supervisor), no frente a un reload propio.

---

## SubirFotos — gestión de estado

### Carga múltiple de archivos

El `<input type="file">` tiene atributo `multiple`. Al seleccionar varios archivos:

```js
const handleFileChange = async (e) => {
  const files = Array.from(e.target.files);
  e.target.value = '';   // reset inmediato para permitir re-selección del mismo archivo

  const availableSlots = Math.max(0, CONCURRENT_LIMIT - activeFotos);
  if (availableSlots === 0) return;

  const toUpload = files.slice(0, availableSlots);   // corta en el límite
  const skipped = files.length - toUpload.length;

  if (skipped > 0) {
    await Swal.fire({ /* modal informativa */ });     // aguarda confirmación del usuario
  }

  await Promise.all(toUpload.map((f) => handleUpload(f)));  // subida paralela
};
```

Las fotos se suben en paralelo. Cada `handleUpload` gestiona su propio incremento/decremento del contador `uploadingFiles`.

### Contador de uploads en vuelo

```js
const [uploadingFiles, setUploadingFiles] = useState(0);
const uploading = uploadingFiles > 0;

// En handleUpload:
setUploadingFiles((n) => n + 1);
// ... await subirFotoInspeccion ...
setUploadingFiles((n) => Math.max(0, n - 1));
```

El botón muestra badge con el conteo cuando `uploadingFiles > 1`:
```jsx
{uploading && uploadingFiles > 1 && (
  <span className="badge bg-white text-dark ms-1">{uploadingFiles}</span>
)}
```

### Sin reload post-subida

`handleUpload` no llama `fetchInspeccionDetalle` tras la subida. El evento `foto-created` emitido por el backend via SSE agrega la foto al estado automáticamente. Esto habilita la subida paralela sin condiciones de carrera sobre el estado.

---

## Rate limiting en el frontend

### Constante sincronizada con el backend

```js
const CONCURRENT_LIMIT = 10;  // mirrors VISION_RATE_LIMIT_MAX_CONCURRENT
```

Definida a nivel módulo. Debe mantenerse sincronizada con `backend/settings.py`.

### Cálculo de fotos activas

```js
const activeFotos = inspeccion?.fotos?.filter(
  (f) => f.estado === 'pendiente' || f.estado === 'en_proceso'
).length || 0;

const uploadBlocked = activeFotos >= CONCURRENT_LIMIT;
```

`activeFotos` se recalcula en cada render. Como el SSE actualiza `inspeccion.fotos` en tiempo real, `uploadBlocked` reacciona automáticamente cuando el worker completa fotos.

### Comportamiento al alcanzar el límite

| Condición | Efecto UI |
|-----------|-----------|
| `uploadBlocked = true` | Botones "Subir foto" y "Tomar foto" desactivados (`disabled`) |
| `uploadBlocked = true` | Aparece pill amber: `⏳ N fotos en proceso. Espera a que finalicen.` |
| Usuario selecciona más archivos de los slots disponibles | Modal SweetAlert2 centrada con conteo exacto, requiere confirmación antes de subir |
| Worker completa foto → SSE `foto-updated` con `completada` | `activeFotos` baja → botones se reactivan sin interacción del usuario |

### Modal de límite excedido

```js
await Swal.fire({
  icon: 'info',
  title: 'Límite de procesamiento',
  html: `Seleccionaste <strong>N</strong> imágenes, pero solo hay <strong>M</strong> espacios...`,
  confirmButtonText: 'Entendido',
  confirmButtonColor: '#003366',
});
// Las subidas comienzan DESPUÉS de que el usuario cierra la modal
```

---

## FotoCard — componente reutilizable

Recibe `compact` (boolean) para dos modos:

### Modo compact (`SubirFotos`)
- Imagen a ancho completo con toggle anotada/original
- Header con badge de estado + spinner si `pendiente`/`en_proceso`
- Botón eliminar inline

### Modo completo (`Resultados`)
- Imagen con badge de estado superpuesto (position absolute top-right)
- Toggle anotada/original
- Detecciones listadas con severidad por clase y porcentaje de confianza
- Alert de error con botón Reintentar si `estado === 'error'`
- Botón eliminar al fondo de la card

### Clases detectables y labels

| `class_name` | ES | EN |
|---|---|---|
| `corrosion` | Corrosión | Corrosion |
| `defect` | Defecto | Defect |
| `marine_growth` | Incrustación marina | Marine growth |
| `paint_peel` | Descascaramiento de pintura | Paint peel |
| `sea_chest_grating` | Rejilla de toma de mar | Sea chest grating |
| `over_board_valve` | Válvula de descarga | Over board valve |
| `propeller` | Hélice | Propeller |
| `anode` | Ánodo | Anode |
| `bilge_keel` | Quilla de balance | Bilge keel |
| `ship_hull` | Casco del buque | Ship hull |

### Mapa de severidades (frontend)

| Severidad | Color hex | Label ES |
|---|---|---|
| `critical` | `#dc2626` | Crítico |
| `high` | `#ea580c` | Alto |
| `medium` | `#d97706` | Medio |
| `low` | `#2563eb` | Bajo |

Solo las 4 clases con anomalías tienen severidad. Las estructurales (`ship_hull`, `propeller`, etc.) se muestran sin badge.

---

## CSS — `AIInspection.css`

### Paleta

| Token | Valor | Uso |
|---|---|---|
| Navy | `#003366` | Títulos, botón upload, selección activa |
| Accent | `#206bc4` | Hover, borders activos |
| BG | `#f5f7fa` | Fondo general (Tabler) |

### Clases principales

| Clase | Elemento |
|---|---|
| `.ai-btn-upload` | Botón subir foto (navy) |
| `.ai-btn-camera` | Botón tomar foto (verde `#1a6b4a`) |
| `.ai-btn-upload:disabled` / `.ai-btn-camera:disabled` | Estado bloqueado — gris `#cbd5e1`, texto `#64748b`, `opacity: 1` (anula default browser) |
| `.ai-upload-limit-msg` | Pill amber: fondo `#fef3c7`, texto `#92400e`, borde `#fcd34d` |
| `.ai-seccion-card` | Cards de zona del casco (seleccionable) |
| `.ai-seccion-panel` | Panel que se expande al seleccionar sección |
| `.ai-foto-card` | Card completa de foto (vista resultados) |
| `.ai-foto-compact` | Card compacta (vista subida) |
| `.ai-foto-toggle` | Barra de toggle anotada/original |
| `.ai-inspeccion-card` | Card del listado de inspecciones |
| `.ai-resultados-section-title` | Cabecera de grupo de sección en resultados |

### Dark mode

Implementado con `:root[data-bs-theme="dark"]` (Tabler/Bootstrap 5). Cubre:
- Fondos de cards → `#1f2937`
- Borders → `#334155`
- Textos → `#e5e7eb`
- Botones desactivados → fondo `#374151`, texto `#6b7280`
- Pill límite → fondo `rgba(146,64,14,0.25)`, texto `#fbbf24`
- Toggles y headers de foto → `#111827`

### Estado `:disabled` de botones de subida

Sin regla explícita el browser aplica `opacity: 0.65` al fondo oscuro de `.ai-btn-upload` → el texto blanco desaparece visualmente (parece que el botón solo muestra sombra). La regla override:

```css
.ai-btn-upload:disabled,
.ai-btn-camera:disabled {
  opacity: 1;
  background-color: #cbd5e1;
  border-color: #cbd5e1;
  color: #64748b !important;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}
```

---

## Diagrama de flujo de estado en el frontend

```
Usuario selecciona sección
        │
        ▼
Usuario selecciona archivo(s)
        │
        ├─ ¿activeFotos >= 10? → uploadBlocked = true → botón desactivado
        │
        ├─ ¿files.length > availableSlots?
        │       └── Modal informativa (await) → usuario confirma → sube slice permitido
        │
        ▼
subirFotoInspeccion() × N (paralelo)
        │
        ▼
Backend emite evento SSE "foto-created"
        │
        ▼
setInspeccion → append foto con estado "pendiente"
        │
        ▼
Usuario hace clic "Iniciar análisis"
        │
        ▼
iniciarAnalisis() → backend encola tareas en RabbitMQ
        │
        ▼
Worker Celery procesa → emite SSE "foto-updated" (EN_PROCESO)
        │
        ▼
setInspeccion → merge in-place → spinner visible en FotoCard
        │
        ▼
Worker termina → emite SSE "foto-updated" (COMPLETADA)
        │
        ▼
setInspeccion → merge → imagen_anotada disponible → foto renderizada sin reload
```
