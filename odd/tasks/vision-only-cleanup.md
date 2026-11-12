# Feature: vision-only-cleanup

## Objective
Reduce the repository to the `vision` Django app (plus the `backend/` project config), keeping the
`Buque` entity that inspections depend on, and document the base product idea for the next phase.

## Problem / Why
The repo still carries the legacy maintenance system (`api/`, React `frontend/`, `chatbot/`, legacy
scripts/templates/static). Only the vision module is relevant now; a new frontend will be built.

## Base product idea (to document, not implement yet)
Three sections: **Buques** (vessel entity with attributes similar to the original app),
**Inspecciones** (inspection sessions per vessel), and **Visión IA** (YOLO hull analysis; every
analysis belongs to a concrete inspection).

## Scope (authorized)
- Delete: `api/`, `frontend/`, `chatbot/`, `learn/`, `scripts/`, `static/`, `templates/`, root
  `package.json`, `package-lock.json`, `body.json`, `user_body.json`, `cookiejar`, `cookies.txt`,
  `cookies_user.txt`, `python`, `et --hard 1b5d56df`, `VISION_FRONTEND.md`.
- Move `Buque` into `vision/models.py` keeping `db_table = 'buques'`.
- Regenerate `vision` migrations from scratch (dev DB is disposable).
- Clean `backend/` config (urls, settings N8N/templates/static, spectacular hooks).
- Update docs: `AGENTS.md`, `README.md`, `VISION_BACKEND.md`, `vision/INSPECCION_IA.md`.

## Constraints
- Dev DB is disposable: drop/recreate is acceptable.
- No new endpoints for Buques/Inspecciones sections in this feature.
- Artifacts (code, docs) in the existing project language conventions.

## TDD
Mode: off (source: no project/session config; no backend tests exist). Checks: functional only.

## Checklist
- [x] T1 — Move `Buque` to `vision`, remove legacy modules/files, clean backend config, regenerate migrations. Route: delegated direct (writer trigger: 2+ non-trivial files).
- [x] T1b — Reset dev DB, renamed to `NauticDB` per user. Created NauticDB (UTF8), `migrate` applied all (vision.0001_initial OK), `seed_secciones_casco` → 23 sections, Buque table `buques` empty; dropped PscvDB (WITH FORCE, 1 active connection terminated). backend/.env DB_NAME/DATABASE_URL updated locally; default + .env.example committed (see git log).
- [x] T3 — Migrate dependency management to uv (pyproject.toml + uv.lock, drop requirements files, recreate `.venv` with prompt `Nautic`, Dockerfile via `uv sync`). Route: direct inline (pyproject mechanical; Dockerfile small). Commit c6dfaa3. Checks: `uv lock` → 94 packages; `uv sync --frozen` OK; `uv run manage.py check` → no issues; `makemigrations --check` → no changes; `import core_engine, celery, redis` OK. Docker build NOT run (needs SSH agent for nautic_core). Review: medium, granted, lineage review-feab7d2961d71b14 → `correction_required`, then blocked at `intended_untracked_selection_required` (selection JSON schema not discoverable); finding not yet visible.
- [x] T4 — Restructure into monorepo layout: move all Python/Django into `backend/` (pyproject, uv.lock, .venv, manage.py, Dockerfile, vision/), rename config package `backend/` → `backend/config/`; pin nautic_core v3.0.0 (relock + sync); `**/` patterns in Dockerfile.dockerignore (review finding R3-dockerignore-anchoring); delete duplicate `backend/manage.py`. Route: delegated direct (writer trigger: many files). Supersedes the native correction for lineage review-feab7d2961d71b14 (blocked; finding R3-build-context-manage-py verified false: root manage.py exists).
  - T4 done in commit 379ce07 (restructure + nautic_core v3 adaptation: `vision/inference.py` now `run_inference()` over `core_engine.vision.analyze`, iou dropped, `VISION_MODEL_ID` setting, `NAUTIC_WEIGHTS_DIR` in .env.example). Checks: `manage.py check` OK; `makemigrations --check` no changes; smoke inference OK with NAUTIC_WEIGHTS_DIR=../nautic_core/models (yolo11s-seg-0.1.0.pt). Endpoint/Celery/SSE not exercised. Review: high, granted, 4 lenses, lineage review-8f38d63e291dc762 → APPROVED, acknowledged (authority burned). Advisory (non-blocking) follow-ups: R1/R2 views.py:198-199 500 body leaks weights filesystem paths (return generic msg, log details); R4 inference.py:75-87 missing NAUTIC_WEIGHTS_DIR → Celery worker init crash-loop (validate at boot); R3 iou silently ignored, no adapter tests, result-shape docstring, VISION_MODEL_ID unvalidated. History: layout done (`backend/config/`, `backend/vision/`, pyproject/uv.lock/.venv/manage.py/Dockerfile/.dockerignore under `backend/`), relocked to nautic-core v3.0.0 (8f250e83). BLOCKER: v3 `core_engine` removed `ImageProcessor`/`process_and_visualize`; new API `core_engine.vision.analyze(image, model_id='yolo-seg', confidence=None, annotate=True) -> (jpeg|None, dict)`, no `iou`. `manage.py check` fails with ImportError (vision/inference.py:17, views.py:21; uses at inference.py:43, tasks.py:181, views.py:219/233). Needs user decision.
- [x] T5 — Fix review advisories R1/R2 + R4 (commit 41352b1): generic 500 messages + server-side logging in views.py; `verificar_configuracion()` validates NAUTIC_WEIGHTS_DIR/VISION_MODEL_ID via Django system check `vision.E001` and Celery `worker_init` (stops worker, no crash-loop). Route: direct inline (3 small edits). Checks: `manage.py check` OK with valid config; fails with vision.E001 for bad dir and bad model id; worker_init raises RuntimeError on bad dir; makemigrations no changes. Review assess: medium, under_budget (82 lines) → pending in slice.
- [x] T2 — Update documentation (commit fea23f7): AGENTS.md (EN), README.md (ES), VISION_BACKEND.md, backend/vision/INSPECCION_IA.md rewritten for backend/ layout, uv, nautic_core v3, NauticDB, roadmap; VISION_FRONTEND.md removed; stale .env.example comment fixed; local pyrightconfig.json → backend/.venv. Route: delegated direct. Checks: stale-ref grep clean; documented celery/manage.py commands exist; section 8 photo JSON verified against `_foto_to_dict`. Review of slice 379ce07..fea23f7 (41352b1, 81cbce0, fea23f7): medium, granted, lineage review-f07195a9842f5445 → APPROVED + acknowledged.
- [x] T6 — Fix confirmed advisory R3-worker-init-raise-swallowed (commit af6f4ae): Celery `Signal.send` catches `Exception` from receivers, so the T5 RuntimeError never stopped the worker (T5 claim was wrong; it had been tested by calling the handler directly). Now raises SystemExit; core_engine catalog import failure reported as config error. Checks: `worker_init.send()` propagates SystemExit; real `celery -A config worker` with bad NAUTIC_WEIGHTS_DIR exits 1 with clear message; `manage.py check` OK. Assess: medium, under_budget (19 lines).
- Open advisories (not done): vision.E001 Error-level check blocks `migrate`/`test` where NAUTIC_WEIGHTS_DIR is not a real dir (CI); no tests for config validation / adapter; iou silently ignored. with vision-only scope and base product idea. Route: delegated direct (writer trigger: 4 doc files).

## Acceptance criteria
- `python manage.py check` passes.
- `python manage.py makemigrations --check --dry-run` reports no changes.
- No remaining imports/references to `api`, `chatbot`, `frontend` in code.

## Checks
- `.venv/bin/python manage.py check`
- `.venv/bin/python manage.py makemigrations --check --dry-run`
- `grep -rn "from api\|'api\.\|include('api" --include=*.py .` returns nothing (excluding .venv)

## Progress / Evidence
T1 split into 5 commits (a single 71k-line commit exceeded the review context budget):
- 28acada chore: remove legacy React frontend (deletion only)
- 0b6c4e4 chore: remove chatbot microservice (deletion only)
- c087725 chore: remove legacy scripts, templates and stray root files (deletion only)
- e96decd refactor!: move Buque into vision and drop api wiring (code, 208 lines)
- 282b840 chore: remove legacy api app (deletion only)

Checks on e96decd: `manage.py check` → no issues; `makemigrations --check --dry-run` → No changes detected.
Review (RDD on): e96decd assessed medium, consent granted, lens review-reliability, lineage
review-347ac28a1581d624 → state `escalated` (informational). Finding: regenerated
`vision/migrations/0001_initial.py` keeps its name, so a DB that already applied the old
0001/0002/0003 will not re-run it; schema drifts (stale `ano_construccion` NOT NULL, missing
`tiempo_inferencia_ms`/`severidad`); `buques` table already exists from `api`. Expected by design
(disposable dev DB) → resolved by T1b reset. Deletion-only commits not reviewed.

## Next step
All tasks done. Merged fast-forward into main and pushed to origin (c2f3a8b..af6f4ae) on user request.
