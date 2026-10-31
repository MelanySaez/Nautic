# Feature: nautic-core-3-1

## Objective
Adopt nautic_core v3.1.0 in the backend: use its public model availability API instead of private
internals, and record which model version and taxonomy version analyzed each photo.

## Problem / Why
Follow-ups from `odd/tasks/seleccion-modelo-ia.md` (nautic_core usage audit, points 2 and 3):
- `vision/inference.py::motivo_no_disponible()` imports `core_engine.vision.adapters.*.WEIGHTS_NAME`
  and `core_engine.vision.weights.resolve_weights`, plus a hand-written map of required modules per
  model. Internal refactors break it silently and an unmapped model is reported as available.
- Each photo stores only `modelo_id`; `analyze()` already returns `model_version` and (v3.1.0)
  `taxonomy_version`, which are discarded, so a weights update cannot be traced per photo.

## nautic_core v3.1.0 (verified in the installed package)
- `core_engine.vision.model_availability(model_id) -> ModelAvailability` (raises `ValueError` for an
  unknown id) and `models_availability() -> List[ModelAvailability]` (catalog order).
- `ModelAvailability`: `model_id, available, missing_weights, missing_modules, install_hint`, `to_dict()`.
- `analyze()` result has `model_name`, `model_version` and `taxonomy_version` (yolo-seg: `0.1.0`,
  taxonomy `1.0.0`).
- With the dev `.env`, all 4 models report `available=True`.

## Scope (authorized)
- T1 — Availability through the public API: tag `v3.1.0` in `pyproject.toml` + `uv.lock`;
  `motivo_no_disponible` / `modelo_disponible` / `listar_modelos` built on `model_availability`;
  remove the private imports and the hand-written requirements map; client-facing reason built from
  `missing_weights` / `missing_modules` / `install_hint` (names only, no paths); tests updated; docs.
- T2 — Model version per photo: migration adding nullable `FotoInspeccion.modelo_version` and
  `taxonomia_version`; `procesar_foto` stores them from the `analyze()` result; exposed in the photo
  dict and SSE; tests; docs.

## Out of scope
- Backfilling versions for photos analyzed before this change (they stay null).
- Frontend.

## TDD
Backend: off (source: no project/session configuration); runner
`uv run python manage.py test vision --noinput`; tests written alongside.

## Checklist
- [x] T1 — Availability via `model_availability`. Route: delegated direct (writer trigger: 2+ non-trivial files).
- [ ] T2 — Model and taxonomy version per photo. Route: delegated direct (same trigger).

## Acceptance criteria
- No import of `core_engine.vision.adapters` or `core_engine.vision.weights` remains in `backend/`.
- `GET /api/vision/modelos/` keeps its response shape; `disponible` comes from `model_availability`.
- Unavailable models still return 400 on `/analizar/` with a reason that contains no server path.
- Completed photos expose `modelo_version` and `taxonomia_version`; existing photos keep null.
- All tests pass; `check`, `makemigrations --check` clean; `migrate` applied.

## Checks
- `uv run python manage.py test vision --noinput`, `check`, `makemigrations --check --dry-run`, `migrate`.
- `grep -rn "core_engine.vision.adapters\|core_engine.vision.weights" backend --include=*.py` (no hits
  outside `.venv`).

## Delivery
Strategy: stacked PRs to main (cached). Forecast ~350–450 authored lines (+ generated `uv.lock`).
One PR if it stays near budget; otherwise T1 and T2 as two slices.

## Progress / Evidence
Branch `feat/nautic-core-3-1` from `main` (c9b4f24). Tag bumped to v3.1.0 and `uv sync` run
(nautic-core 3.0.0 → 3.1.0).
- T1 done in 4ae0c6b: `inference.py` uses `model_availability` / `models_availability`; private imports and requirements map removed; tests patch `vision.inference.model_availability`; docs updated. Observed: `manage.py test vision` 193 OK, `check` clean, `makemigrations --check` no changes, grep for adapters/weights imports no hits, `listar_modelos()` all 4 available. Route: delegated direct (single writer).

## Next step
T2.
