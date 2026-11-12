# Nautic · Frontend

Interfaz web de inspección de cascos con tres secciones: **Buques** (listado, alta con secciones del casco y ficha técnica), **Visión IA** (alta de la inspección, carga de fotos por sección, elección del modelo y análisis en vivo por SSE) e **Inspecciones** (historial con filtros y resultados). Modo claro y oscuro.

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, React Router. Tests con Vitest y Testing Library.

## Puesta en marcha

Requisitos: Node 20.19+ o 22.12+, pnpm 12 (`corepack enable` instala la versión fijada en `package.json`) y el backend Django corriendo en `:8000` (ver el `README.md` de la raíz).

```bash
cd frontend
cp .env.example .env.local   # opcional
pnpm install
pnpm dev                     # http://localhost:5173
```

`VITE_API_BASE_URL` define la URL del backend. Si queda vacía, el navegador habla con Vite y Vite reenvía `/api` y `/media` a `http://localhost:8000` (ver `vite.config.ts`). Con una URL explícita, el backend debe permitir el origen en `CORS_ALLOWED_ORIGINS` (`:5173` ya está incluido).

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm test` | Tests (una pasada) |
| `pnpm test:watch` | Tests en modo watch |
| `pnpm lint` | oxlint |
| `pnpm build` | Typecheck + build de producción en `dist/` |

## Arquitectura

Organizada por funcionalidad (screaming) con puertos y adaptadores:

```
src/
├── app/            # composición: router, layout, raíz de dependencias
├── inspecciones/
│   ├── domain/         # tipos y reglas puras (progreso, severidad, eventos en vivo, filtros y páginas de búsqueda)
│   ├── application/    # puertos: InspeccionesRepository, ModelosIA, EventosInspeccion
│   ├── infrastructure/ # adaptadores: HTTP (fetch) y SSE (EventSource), mapeo snake_case → dominio
│   └── ui/             # páginas (contenedores) y componentes de presentación
├── buques/         # puerto BuquesRepository, adaptador HTTP (/api/buques/) y pantallas
├── shared/         # cliente HTTP, tema, hooks y átomos de UI
└── test/           # setup de Vitest y dobles de prueba
```

- **Rutas:** `/vision` (alta de inspección, con nombre opcional), `/vision/:id` (carga por zona, selector de modelo de IA y «Iniciar análisis») y `/vision/:id/resultados`; `/` es el historial de «Inspecciones» y `/buques` la flota. `/inspecciones/nueva` y `/inspecciones/:id/carga` redirigen a las rutas de Visión IA; `/inspecciones/:id/resultados` se mantiene. El selector usa `GET /api/vision/modelos/` (preselecciona el modelo por defecto y lista como «no disponible» los que el servidor no puede usar).
- **Historial de inspecciones (`/`):** busca en el servidor (`GET /api/vision/inspecciones/`, una página de 24 por llamada). Los filtros (buque, desde, hasta, severidad mínima y nombre) viven en la URL (`?buque=&desde=&hasta=&severidad_min=&q=`), el texto se envía con 300 ms de retardo y solo con 2 o más caracteres, y «Cargar más» añade la página siguiente mientras el servidor indique que hay más. Los errores 400 por campo se muestran junto a su control. Cada tarjeta muestra el nombre y la severidad máxima; el nombre se edita en la pantalla de resultados.
- Las páginas obtienen los adaptadores con `useDependencias()`; `app/composicion.ts` es el único lugar que decide qué adaptador implementa cada puerto. Los tests inyectan dobles (`src/test/dobles.tsx`).
- El estado de las fotos se actualiza por SSE (`/api/vision/inspecciones/<id>/stream/`), sin polling. `EventSource` reconecta solo.
- Los errores del backend (`{"error": ...}` o `{"detail": ...}`) se muestran tal cual; los fallos de red o respuestas ilegibles muestran un mensaje genérico.

## Limitaciones conocidas

- **Buques:** el adaptador HTTP (`HttpBuquesRepository`) implementa `listar` (recorre todas las páginas de `GET /api/buques/`), `obtener` y `crear`, y alimenta el selector de «Nueva inspección». Las pantallas están en `buques/ui/`: lista con búsqueda (`/buques`), alta (`/buques/nuevo`) y ficha técnica (`/buques/:id`), con un enlace «Buques» en la navegación. El alta incluye el bloque «Secciones del casco» (estándar o propias; el modo estándar omite `secciones` en el POST) y la ficha las lista; la carga de fotos pide las secciones del buque de la inspección (`GET /api/vision/secciones/?buque=<id>`). El backend no ofrece edición ni borrado (plan en `odd/tasks/buques-frontend.md`).
- **Exportar resultados:** no implementado (no hay endpoint).

## Tests

TDD: cada comportamiento tiene primero su test. Los tests de páginas recorren la interfaz pública (roles y etiquetas accesibles) con adaptadores falsos; los adaptadores HTTP y SSE se prueban con `fetch` y `EventSource` simulados.
