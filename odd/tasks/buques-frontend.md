# Feature: buques-frontend

## Objective
Replace the in-memory vessel adapter with a real HTTP adapter against `/api/buques/` and add the
Buques section to the SPA: list, create, and technical-sheet detail. The vessel selector used when
creating an inspection must keep working, now backed by real data.

## Problem / Why
The backend exposes Buques (`feat/buques-backend`, commits 75f7331 and 58fa898) but the frontend
still serves vessels from `EnMemoriaBuquesRepository` + a hard-coded seed whose ids must exist in the
`buques` table. There is no screen to create or browse vessels, so the only way to get a vessel is
the database. Inspections depend on real vessels.

## Status
IN PROGRESS (2026-10-31), branch `feat/buques-frontend` from `main` (71fe803). First of three frontend
features requested by the user: Buques, then Visión IA (`odd/tasks/vision-ia-frontend.md`, inspection
creation + section + upload + model + analyze), then the Inspecciones history
(`odd/tasks/inspecciones-busqueda-frontend.md`). The existing frontend is a style reference (tokens,
layout, theme); `frontend/interfaz/` mockups do not exist in the repo.

Previously: NOT STARTED (handoff). Backend done and tested on branch `feat/buques-backend`
(28 tests in `backend/vision/tests/test_buques_api.py`). Frontend work should branch from it (or from
`main` once it is merged). No frontend file has been touched.

## API contract (verified against `backend/vision/views_buques.py`, `urls.py`, `models.py`, tests)

All paths are under `/api/`. No authentication. Only GET and POST exist on these paths (PUT, PATCH,
DELETE answer DRF's 405). Dev: Vite proxies `/api` and `/media` to `:8000` only when
`VITE_API_BASE_URL` is empty; with a value set (see Discrepancies) the browser calls Django directly
and CORS must allow the Vite origin (`http://localhost:5173` is allowed in `config/settings.py`).

### `GET /api/buques/` — paginated summary list
- Query params (both optional, manual pagination, not DRF's):
  - `offset`: integer >= 0, max 2147483647, default 0.
  - `limit`: integer 1..200, default 50.
- Invalid value (negative, non-digit, `1.5`, empty string, out of range, > 12 chars) → 400
  `{"error": "offset debe ser un entero >= 0 y limit un entero entre 1 y 200."}`.
- Ordering: `nombre`, then `id` (server side, case-sensitive DB collation; do not rely on it matching
  `localeCompare('es')`).
- Response 200 — summary fields only (not the technical sheet):
```json
{
  "total": 2,
  "offset": 0,
  "limit": 50,
  "resultados": [
    {
      "id": 1,
      "nombre": "ARC Caribe",
      "tipo": "Fragata",
      "etapa": "En construcción",
      "imagen": "caribe.png",
      "created_at": "2026-10-28T22:41:07.512903",
      "updated_at": "2026-10-28T22:41:07.512903"
    },
    {
      "id": 2,
      "nombre": "Lancha",
      "tipo": "Patrullera",
      "etapa": "Activo",
      "imagen": null,
      "created_at": "2026-10-28T22:43:51.100214",
      "updated_at": "2026-10-28T22:43:51.100214"
    }
  ]
}
```
- `offset` beyond `total` → 200 with `resultados: []`.
- Timestamps: Django runs with `USE_TZ = False` and `TIME_ZONE = "America/Bogota"`, so `isoformat()`
  yields a NAIVE local timestamp (no `Z`, no offset). `new Date(iso)` parses it as browser-local time,
  same as the existing inspection dates.

### `POST /api/buques/` — create
- Body: JSON object (anything else → 400 `{"error": "Se esperaba un objeto JSON."}`).
- Required, non-blank (trimmed server side): `nombre`, `tipo` (strings, max 255).
- All other fields optional; omitted fields take the model default. Unknown keys and the read-only keys
  `id`, `created_at`, `updated_at` are rejected with `"Campo desconocido o no editable."`.
- Writable fields (28):

| Field | Type | Null allowed | Default if omitted | Notes |
|---|---|---|---|---|
| `nombre` | string | no | — (required) | trimmed, max 255 |
| `tipo` | string | no | — (required) | trimmed, max 255 |
| `descripcion` | string | no | `""` | blank allowed; not trimmed |
| `etapa` | string | no | `"Activo"` | max 255; `""` rejected ("Este campo no puede estar en blanco."); not trimmed |
| `imagen` | string | yes | `null` | plain path/name string, max 255. No upload support |
| `autonomia_horas` | integer | yes | `null` | >= 0 |
| `vida_diseno_anios` | integer | yes | `null` | >= 0 |
| `horas_navegacion_anio` | integer | yes | `null` | >= 0 |
| `autonomia_dias` | integer | yes | `null` | >= 0 |
| `vel_maxima_nudos` | number | yes | `null` | >= 0 |
| `alcance_nm_a_12kn` | number | yes | `null` | >= 0 |
| `eslora_total_m` | number | yes | `null` | >= 0 |
| `manga_moldeada_m` | number | yes | `null` | >= 0 |
| `puntal_m` | number | yes | `null` | >= 0 |
| `calado_diseno_m` | number | yes | `null` | >= 0 |
| `desplazamiento_ton` | number | yes | `null` | >= 0 |
| `combustible_diario_m3` | number | yes | `null` | >= 0 |
| `combustible_diesel_m3` | number | yes | `null` | >= 0 |
| `combustible_helicoptero_m3` | number | yes | `null` | >= 0 |
| `gasolina_botes_m3` | number | yes | `null` | >= 0 |
| `agua_potable_m3` | number | yes | `null` | >= 0 |
| `aceite_lubricante_m3` | number | yes | `null` | >= 0 |
| `aceite_hidraulico_m3` | number | yes | `null` | >= 0 |
| `rondas_config` | JSON object | no (null → container error) | `{}` | free-form, no schema |
| `contexto_operacional` | JSON object | no | `{}` | free-form, no schema |
| `documentos` | JSON array | no | `[]` | free-form items |
| `misiones` | JSON array | no | `[]` | free-form items |
| `grupos_constructivos` | JSON array | no | `[]` | free-form items (SWBS groups) |

- Numeric rules: must be real JSON numbers (strings and booleans rejected), finite, `>= 0`. Integer
  fields (`autonomia_horas`, `vida_diseno_anios`, `horas_navegacion_anio`, `autonomia_dias`) accept
  `120` or `120.0` but reject `1.5`, and are capped at 2147483647 (PostgreSQL int4). Float fields reject
  absurdly large values ("Número fuera de rango."). Send numbers, never numeric strings.
- Success → **201** with the full detail object (below).
- Error → **400**, all field errors reported together, each field maps to a list of messages:
```json
{
  "error": "Datos inválidos.",
  "campos": {
    "nombre": ["Este campo es requerido."],
    "tipo": ["Este campo es requerido."],
    "puntal_m": ["No puede ser negativo."]
  }
}
```
  Messages seen in code (Spanish, show as-is): `Este campo es requerido.`, `Debe ser texto.`,
  `Debe ser un número.`, `Debe ser un número entero.`, `Debe ser un número finito.`,
  `No puede ser negativo.`, `Número fuera de rango.`, `Debe ser un objeto JSON.`,
  `Debe ser una lista JSON.`, `Este campo no puede ser nulo.`, `Campo desconocido o no editable.`,
  plus Django `full_clean` messages (es-co), e.g. `Asegúrese de que este valor tenga como máximo 255
  caracteres (tiene 256).` and `Asegúrese de que este valor sea menor o igual a 2147483647.`.
  The `campos` keys are the snake_case field names above.

### `GET /api/buques/<id>/` — technical sheet
- 200 → full object: `id`, then the 28 writable fields, then `created_at`, `updated_at`.
```json
{
  "id": 1,
  "nombre": "ARC Caribe",
  "tipo": "Fragata",
  "descripcion": "Buque de prueba",
  "autonomia_horas": 120,
  "vida_diseno_anios": null,
  "horas_navegacion_anio": null,
  "imagen": "caribe.png",
  "etapa": "En construcción",
  "rondas_config": {"intervalo": 4},
  "documentos": [{"nombre": "plano.pdf"}],
  "vel_maxima_nudos": null,
  "autonomia_dias": null,
  "alcance_nm_a_12kn": null,
  "eslora_total_m": 110.5,
  "manga_moldeada_m": null,
  "puntal_m": null,
  "calado_diseno_m": null,
  "desplazamiento_ton": 1900.0,
  "combustible_diario_m3": null,
  "combustible_diesel_m3": null,
  "combustible_helicoptero_m3": null,
  "gasolina_botes_m3": null,
  "agua_potable_m3": null,
  "aceite_lubricante_m3": null,
  "aceite_hidraulico_m3": null,
  "contexto_operacional": {"zona": "Caribe"},
  "misiones": ["patrulla"],
  "grupos_constructivos": [{"codigo": "100"}],
  "created_at": "2026-10-28T22:41:07.512903",
  "updated_at": "2026-10-28T22:41:07.512903"
}
```
- Unknown id → **404**, DRF default body (`{"detail": ...}`; the backend tests assert only the status
  code, so do not hard-code the message). The shared `ApiClient` already surfaces `detail`.
- Non-integer id in the path never reaches the view (`<int:buque_id>` → plain Django 404, likely HTML);
  the client's generic fallback message covers it.

### Related existing contract
`POST /api/vision/inspecciones/` takes `buque_id`; unknown vessel → 404. Inspection DTOs already carry
`buque_id` and `buque_nombre`. `GET /api/vision/inspecciones/?buque_id=` filters by vessel (not used by
the frontend today).

## Current frontend state (verified)
Stack: React 19, React Router 7, Vite, Tailwind 4, Vitest + Testing Library, oxlint, pnpm.

| File | Today |
|---|---|
| `frontend/src/buques/domain/buque.ts` | `Buque { id, nombre, tipo }`; port `BuquesRepository { listar(): Promise<Buque[]> }`. |
| `frontend/src/buques/infrastructure/EnMemoriaBuquesRepository.ts` (+ `.test.ts`) | Sorts the seed with `localeCompare(..., 'es')`. Its doc comment says to replace it once `/api/buques/` exists. |
| `frontend/src/buques/infrastructure/semilla.ts` | `BUQUES_SEMILLA` = ids 1 and 2 (`Buque 1`/`Patrullero`, `Buque 2`/`Corbeta`); only consumer is `composicion.ts`. |
| `frontend/src/app/composicion.ts` | `crearDependencias()` wires `buques: new EnMemoriaBuquesRepository(BUQUES_SEMILLA)`. The only place that picks adapters. |
| `frontend/src/app/router.tsx` | Routes: `/`, `/inspecciones/nueva`, `/inspecciones/:id/carga`, `/inspecciones/:id/resultados`. No buques routes. |
| `frontend/src/app/AppLayout.tsx` | Header nav has one `NavLink` ("Inspecciones", `to="/"`, `end`) inside `<nav aria-label="Principal">`. |
| `frontend/src/inspecciones/ui/NuevaInspeccionPage.tsx` | Only consumer of the port: `buques.listar()` via `useRecurso`, renders `<option>{nombre} · {tipo}</option>`; sends `buqueId` as `Number`. Its test asserts the option `ARA Libertad · Fragata` from the fake. |
| `frontend/src/inspecciones/infrastructure/{dtos.ts,HttpInspeccionesRepository.ts}` | Reference pattern: snake_case `*Dto` interfaces + `a*` mappers in `dtos.ts`; HTTP adapter takes `(baseUrl, fetcher?)`, owns an `ApiClient`; tests inject a `vi.fn<typeof fetch>()` and assert URL, method, JSON body and mapped result. |
| `frontend/src/shared/http/apiClient.ts` | `ApiClient` (`get/post/delete`) and `ApiError(status, message)`. `mensajeDeError` reads only `error` and `detail` from the body; it DROPS `campos`. |
| `frontend/src/shared/hooks/useRecurso.ts` | `{estado: cargando|error|listo, reintentar, actualizar}` for page data loading. |
| `frontend/src/shared/ui/*` | `Campo` (label + error/help; clones `id`/`aria-invalid` onto its single child), `CLASES_CONTROL`, `Boton`/`EnlaceBoton`, `Tarjeta`, `Cargando`/`MensajeError`/`Vacio`, `Icon` (has `ship`, `plus`, `search`, `back`, ...), `formatearFecha`, `mensajeDe`. |
| `frontend/src/test/dobles.tsx` | `crearDependenciasFalsas()` with `vi.fn` fakes; `buques` fake only has `listar` returning `ARA Almirante Brown`(1)/`ARA Libertad`(2); `renderizarRutas()` helper; `satisfies Dependencias` so a port change breaks compilation until the fake is updated. |

### Missing
- Port methods `obtener(id)` and `crear(datos)`; domain types for summary, detail/sheet and creation input.
- DTOs + mappers (`buques/infrastructure/dtos.ts`) and `HttpBuquesRepository` with tests.
- Field-level errors from the API (`campos`) in `ApiError`.
- Composition switch from the in-memory seed to HTTP.
- Screens (list, create, detail), routes and nav entry.
- Pagination handling: the port's `listar()` returns every vessel, the API returns at most 200 per page.

## Scope (proposed)
1. `ApiError` carries optional per-field errors parsed from `{"campos": {...}}`.
2. Domain + port: `listar`, `obtener`, `crear`.
3. `HttpBuquesRepository` + DTOs; `listar()` walks pages (`limit=200`, advance `offset` until `total`) so
   the inspection vessel selector keeps receiving the complete fleet.
4. Switch `composicion.ts` to HTTP; delete `EnMemoriaBuquesRepository`, its test and `semilla.ts`
   (nothing else uses them).
5. Pages: `ListaBuquesPage` (cards/table, client-side search by name/type, empty/error/loading states),
   `NuevoBuquePage` (create form, per-field server errors), `BuqueDetallePage` (technical sheet).
6. Routes `/buques`, `/buques/nuevo`, `/buques/:id` and a "Buques" nav link.
7. Docs: `AGENTS.md` (Frontend "Vessels" bullet), `frontend/README.md` (Buques paragraph + tree line).

## Out of scope
- Update/edit and delete of vessels: the endpoints do not exist (405). Do not add edit/delete buttons.
- Image upload: `imagen` is a plain string (name or path, max 255); there is no upload endpoint and no
  media URL resolution contract for it. Render it only if it is an absolute URL or a Vite-served
  `/media/...` path is confirmed (see open questions); otherwise show a placeholder.
- Editors for the free-form JSON fields (`rondas_config`, `contexto_operacional`, `documentos`,
  `misiones`, `grupos_constructivos`): no schema exists.
- Server-side search/filter on vessels (the API has none), authentication, i18n layer.
- Listing a vessel's inspections on its detail page (possible later with `?buque_id=`).
- Backend changes of any kind.

## Constraints (from AGENTS.md)
- Commands run from `frontend/` with **pnpm**; never commit `package-lock.json` or `yarn.lock`.
- **TDD**: failing test first. Page tests use accessible roles/labels and the fakes from
  `src/test/dobles.tsx`; never hit the real API in tests (HTTP adapter tests inject a mock `fetch`).
- **Ports and adapters**: pages obtain adapters via `useDependencias()`; only `src/app/composicion.ts`
  picks implementations. Port in `buques/domain/`, adapter in `buques/infrastructure/`; pages in
  `buques/ui/`.
- Map snake_case DTOs to the domain in `buques/infrastructure/dtos.ts`; components never see wire shapes.
- **Container / presentational**: `*Page.tsx` loads data and owns state; presentational components get
  props only.
- No polling; no direct `core_engine`/backend assumptions in components.
- Styling: Tailwind semantic tokens from `src/index.css` (`bg-surface`, `text-ink`, `border-line`,
  `text-critical`, ...), rarely `dark:` variants.
- Identifiers in Spanish domain language (`Buque`, `obtener`, `crear`); UI copy neutral Spanish; code
  comments in English.
- Task size heuristic (advisory only): about 400 authored changed lines per task; never split or
  shrink artificially.

## TDD
Mode: ON. Source: AGENTS.md Frontend section ("write the failing test first"). Runner: Vitest —
`pnpm test` (all, single run) or `pnpm vitest run <file>` / `pnpm vitest run -t "<name>"`. Observe RED
before implementing, then GREEN, then refactor.

## Checklist
Conventional Commit per task, tests and docs alongside the behavior.

- [x] T1 — Field errors in `ApiClient`. Add optional `campos?: Record<string, string[]>` to `ApiError`;
      when the error body has `campos` (object of string arrays), keep it; the message stays
      `error`/`detail` (so `Datos inválidos.`). Tests (new `apiClient.test.ts` or via the buques adapter
      test): body with `campos` → `ApiError.campos` populated; malformed `campos` ignored; existing
      `HttpInspeccionesRepository` tests stay green.
- [ ] T2 — Domain + port. In `buques/domain/buque.ts` model: summary (`id, nombre, tipo, etapa,
      imagen, createdAt, updatedAt`; keep the exported `Buque` usable by `NuevaInspeccionPage` and its
      test, so either extend `Buque` or keep it as the summary), the sheet (`BuqueDetalle` with the 28
      fields in camelCase: numbers as `number | null`, JSON fields typed as `Record<string, unknown>` /
      `unknown[]`), and `NuevoBuque` (required `nombre`, `tipo`; everything else optional). Extend
      `BuquesRepository` with `obtener(id)` and `crear(datos)`. Update `crearDependenciasFalsas()` with
      `obtener`/`crear` and a `unBuque()`/`unDetalleBuque()` factory. Keep `tsc -b` green:
      `EnMemoriaBuquesRepository` gets a minimal implementation (it is deleted in T4). Acceptance:
      `pnpm build` and `pnpm test` green, no behavior change.
- [ ] T3 — DTOs + `HttpBuquesRepository`. `BuqueResumenDto`, `BuqueDetalleDto`, `ListaBuquesDto
      {total, offset, limit, resultados}`, mappers `aBuque`/`aBuqueDetalle`, and the inverse
      `aNuevoBuqueDto` (camelCase → snake_case, omit undefined/empty optionals). Adapter:
      `listar()` requests `/api/buques/?offset=N&limit=200` until `offset >= total`; `obtener(id)` →
      `/api/buques/${id}/`; `crear(datos)` → POST `/api/buques/`. Tests with injected `fetch`: URLs and
      query, pagination across 2 pages, mapping of nulls and JSON fields, POST body, 201 → detail,
      400 with `campos` → `ApiError.campos`, 404, network error. Acceptance: all green, no UI touched.
- [ ] T4 — Composition switch. `crearDependencias()` uses `new HttpBuquesRepository(API_BASE_URL)`.
      Delete `EnMemoriaBuquesRepository.ts`, its test and `semilla.ts`. Verify `NuevaInspeccionPage`
      tests are untouched and green (they use the fake). Update the AGENTS.md "Vessels" bullet and
      `frontend/README.md` (tree line and Buques paragraph). Acceptance: no reference to the seed
      remains (`grep -r "BUQUES_SEMILLA\|EnMemoria" frontend/src` empty); manual check that the
      selector in "Nueva inspección" lists real DB vessels.
- [ ] T5 — `ListaBuquesPage` (`buques/ui/`). Loads via `useRecurso(buques.listar)`; presentational
      `TarjetaBuque` (nombre, tipo, etapa badge, `imagen` placeholder) linking to `/buques/:id`; search
      box by nombre/tipo (pure helper `filtrarBuques` in `buques/domain/`, like
      `filtrarInspecciones`); `Cargando`, `MensajeError` with retry, `Vacio` with a "Nuevo buque" CTA;
      header button to `/buques/nuevo`. Tests: renders vessels, filters, empty state, error + retry,
      links.
- [ ] T6 — `NuevoBuquePage` (create form). Required `Nombre` and `Tipo` (client-side "required"
      message before calling the port); optional `Etapa`, `Descripción`, `Imagen` and the numeric
      technical-sheet fields (final field set pending the open question; propose at least the
      dimension/performance group). Numeric inputs send `number` (empty → omitted), `>= 0`. On
      `ApiError` with `campos`, show each message under its field via `Campo error=...` (map snake_case
      keys to the form's camelCase fields; show unmapped keys and `error` in a top-level `MensajeError`);
      other errors (network, 500) in the alert. Disable submit while sending. On success navigate to
      `/buques/:id`. Tests: happy path (port called with the exact object), client-side required,
      per-field server errors incl. a 400 with several fields, generic error, double-submit guard.
- [ ] T7 — `BuqueDetallePage` (`/buques/:id`, key the page by id like the existing route wrappers).
      Container loads `obtener(Number(id))`; presentational sheet grouped (see open questions);
      null values render as "—"; units in labels (m, m³, nudos, ton, h, días, años); dates via
      `formatearFecha`; JSON fields rendered read-only or hidden per the open question. Handle 404
      (message from `ApiError`) and a non-numeric id with a friendly message and a back link. Tests:
      renders sheet and nulls, 404, loading, retry.
- [ ] T8 — Routes and nav. Add `/buques`, `/buques/nuevo`, `/buques/:id` to `router.tsx`; add a
      "Buques" `NavLink` (`to="/buques"`) to the main nav; keep "Inspecciones" `end` so it does not
      stay active on `/buques`. Update `AppLayout.test.tsx` (both links present, active state). Run the
      checks and do a manual smoke against the real backend.

## Acceptance criteria
- The vessel list shows real data from `GET /api/buques/` (all pages) sorted as the API returns.
- A vessel can be created from the UI; `nombre`/`tipo` required; each server-side field error in
  `campos` appears under the right input in Spanish; the new vessel then appears in the list and in the
  "Nueva inspección" selector without any seed.
- The detail page shows the full technical sheet for an existing id and a clear message for an unknown
  id.
- No code path imports `EnMemoriaBuquesRepository` or `BUQUES_SEMILLA`; only `composicion.ts` chooses
  the adapter.
- Light and dark themes work (semantic tokens only); UI copy Spanish, comments English.
- Existing inspection tests remain green.

## Checks
Run from `frontend/`:
- `pnpm test`
- `pnpm lint`
- `pnpm build` (runs `tsc -b`)
- Manual smoke: backend on `:8000` (`uv run python manage.py runserver` from `backend/`), `pnpm dev`
  on `:5173` with `VITE_API_BASE_URL` empty (proxy) or set to `http://localhost:8000` (CORS allows
  5173); create a vessel, open its detail, create an inspection for it.

## Open questions (product owner)
1. Which of the 28 writable fields belong in the create form now vs later? Proposal: required
   `nombre`, `tipo`; optional `etapa`, `descripcion`, `imagen`; plus the numeric technical-sheet fields
   in collapsible groups. Confirm or trim.
2. How should the technical sheet be grouped on the detail page? Proposal from the field names:
   General (nombre, tipo, etapa, descripcion), Dimensiones (eslora_total_m, manga_moldeada_m, puntal_m,
   calado_diseno_m, desplazamiento_ton), Desempeño (vel_maxima_nudos, alcance_nm_a_12kn,
   autonomia_horas, autonomia_dias, vida_diseno_anios, horas_navegacion_anio), Capacidades (the
   `*_m3` fields), and the JSON fields. Confirm names/order.
3. What should `etapa` be: free text (backend default `"Activo"`, no allowed-values list exists) or a
   fixed selector? The only values seen in code/tests are `Activo` and `En construcción`.
4. The JSON fields (`rondas_config`, `contexto_operacional`, `documentos`, `misiones`,
   `grupos_constructivos`) have no defined shape. Show them on the detail page (raw / hidden) or leave
   them API-only for now?
5. `imagen` is a string with no upload or serving contract. Is it a URL, a filename under `/media/`,
   or unused for now? Determines whether cards show a picture or a placeholder.
6. Is the vessel list expected to stay small? The API has no search; the proposal filters client-side
   over a fully loaded list. If the fleet may exceed a few hundred, the port should expose paged
   `listar({offset, limit})` and the selector in "Nueva inspección" needs a search-as-you-type.

## Decisions (2026-10-31, proposals adopted as defaults; user may revise)
1. Create form: required `nombre`, `tipo`; optional `etapa`, `descripcion`, `imagen` and the numeric
   fields in collapsible groups (Dimensiones, Desempeño, Capacidades).
2. Detail grouping as proposed: General, Dimensiones, Desempeño, Capacidades.
3. `etapa`: free text with suggestions (`Activo`, `En construcción`) via `<datalist>`.
4. JSON fields: not shown in the UI for now (API-only).
5. `imagen`: placeholder in cards and detail (no serving contract).
6. Fleet assumed small: client-side search over the fully loaded list.

## Discrepancies found (docs vs code), not fixed here
- `frontend/README.md` line 55 still says the backend exposes no vessel endpoints (outdated; T4 fixes it).
- `AGENTS.md` line 171 says the HTTP adapter is pending (accurate today; update in T4).
- `odd/tasks/frontend-react.md` records "npm + package-lock" (L4) and `npm test`; the repo migrated to
  pnpm (commit 3c9e550, `packageManager: pnpm@12.11.2`). Use pnpm.
- `frontend/.env.example` sets `VITE_API_BASE_URL=http://localhost:8000` while its own comment and
  AGENTS.md describe the Vite proxy as the empty-value path; with the example value the proxy is not
  used (works anyway through CORS).
- Backend timestamps are naive (`USE_TZ = False`), unlike the `Z`-suffixed timestamps used in the
  frontend test fixtures (`HttpInspeccionesRepository.test.ts`, `dobles.tsx`).

## Delivery
Chosen: stacked PRs to main (cached from previous features). Slice 1 = T1-T4 (data layer +
composition), slice 2 = T5-T8 (screens + routes). Route per task: delegated direct (writer trigger:
2+ non-trivial files).

Original note — Strategy: ask-on-risk (default). Forecast: roughly 700-900 authored changed lines across T1-T8
(adapter, three pages, tests, docs) — above the ~400 heuristic, so plan slices before the first
commit, e.g. slice 1 = T1-T4 (data layer + composition), slice 2 = T5-T8 (screens). Push, PR and merge
remain the user's decisions.

## Progress / Evidence
Backend evidence: `buques-backend.md` (28 tests OK, `manage.py check` clean).
- T1 done (commit recorded in git log: `feat(frontend): expose field errors on ApiError`), route: delegated direct (single writer). RED: `apiClient.test.ts` "keeps the per-field messages of a 400 response..." and "drops entries that are not arrays of strings..." failed (`ApiError.campos` was undefined). GREEN: 7 new tests; full suite 82 passed, lint clean, build clean.

## Next step
Create branch from `feat/buques-backend` (or `main` after merge), resolve open question 1 (form
fields) with the product owner, then start T1 with a failing test.
