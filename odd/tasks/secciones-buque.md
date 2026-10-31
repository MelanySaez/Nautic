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
- [ ] T2 — Backend API + docs. Route: delegated direct.
- [ ] T3 — Frontend sections block, sheet and upload page. Route: delegated direct.

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

## Next step
T2.
