# Feature: buques-backend

## Objective
Expose the existing `Buque` model through a REST API so vessels can be created, listed and read.
Backend only; the frontend (`EnMemoriaBuquesRepository` replacement and screens) comes later.

## Problem / Why
`Buque` exists in `vision.models` (table `buques`) but has no endpoints. Inspections and the
upcoming search filters depend on real vessels, and the frontend still uses an in-memory seed.

## Scope (authorized)
- `GET  /api/buques/`          list, manual offset/limit pagination, summary fields.
- `POST /api/buques/`          create; all existing model fields writable; `nombre` and `tipo` required.
- `GET  /api/buques/<id>/`     full technical sheet.
- Tests for create, validation and list/detail.
- Docs: AGENTS.md, README.md (Buques section status).

## Constraints
- Keep the existing model fields as they are: no migration in this feature.
- Prefix `/api/` (user decision; avoids SPA route clash and matches the Vite proxy). Own section
  path `/api/buques/`, not under `/api/vision/`.
- Project conventions: FBV + `@api_view`, manual dicts, `get_object_or_404`, generic error messages,
  `extend_schema` for OpenAPI. No DRF serializers for output.
- Update/delete are out of scope (creation-focused request).

## TDD
Mode: off (source: no project/session configuration). Runner: Django test runner
(`uv run python manage.py test vision`). Tests are still written alongside the behavior.

## Checklist
- [x] T1 — Buques API (list, create, detail) + tests + docs. Route: delegated direct (writer
      trigger: views, urls, tests, docs = 2+ non-trivial files). Commit 75f7331
      (`backend/vision/views_buques.py`, routes in `vision/urls.py`, 27 tests in
      `vision/tests/test_buques_api.py`, AGENTS.md, README.md). Review: medium, granted, lens
      reliability, lineage review-47ae83dfc898c5a7 → APPROVED + acknowledged (authority burned).
- [x] T2 — Fix advisories R3-001 (oversized `offset` → 500) and R3-002 (huge JSON integer on a
      FloatField → OverflowError 500). Route: direct inline (2 small edits). Commit 58fa898. RED
      observed without the fix (2 errors + 1 failure), GREEN with it (28 tests OK). Assess: medium,
      under_budget (20 lines).
- Open advisory (not done): R3-003 `test_entero_fuera_de_rango` depends on PostgreSQL's 32-bit
  integer range (would pass 201 on SQLite). Acceptable: the project is PostgreSQL-only.

## Acceptance criteria
- POST with valid data returns 201 and the full vessel; invalid or unknown fields return 400 with
  per-field errors; missing `nombre`/`tipo` returns 400.
- GET list paginates with `offset`/`limit` and returns `total`.
- GET detail returns 404 for unknown ids.
- Endpoints appear in `/api/schema/`.

## Checks
- `cd backend && uv run python manage.py test vision`
- `uv run python manage.py check`
- `uv run python manage.py makemigrations --check --dry-run`

## Delivery
Strategy: ask-on-risk. Forecast: ~300 authored lines (single slice).

## Progress / Evidence
Branch `feat/buques-backend` from d27115b.
- `manage.py check`: no issues. `makemigrations --check --dry-run`: no changes.
  `spectacular`: `/api/buques/` and `/api/buques/{buque_id}/` present.
- `manage.py test vision` FAILS on this machine before running any test: template1 collation
  version mismatch (created with 2.42, OS provides 2.43). Environment issue, not code. Tests pass
  (28 OK) with a scratchpad settings override `DATABASES["default"]["TEST"]["TEMPLATE"] =
  "template0"`. Permanent fix needs the user's decision: `ALTER DATABASE template1 REFRESH
  COLLATION VERSION` (and the same for `postgres`).

## Next step
All tasks done. Push / PR are the user's decision.
