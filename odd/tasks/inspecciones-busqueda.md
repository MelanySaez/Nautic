# Feature: inspecciones-busqueda

## Objective
Server-side, combinable search over inspections (by vessel, date range, severity and name) that keeps
scaling as data and filter criteria grow, and is ready to be driven later by a natural-language
interpreter (Jev or an LLM) without touching the query code.

## Problem / Why
`GET /api/vision/inspecciones/` returns every inspection; the only consumer (`ListaInspeccionesPage`)
downloads them all and filters in the browser. Inspections have no name, and severity lives only on
photos as text, so it cannot be filtered or ordered efficiently.

## Decisions (user)
- Inspection `nombre` is optional: when blank the backend generates `Inspección #<id> — <buque>` and
  stores it in the column (searchable). The user can set it on creation and change it later.
- Change the existing list endpoint (option B) instead of adding a new one; adapt the frontend
  adapter in the same PR so nothing breaks. Search UI is a later frontend task.
- Design for growth: declarative filter registry (one entry per criterion, reusable as the schema for
  the future NL interpreter) and cursor pagination with `hay_mas`/`siguiente`, no `total`.

## Scope (authorized)
- Model: `InspeccionCasco.nombre` (CharField 255, blank) and `severidad_max` (small int, null,
  `NivelSeveridad` IntegerChoices low=1..critical=4) + migration (pg_trgm extension, indexes,
  backfill of existing rows).
- Indexes: `(buque, -fecha_creacion, -id)`, `(severidad_max, -fecha_creacion, -id)`,
  `(-fecha_creacion, -id)`, trigram GIN on `nombre`.
- `severidad_max` maintenance: raised atomically by the Celery task when a photo finishes;
  recomputed when a photo is deleted.
- `vision/busqueda.py`: filter registry + `buscar_inspecciones()`.
- `GET /api/vision/inspecciones/` → `{resultados, siguiente, hay_mas}` with
  `buque`, `desde`, `hasta`, `severidad_min`, `q`, `limit`, `cursor`; 400 `{"error","campos"}`.
- `POST` accepts optional `nombre`; `PATCH /api/vision/inspecciones/<id>/` edits `nombre` and
  `descripcion`. Inspection dicts expose `nombre` and `severidad_max`.
- Frontend: `HttpInspeccionesRepository.listar()` reads the new shape (minimal, no UI change).
- Tests + docs (AGENTS.md, VISION_BACKEND.md / INSPECCION_IA.md where they describe the endpoint).

## Out of scope / follow-ups
- Frontend search UI, "load more" and showing/editing `nombre` (frontend task).
- Natural-language search (phase 2).
- Object storage for photos (separate feature: `default_storage` + django-storages, S3/R2 bucket,
  signed URLs; today files are written with `open()`/`os.remove()` under `MEDIA_ROOT`).

## TDD
Backend: off (source: no project/session configuration; runner `uv run python manage.py test vision`),
tests written alongside. Frontend: on (source: AGENTS.md "write the failing test first"; runner
`pnpm test`).

## Checklist
- [x] T1 — Model fields, `NivelSeveridad`, migration (pg_trgm, indexes, backfill), `severidad_max`
      maintenance in task and photo delete, `nombre` default on create, PATCH, dict fields + tests.
- [x] T2 — Filter registry `vision/busqueda.py`, cursor pagination, list endpoint new contract + tests.
- [x] T3 — Frontend adapter for the new list shape (TDD) + docs.
Route: delegated direct (writer trigger: model, migration, views, tasks, tests, frontend, docs).

## Acceptance criteria
- Filters combine (AND); each invalid parameter returns 400 with a per-field message.
- Cursor pages are stable under inserts (ordering `-fecha_creacion, -id`), `hay_mas` correct at the end.
- `severidad_max` equals the worst processed photo severity after processing and after deletion.
- Generated name stored when `nombre` is blank; custom name kept (trimmed).
- Existing frontend tests stay green; `pnpm build` passes.

## Checks
- `cd backend && uv run python manage.py test vision`
- `uv run python manage.py check`; `uv run python manage.py makemigrations --check --dry-run`
- `cd frontend && pnpm test && pnpm lint && pnpm build`

## Delivery
Strategy: ask-on-risk. Forecast: ~600–800 authored lines → one work-unit commit per task; review per
slice.

Re-sliced: the original PR (#4, `feat/inspecciones-busqueda`) was +1803/−34 lines, so it was split
into 3 stacked PRs, each branch built from the previous one and each passing its checks on its own:
1. `feat/inspecciones-busqueda-01-modelo` — model, migration, task, create/PATCH, tests; the list
   endpoint contract is unchanged (still an array).
2. `feat/inspecciones-busqueda-02-busqueda` — `vision/busqueda.py`, the new list contract and the
   frontend adapter that contract requires, so `main` never has a broken frontend.
3. `feat/inspecciones-busqueda-03-docs` — documentation only.
The original commits (listed below by their old hashes) are superseded by the new ones.

## Progress / Evidence
Branch `feat/inspecciones-busqueda` from 72ff79c. Writer commits (delegated direct):
- T1 770e628 → b140c08 (slice 1) model fields, NivelSeveridad, migration 0002 (TrigramExtension, indexes, backfill),
  severity maintenance, default name, PATCH, tests.
- T2 a29baa2 → 1fd903b (slice 2) `vision/busqueda.py` registry + cursor search + list contract + tests (also removes
  the per-row photo count N+1 via `n_fotos` annotation).
- T3 046a2a0 → 66bb62c (slice 2; docs moved to slice 3) frontend adapter reads `{resultados}` with `?limit=100` (RED → GREEN observed); docs.
Checks: `check` OK; `makemigrations --check` no changes; `pnpm test` 73 OK; `pnpm lint` clean;
`pnpm build` OK. BLOCKED: `migrate` and `manage.py test vision` fail with
`extension "pg_trgm" is not available` (package `postgresql-contrib` not installed; needs sudo).
Resolved: user installed `postgresql-contrib`; `migrate` applied 0002 to NauticDB; full suite 95 OK.
- T4 (found by parent EXPLAIN, direct inline) — `icontains` emits `UPPER(nombre) LIKE`, so the GIN
  trigram index was never used (Seq Scan even with `enable_seqscan=off`). An expression index
  `OpClass(Upper('nombre'))` hit a Django 5.1.7 SQL generation error, so instead a `contiene_ilike`
  lookup (ILIKE, escaped wildcards) registered in `VisionConfig.ready()`. EXPLAIN now:
  `Bitmap Index Scan on insp_nombre_trgm_idx`. Regression test asserts ILIKE (RED without the fix,
  GREEN with it). Suite: 97 OK. Commit recorded in git log (`fix(inspecciones): match name search
  with ILIKE ...`) a6aba0f → folded into 1fd903b (slice 2).
- Review of slice 72ff79c..772dfa0: medium, granted (user pre-authorized), lens reliability,
  lineage review-e30a1e289058ba61 → APPROVED + acknowledged (authority burned). 4 advisories.
- T5 1870b10 → folded into b140c08 (model/views/tests) and 66bb62c (frontend adapter) (delegated direct) fixes all 4 advisories, each RED → GREEN: severity recompute locks
  the inspection row (`select_for_update` in `atomic`); default name truncated to 255 (runtime `…`,
  backfill `Left(...,255)`); NUL rejected in `q` and `nombre` (400); frontend `listar()` follows the
  cursor until `hay_mas` is false (cap 100 pages). Checks: backend 104 OK (parent re-ran), `check`
  OK, `makemigrations --check` no changes, `pnpm test` 75 OK (parent re-ran), lint clean, build OK.
  Assess from 772dfa0: medium, under_budget (162 lines).

## Next step
Push the three stacked branches and open the stacked PRs on user request (slice 1 into main, slice 2 into slice 1, slice 3 into slice 2). Follow-ups: frontend search UI (handoff: `odd/tasks/inspecciones-busqueda-frontend.md`); object storage for photos.
