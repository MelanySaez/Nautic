# Feature: secciones-buque

## Objective
Hull sections belong to each vessel and are declared when the vessel is created: the user either
keeps the standard sections or declares their own. They are no longer a global catalog loaded with
`seed_secciones_casco`.

## Problem / Why
`SeccionCasco` (`backend/vision/models.py:85`) is one global catalog for every vessel, filled by the
`seed_secciones_casco` command (20 fixed zones). Real hulls differ, and a new environment needs a
manual seed before any photo can be uploaded. User request (2026-10-31): let the user declare the
sections when creating the vessel, with the option to keep the default ones.

## Decisions
- Each `SeccionCasco` belongs to one `Buque` (FK, cascade). `codigo` is unique per vessel, not
  globally.
- Creating a vessel takes a section mode: standard (the 20 sections from the current seed, which
  move to a Python constant `SECCIONES_ESTANDAR`) or custom (a list declared by the user, at least
  one). Omitting it means standard, so existing API clients keep working.
- Custom section: `nombre` required; `codigo` optional (generated when blank, unique per vessel);
  `descripcion` optional; order follows the list.
- Sections are read per vessel; uploading a photo validates that the section belongs to the
  inspection's vessel (400 otherwise).
- Existing data: the migration gives every existing vessel its own copy of the current global
  sections and re-points its photos to the copy (by `codigo`); the global rows are then removed.
- `seed_secciones_casco` is removed (no global catalog remains).
- Editing sections after creation: out of scope (no vessel update endpoint exists).

## Scope (authorized)
- T1 — Backend model + migration: FK `buque`, per-vessel uniqueness, `SECCIONES_ESTANDAR`,
  data migration, remove the seed command.
- T2 — Backend API: `POST /api/buques/` accepts the section mode/list and validates it (per-field
  errors in `campos`); the vessel sheet returns `secciones`; sections listed per vessel; upload
  validates the section's vessel; OpenAPI; docs (AGENTS.md, README, VISION_BACKEND.md,
  INSPECCION_IA.md).
- T3 — Frontend: section block in the vessel create form (standard vs. custom, add/remove/reorder
  custom rows), sections on the vessel sheet, and the inspection upload page lists the sections of
  the inspection's vessel.

## Out of scope
- Editing or deleting sections of an existing vessel.
- Hull geometry/diagram per section.

## Tests / TDD
User rule: only minimal tests (happy path + key error case); run only the test files created or
touched, never the full suite. Backend TDD off (no configuration); runner
`uv run python manage.py test vision.tests.<module> --noinput`. Frontend TDD on (AGENTS.md); runner
`pnpm vitest run <files>`, plus `pnpm lint` and `pnpm build`.

## Checklist
- [x] T1 — Model, migration, standard sections constant. Route: delegated direct.
- [x] T2 — Backend API + docs. Route: delegated direct.
- [x] T3 — Frontend sections block, sheet and upload page. Route: delegated direct.

## Acceptance criteria
- A vessel created without a section mode gets the 20 standard sections; one created with a custom
  list gets exactly those, in order.
- Invalid custom lists (empty, blank name, duplicate code) return 400 with `campos`.
- The upload page only offers the inspection vessel's sections; uploading with another vessel's
  section returns 400.
- Existing inspections keep their photos and sections after `migrate`.

## Delivery
Stacked PRs on top of `feat/buques-frontend-02-pantallas`: slice 1 = T1+T2
(`feat/secciones-buque-01-backend`), slice 2 = T3 (`feat/secciones-buque-02-frontend`).

## Progress / Evidence
Branch `feat/secciones-buque-01-backend` from `feat/buques-frontend-02-pantallas` (811218f).
- T1 done — `feat(vision): scope hull sections to each vessel`. Route: delegated direct (single writer).
  `SeccionCasco.buque` FK + `UniqueConstraint(buque, codigo)`; `SECCIONES_ESTANDAR` and helpers in
  `vision/secciones.py`; migrations 0006 (nullable FK) / 0007 (copy per vessel, re-point photos,
  delete globals; reverse is an explicit no-op) / 0008 (non-null + constraint); seed command removed.
  Checks: `test vision.tests.test_secciones_migracion test_almacenamiento test_inspecciones_api
  test_seleccion_modelo test_versiones_foto test_busqueda_inspecciones` -> 140 tests OK; `check` ->
  no issues; `makemigrations --check --dry-run` -> no changes; `migrate` on dev DB -> 0006-0008 OK
  (dev DB had 0 vessels, 23 global sections -> 0 left).
- T2 done — `feat(vision): declare hull sections when creating a vessel`. Route: delegated direct
  (single writer). `POST /api/buques/` `secciones` (`"estandar"`/absent or custom list, transactional,
  errors under `campos.secciones`); `secciones` in the vessel sheet and 201 response;
  `GET /api/vision/secciones/?buque=<id>`; upload rejects another vessel's section (400); OpenAPI
  and docs (AGENTS.md, README, VISION_BACKEND.md, INSPECCION_IA.md) updated.
  Checks: `test vision.tests.test_buques_api test_almacenamiento test_inspecciones_api
  test_secciones_migracion` -> 90 tests OK; `check` -> no issues; `makemigrations --check --dry-run`
  -> no changes; `migrate` -> nothing to apply (already at 0008).

- Gap closed (orchestrator, inline): with no global sections (never-seeded DB) the data migration now
  gives every existing vessel the standard set (6afed1d); new test in `test_secciones_migracion`
  (2 tests OK).
- Review slice 1 (feat/buques-frontend-02-pantallas..6afed1d): medium, slice_budget_reached, granted
  (user pre-authorized), APPROVED + acknowledged. Applied: the migration builds rows only from the
  fields the historical model has. Open advisories: the standard-set content in 0007 follows the live
  constant (not frozen); `GET /api/vision/secciones/` now requires `buque`, so the current upload page
  breaks until T3 lands (merge both slices together); duplicate-code and empty-list rejections have no
  dedicated test (minimal-tests rule).

- T3 done — `feat(frontend): declare and list hull sections per vessel`. Route: delegated direct
  (single writer). Create form block "Secciones del casco" (radio standard/custom; custom rows with
  add/remove/move, client check: non-empty and every nombre filled; server `campos.secciones` shown in
  the block); standard mode omits `secciones` from the POST. Vessel sheet lists the sections;
  `listarSecciones(buqueId)` requests `?buque=<id>` and `useInspeccionEnVivo` loads the inspection
  first to get its `buqueId`; empty-zones copy no longer mentions the removed seed command.
  RED observed first: 8 new/changed tests failed (HttpBuquesRepository obtener+crear, HttpInspecciones
  listarSecciones, BuqueDetallePage sections, NuevoBuquePage x3, CargaPorZonaPage call site).
  Checks: `pnpm vitest run` on HttpBuquesRepository, HttpInspeccionesRepository, BuqueDetallePage,
  NuevoBuquePage, CargaPorZonaPage -> 53 passed; ResultadosPage (shares the hook) -> 6 passed;
  `pnpm lint` -> clean; `pnpm build` -> OK.

- Review slice 2 (feat/secciones-buque-01-backend..bb8463d): medium, slice_budget_reached, granted
  (user pre-authorized), APPROVED + acknowledged. Warning "nested per-item server errors" checked and
  not applicable: `validar_secciones` returns a flat list of messages, which the block renders.
  Not applied: `?? []` fallback for `secciones` in `aBuqueDetalle` (the DTO declares it required and
  both slices merge together).

## Next step
Push/PR at the user's decision (slice 2 = T3; merge with slice 1 together).
