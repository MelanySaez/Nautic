# Feature: inspecciones-busqueda-frontend

## Objective
Replace the client-side inspection filtering with server-side search: send the filters to the API,
load results page by page ("Cargar más"), and let users name and rename inspections.

## Problem / Why
The backend now searches and paginates inspections (feature `inspecciones-busqueda`, see
`odd/tasks/inspecciones-busqueda.md`). As a **temporary** measure the frontend adapter still downloads
every inspection:

- `HttpInspeccionesRepository.listar()` follows the cursor (`?limit=100&cursor=…`) while `hay_mas` is
  true and concatenates all pages (safety cap: 100 pages = 10,000 inspections).
- `ListaInspeccionesPage` then filters in the browser with `filtrarInspecciones`
  (`inspecciones/domain/reglas.ts`), matching only `buqueNombre` and `tomadoPor`.

This keeps the current screen working, but it does not scale: every visit downloads the whole table,
and it is exactly the cost the backend search was built to avoid. Inspections grow without bound
(each one adds photos), so this must be replaced before real data accumulates.

## Status
IN PROGRESS (2026-10-31), branch `feat/inspecciones-historial-01-datos` from `main` (b415dd2). Third
frontend section: Inspecciones is the history of inspections already created (creation and analysis
live in Visión IA, `odd/tasks/vision-ia-frontend.md`).

Updates since the handoff:
- `ApiError.campos` exists (buques-frontend T1).
- Optional `nombre` on create is done in Visión IA (`/vision`); T4 keeps only the rename.
- The inspection detail for the history is the results page `/inspecciones/:id/resultados`; the
  rename (PATCH `nombre`) lives there.
- Tests: user rule — minimal tests only (happy path + key error case); run only the touched test
  files, never the full suite (`pnpm vitest run <files>`, `pnpm lint`, `pnpm build`).
- Delivery: stacked PRs to main; slice 1 = T1+T2 (`feat/inspecciones-historial-01-datos`), slice 2 =
  T3-T5 (`feat/inspecciones-historial-02-pantallas`). Route: delegated direct (single writer).

Previously:
NOT STARTED (handoff). Backend done on branch `feat/inspecciones-busqueda`.

## API contract (verified against `backend/vision/busqueda.py`, `views.py`)

### `GET /api/vision/inspecciones/`
Query parameters (all optional, combined with AND; unknown parameters are ignored):

| Param | Type | Rules |
|---|---|---|
| `buque` (alias `buque_id`) | int | Vessel id, positive |
| `desde` | date `YYYY-MM-DD` | Created on/after this day |
| `hasta` | date `YYYY-MM-DD` | Created on/before this day (whole day). `desde > hasta` → error on `desde` |
| `severidad_min` | `low` \| `medium` \| `high` \| `critical` | `severidad_max >= level` |
| `q` | text | 2–100 chars, case-insensitive substring of `nombre`; `%` and `_` are literal |
| `limit` | int | 1–100, default 20 |
| `cursor` | opaque string | The `siguiente` value of the previous page; never build or parse it |

Response 200:
```json
{
  "resultados": [
    {
      "id": 12,
      "buque_id": 3,
      "buque_nombre": "ARC Valdivia",
      "nombre": "Inspección #12 — ARC Valdivia",
      "severidad_max": "high",
      "descripcion": "",
      "tomado_por": "",
      "fecha_creacion": "2026-10-29T18:04:11.532000",
      "fecha_modificacion": "2026-10-29T18:04:11.532000",
      "total_fotos": 8
    }
  ],
  "siguiente": "<opaque cursor string>",
  "hay_mas": true
}
```
- Order is fixed: newest first (`-fecha_creacion, -id`). There is **no `total`** (by design).
- `severidad_max` is `null` until a photo of the inspection is processed.
- Timestamps are naive (no `Z`/offset; `USE_TZ=False`).

Response 400 (all invalid parameters reported together):
```json
{"error": "Datos inválidos.", "campos": {"q": ["Debe tener entre 2 y 100 caracteres."], "desde": ["No puede ser posterior a \"hasta\"."]}}
```
Messages used: `Debe ser un entero positivo.`, `Debe ser una fecha con formato AAAA-MM-DD.`,
`Fecha inexistente. Use el formato AAAA-MM-DD.`, `Debe ser uno de: …`, `Contiene caracteres no
permitidos.`, `Debe tener entre 2 y 100 caracteres.`, `Debe ser un entero entre 1 y 100.`,
`Cursor inválido.`

### `POST /api/vision/inspecciones/`
Adds optional `nombre` (string ≤ 255, trimmed). Missing/blank → backend generates
`Inspección #<id> — <buque>` and stores it. Invalid → 400 `{"error","campos":{"nombre":[…]}}`.

### `PATCH /api/vision/inspecciones/<id>/`
Editable: `nombre` (blank → regenerated default) and `descripcion`. Unknown fields → 400 `campos`.
Returns the same shape as `GET` detail (including `fotos`).

## Current frontend state (to change)
- `inspecciones/infrastructure/HttpInspeccionesRepository.ts`: `listar()` walks all pages (temporary).
- `inspecciones/infrastructure/dtos.ts`: `ListaInspeccionesDto`; `nombre` and `severidad_max` exist on
  the DTO type but are **not mapped** into the domain `Inspeccion`.
- `inspecciones/ui/ListaInspeccionesPage.tsx`: loads everything once, filters with
  `filtrarInspecciones` on each keystroke.
- `inspecciones/ui/NuevaInspeccionPage.tsx`: no `nombre` input.

## Scope (proposed)
- Domain: `Inspeccion.nombre`, `Inspeccion.severidadMax` (`'low' | … | null`), a `FiltroInspecciones`
  type, and a page type `{ resultados, siguiente, hayMas }`.
- Port: replace `listar()` with `buscar(filtro, cursor?)` returning one page. Remove the walk-all loop.
- `ListaInspeccionesPage`: filter bar (vessel select, date range, minimum severity, text) whose state
  lives in the URL query string (shareable, survives reload); debounce the text input (~300 ms) and
  only send `q` with ≥ 2 chars; reset the cursor when any filter changes; "Cargar más" appends the next
  page while `hayMas`; ignore stale responses when filters change mid-request.
- Show `nombre` and the `severidadMax` badge on each card.
- `NuevaInspeccionPage`: optional "Nombre" input (placeholder explains that a name is generated).
- Detail page: rename action (PATCH), with per-field server errors.
- Delete `filtrarInspecciones` once nothing uses it.

## Out of scope
- Natural-language search (backend phase 2; `describir_filtros()` in `busqueda.py` is the schema
  source, not exposed over HTTP yet).
- Totals / page numbers (the API intentionally has none).

## Constraints (AGENTS.md)
TDD with fakes from `src/test/dobles.tsx`; adapters only via `useDependencias()` and
`src/app/composicion.ts`; snake_case → domain mapping in `infrastructure/dtos.ts`;
container/presentational; Tailwind semantic tokens; Spanish UI copy, English comments; pnpm.
Per-field errors need `ApiError` to keep `campos` (see task T1 of `odd/tasks/buques-frontend.md`;
do it once and share it).

## Checklist
- [x] T1 — Domain + DTO mapping for `nombre`, `severidadMax`; filter and page types.
- [ ] T2 — Port `buscar(filtro, cursor?)` + HTTP adapter (query building, cursor passthrough, 400
      `campos`), remove the walk-all `listar()`; adapter tests.
- [ ] T3 — `ListaInspeccionesPage` with server filters in the URL, debounce, "Cargar más", stale
      response guard, empty/error states; remove `filtrarInspecciones`.
- [ ] T4 — Rename on the detail/results page (PATCH). (Name on create: done in Visión IA.)
- [ ] T5 — Cards show `nombre` and the severity badge; docs (AGENTS.md, frontend README).

## Progress / Evidence
- T1 `feat(inspecciones): map nombre and severidadMax, add search filter and page types` — route: delegated direct (single writer). RED: the adapter test expecting `nombre`/`severidadMax` in the mapped inspection failed (fields missing). GREEN: `pnpm vitest run src/inspecciones/infrastructure/HttpInspeccionesRepository.test.ts src/inspecciones/domain/reglas.test.ts` 30/30; `pnpm lint` exit 0; `pnpm build` ok.

## Acceptance criteria
- The list never downloads more than one page per user action.
- Filters combine; changing any filter restarts from the first page; invalid input shows the server
  message next to the right control.
- "Cargar más" appends without duplicates and disappears when `hayMas` is false.
- A created inspection without a name shows the generated one; renaming updates list and detail.

## Checks
From `frontend/`: touched test files only (`pnpm vitest run <files>`), `pnpm lint`, `pnpm build`; manual smoke against the backend.

## Next step
T2.
