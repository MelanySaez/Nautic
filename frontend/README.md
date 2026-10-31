# Nautic · Frontend

Interfaz web de inspección de cascos: listado de inspecciones, alta de inspección, carga de fotos por zona del casco con estado de análisis en vivo (SSE) y resultados del análisis de IA. Modo claro y oscuro.

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, React Router. Tests con Vitest y Testing Library.

> `interfaz/` contiene los mockups originales. Son solo referencia visual: no se importan ni se publican.

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
│   ├── domain/         # tipos y reglas puras (progreso, severidad, eventos en vivo, búsqueda)
│   ├── application/    # puertos: InspeccionesRepository, EventosInspeccion
│   ├── infrastructure/ # adaptadores: HTTP (fetch) y SSE (EventSource), mapeo snake_case → dominio
│   └── ui/             # páginas (contenedores) y componentes de presentación
├── buques/         # puerto BuquesRepository + adaptador HTTP (/api/buques/)
├── shared/         # cliente HTTP, tema, hooks y átomos de UI
└── test/           # setup de Vitest y dobles de prueba
```

- Las páginas obtienen los adaptadores con `useDependencias()`; `app/composicion.ts` es el único lugar que decide qué adaptador implementa cada puerto. Los tests inyectan dobles (`src/test/dobles.tsx`).
- El estado de las fotos se actualiza por SSE (`/api/vision/inspecciones/<id>/stream/`), sin polling. `EventSource` reconecta solo.
- Los errores del backend (`{"error": ...}` o `{"detail": ...}`) se muestran tal cual; los fallos de red o respuestas ilegibles muestran un mensaje genérico.

## Limitaciones conocidas

- **Buques:** el adaptador HTTP (`HttpBuquesRepository`) implementa `listar` (recorre todas las páginas de `GET /api/buques/`), `obtener` y `crear`, y alimenta el selector de «Nueva inspección». Aún no hay pantallas de buques (lista, alta, ficha técnica); el backend no ofrece edición ni borrado (plan en `odd/tasks/buques-frontend.md`).
- **Exportar resultados:** no implementado (no hay endpoint).

## Tests

TDD: cada comportamiento tiene primero su test. Los tests de páginas recorren la interfaz pública (roles y etiquetas accesibles) con adaptadores falsos; los adaptadores HTTP y SSE se prueban con `fetch` y `EventSource` simulados.
