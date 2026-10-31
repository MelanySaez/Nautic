# Feature: vision-ia-frontend

## Objective
A "Visión IA" section in the SPA where an inspection is created and analyzed: choose the vessel,
create the inspection, pick a hull section, upload its photos, choose the AI model, press
"Analizar" and follow the results live.

## Problem / Why
User request (2026-10-31): three sections — Buques, Inspecciones (history of the inspections
already created) and Visión IA (where inspections are created and analyzed). Today creation and
upload live under `/inspecciones/nueva` and `/inspecciones/:id/carga`, and the frontend ignores the
backend's model selection: no model catalog, `analizar` and retry send no `modelo`, and photos do
not show which model and version analyzed them.

## Backend contract (merged, see `odd/tasks/seleccion-modelo-ia.md`, `nautic-core-3-1.md`)
- `GET /api/vision/modelos/` → `{modelos:[{id,label,descripcion,arquitectura,version,produce_mascaras,
  confianza_por_defecto,por_defecto,disponible}]}`.
- `POST /api/vision/inspecciones/<id>/analizar/` and retry `POST /api/vision/fotos/<id>/` take optional
  `{"modelo": "<id>"}`; unknown or unavailable → 400 with `campos.modelo`.
- Photo dict and `foto-updated` SSE: `modelo`, `modelo_version`, `taxonomia_version`.
- `POST /api/vision/inspecciones/` takes optional `nombre` (blank → `Inspección #<id> — <buque>`).

## Decisions (defaults; user may revise)
- Routes: `/vision` (new inspection: vessel, optional name, description, inspector),
  `/vision/:id` (sections of the vessel, upload, model selector, "Analizar", live photo states),
  `/vision/:id/resultados` (results). Old `/inspecciones/nueva` and `/inspecciones/:id/carga` redirect
  to the new paths; `/inspecciones/:id/resultados` stays for the history section.
- Nav order: Visión IA, Inspecciones, Buques. The inspections list "Nueva inspección" button goes to
  `/vision`.
- Model selector next to "Analizar": preselects `por_defecto`; unavailable models are listed but
  disabled ("no disponible"); shows label and description.
- Retry sends the model currently selected in the page selector.
- Photo cards and results show model label and version when present.

## Scope (authorized)
- T1 — Data layer: models port + HTTP adapter (`GET /api/vision/modelos/`); `analizar(id, modeloId?)`
  and `reintentarFoto(id, modeloId?)` send `modelo`; `Foto`/`ActualizacionFoto` gain `modelo`,
  `modeloVersion`, `taxonomiaVersion`; `nombre` on create; fakes.
- T2 — UI: Visión IA routes, nav and redirects; creation page with optional name; upload page with
  model selector, model on photos, `campos.modelo` errors; results show model and version.

## Out of scope
- Inspecciones history (server-side search, filters, rename): `odd/tasks/inspecciones-busqueda-frontend.md`.
- Re-analyzing completed photos with another model (backend does not allow it).

## Tests / TDD
User rule: minimal tests only (happy path + key error case); run only the touched test files, never
the full suite. Frontend TDD on (AGENTS.md); runner `pnpm vitest run <files>`, plus `pnpm lint`,
`pnpm build`.

## Checklist
- [x] T1 — Data layer. Route: delegated direct (writer trigger: 2+ non-trivial files).
- [x] T2 — Visión IA screens. Route: delegated direct.

## Acceptance criteria
- From "Visión IA" a user creates an inspection, uploads photos per section of that vessel, picks an
  available model and analyzes; photos update live and show the model used.
- An unavailable model cannot be chosen; a 400 on `modelo` is shown.
- Old URLs redirect; the Buques section is unchanged.

## Delivery
Stacked PRs to main: slice 1 = T1 (`feat/vision-ia-01-datos`), slice 2 = T2
(`feat/vision-ia-02-pantallas`).

## Progress / Evidence
Branch `feat/vision-ia-01-datos` from `main` (c6ee64f).

- T1 done — `feat(vision): add model catalog port and model fields to the data layer`. Route: delegated direct
  (single writer). Own small port `ModelosIA` (`inspecciones/application/puertos.ts`) with
  `HttpModelosIARepository`, wired as `Dependencias.modelos`; `analizar`/`reintentarFoto` take optional
  `modeloId` and send `{modelo}` only when given; `Foto`/`ActualizacionFoto` gain `modelo`, `modeloVersion`,
  `taxonomiaVersion`; `crear` takes optional `nombre` (omitted when blank). RED: 5 tests failed before
  implementation (catalog adapter missing, DTO/SSE model fields, `modelo` payloads, `nombre`). Ran
  `pnpm vitest run` on infrastructure/, domain/, CargaPorZonaPage.test.tsx, ResultadosPage.test.tsx: 6 files,
  55 tests passed. `pnpm lint` clean, `pnpm build` ok.

- T2 done — `feat(vision): add Visión IA section with model selector`. Route: delegated direct (single writer),
  branch `feat/vision-ia-02-pantallas`. Routes `/vision`, `/vision/:id`, `/vision/:id/resultados` (plus
  `/inspecciones/:id/resultados` kept); `/inspecciones/nueva` and `/inspecciones/:id/carga` redirect; nav order
  Visión IA, Inspecciones, Buques; creation page has optional "Nombre"; upload page has `SelectorModelo`
  (preselects `porDefecto`, falls back to the first available model when the default is unavailable, unavailable
  options disabled "(no disponible)", description shown), "Iniciar análisis" and retry send the selected model,
  `campos.modelo` 400 shown in the error area, photo cards and results show "label vX". Internal links moved to
  `/vision/...`. RED: 15 tests failed before implementation. Ran `pnpm vitest run src/app src/inspecciones/ui
  src/inspecciones/infrastructure src/inspecciones/domain`: 10 files, 82 tests passed. `pnpm lint` clean,
  `pnpm build` ok.

- Reviews (user pre-authorized): slice 1 (main..cfe43dd) and slice 2 (..b6c73c5) medium,
  slice_budget_reached, APPROVED + acknowledged. Applied: per-photo retry is disabled while the model
  catalog loads or no model is usable (it could send no model); RED then GREEN in
  `CargaPorZonaPage.test.tsx` (17 passed), lint and build clean. Open advisories (minimal-tests rule):
  blank/whitespace `nombre` omission untested; catalog HTTP error untested; fallback, no-usable-model
  and catalog-error branches untested; with every model unavailable the select shows a disabled
  option as selected; `/inspecciones/nueva` redirect untested.

## Next step
Review/PR of the two slices (stacked: `feat/vision-ia-01-datos` then `feat/vision-ia-02-pantallas`).
