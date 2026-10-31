# Feature: seleccion-modelo-ia

## Objective
Let the inspector choose which `core_engine` vision model analyzes the photos of an inspection:
upload the set of photos, pick one model from the available ones, then press "Analizar".
Backend only.

## Problem / Why
The model is global today (`VISION_MODEL_ID`, default `yolo-seg`), resolved in
`vision/inference.py::_modelo_id()`. `core_engine.vision.analyze(image, model_id=...)` already
accepts a model per call and caches each detector per process, and
`core_engine.vision.available_models()` exposes the catalog (`ModelInfo`: id, architecture, version,
label, description, produces_masks, default_confidence). Nothing lists the models to the client,
nothing lets a request choose one, and no photo records which model analyzed it.
Also, `run_inference()` forces confidence 0.25 when none is given, overriding each model's
calibrated `default_confidence` (yolo-seg 0.15, maskrcnn 0.5, rtdetr 0.15, yolo-tiled 0.25).

## Flow (user)
1. Upload the photos (`POST /api/vision/inspecciones/<id>/fotos/`, unchanged: stores `pendiente`).
2. Choose a model from `GET /api/vision/modelos/`.
3. `POST /api/vision/inspecciones/<id>/analizar/` with `{"modelo": "<id>"}` enqueues the pending
   photos with that model.

## Decisions
- The model is chosen at **analyze time**, not at upload or per inspection.
- `modelo` is optional; default `settings.VISION_MODEL_ID`.
- Each photo records the model that analyzed it (`FotoInspeccion.modelo_id`), exposed as `modelo` in
  the photo dict and the SSE events.
- Unknown model → 400; model whose weights or dependencies are missing → 400 (never a 500 in the
  worker).
- When no confidence is given, each model uses its own calibrated default.
- Views and tasks keep going through `vision.inference`; nothing calls `core_engine` directly.

## Scope (authorized)
- T1 — Model catalog: `GET /api/vision/modelos/` built from `available_models()`, with
  `por_defecto` and `disponible` (weights resolvable and dependencies importable) per model;
  helpers in `vision/inference.py`; OpenAPI schema; tests (core_engine mocked where needed).
- T2 — Model selection: `modelo` in `/analizar/` and in the photo retry POST; migration adding
  `FotoInspeccion.modelo_id`; `procesar_foto` runs `run_inference(..., model_id=foto.modelo_id)`;
  `run_inference` takes `model_id` and stops forcing 0.25; `modelo` in photo dict/SSE; tests; docs
  (AGENTS.md, VISION_BACKEND.md, INSPECCION_IA.md).

## Out of scope / follow-ups
- Re-analyzing an already `completada` photo with another model.
- Model choice in `/api/ai/anomalias/`.
- Frontend (model selector) — handoff later.

## TDD
Backend: off (source: no project/session configuration); runner
`uv run python manage.py test vision --noinput`; tests written alongside.

## Checklist
- [x] T1 — Model catalog endpoint. Route: delegated direct (writer trigger: 2+ non-trivial files).
- [x] T2 — Model selection on analyze + persistence + docs. Route: delegated direct (same trigger).

## Acceptance criteria
- `GET /api/vision/modelos/` lists the 4 catalog models with `id, label, descripcion, produce_mascaras,
  confianza_por_defecto, por_defecto, disponible`.
- `/analizar/` with a valid available `modelo` enqueues pending photos with it and stores
  `modelo_id`; without `modelo` uses `VISION_MODEL_ID`; unknown or unavailable → 400 and nothing
  enqueued.
- The worker analyzes with the photo's model; the photo dict and SSE expose `modelo`.
- Existing tests keep passing.

## Checks
- `uv run python manage.py test vision --noinput`, `check`, `makemigrations --check --dry-run`,
  `migrate` (dev DB).

## Delivery
Strategy: stacked PRs to main (cached from previous features). Forecast ~500 authored lines →
two slices: T1 and T2, one PR each.

## Progress / Evidence
Branch `feat/seleccion-modelo-ia` from `main` (d32f130).
- T1 done: commit c56d5c5 `feat(vision): list available AI models`. Route: delegated direct (single writer).
  Checks observed: `manage.py test vision --noinput` 150 tests OK (15 new in `test_modelos.py`);
  `check` no issues; `makemigrations --check --dry-run` no changes; `migrate` nothing to apply.
  Native review (slice 1 = c56d5c5 + eda0212, 392 lines): medium, granted (user pre-authorized), APPROVED +
  acknowledged. Advisories: catalog models missing from the requirements map are reported available; the
  "no heavy imports" test does not reach the `find_spec` path; resolver errors other than
  FileNotFoundError are not caught.
- T2 done: commit c07a24a `feat(vision): choose the AI model when analyzing an inspection`. Route: delegated direct.
  Checks observed: `manage.py test vision --noinput` 182 tests OK (32 new in `test_seleccion_modelo.py`, 1 existing
  assertion updated for `model_id=`); `check` no issues; `makemigrations --check --dry-run` no changes;
  `migrate` applied `0004_foto_modelo_id` on the dev DB. Dev catalog: rtdetr reports `disponible=false`
  (`transformers` not installed), the other three true.
  Docs updated: AGENTS.md, VISION_BACKEND.md, backend/vision/INSPECCION_IA.md.
  Native review (slice 2 = c07a24a + 33af6c3, 640 lines): medium, slice_budget_reached, granted, APPROVED +
  acknowledged. Advisories: a photo still `pendiente` and already enqueued can be re-dispatched with another
  `modelo`, and both tasks run with the last stored model; the `/api/ai/anomalias/` confidence concern was
  checked and is not an issue (the view applies `DEFAULT_CONFIDENCE` itself, views.py:175).

- Dependency (user-approved): 63126a9 `build(backend): install nautic-core with all model extras`.
  `nautic-core` declared without extras, so `transformers` (rtdetr extra) was missing. Now
  `nautic-core[all]`; `uv sync` added transformers 5.22.1. Observed: all 4 models `disponible=true`,
  real `run_inference(model_id='rtdetr')` OK, 182 tests OK. Review assess: medium, under_budget (291 lines,
  mostly uv.lock) — no review due; rides with slice 2.

## Next step
Open the two slices as stacked PRs (user decision): slice 1 ends at eda0212, slice 2 at HEAD
(`size:exception`, ~half tests). Then frontend model selector handoff.
