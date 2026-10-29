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
- [ ] T1 — Buques API (list, create, detail) + tests + docs. Route: delegated direct (writer
      trigger: views, urls, tests, docs = 2+ non-trivial files).

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

## Next step
T1.
