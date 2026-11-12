# Feature: detecciones-normalizadas

Objective: store each photo's grouped detections as rows (`DeteccionFoto`, one per class) instead of the `FotoInspeccion.detecciones` JSON, with the report's validation on those rows.
Branch: `feat/detecciones-normalizadas` · Delivery: single PR · Runners: `uv run python manage.py test vision`, `pnpm test`.

## Specs

- S1 — "me gusto el esquema que propusiste para evitar usar el json, implementala": new table `deteccion_foto` (foto FK cascade, `clase`, `cantidad`, `confianza_max`, `descartada` default false), unique `(foto, clase)`, index `(clase, foto)`. One row per class per photo (a count, not a list); boxes and masks stay in the `detecciones_archivo` file.
- S2 — `FotoInspeccion.detecciones` (JSON) and `ValidacionFoto` are removed; the photo's note moves to `FotoInspeccion.nota_inspector`.
- S3 — Migration copies existing data: JSON entries become rows, `ValidacionFoto.descartadas` become `descartada=true`, its `nota` becomes `nota_inspector`. Reversible.
- S4 — The worker replaces the photo's rows on every analysis (a re-analysis starts with no discards).
- S5 — API contract unchanged: the photo dict and the `foto-updated` SSE event keep `detecciones: [{class_name, count, max_confidence, etiqueta, tipo, severidad}] | null` (null while the photo has never been analyzed); the report draft API and PDF behave as before.
- Out of scope: `validado_por` (needs the user model, login PR); new filters by class; drawing only confirmed boxes.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1-S5 | inline | done | RED: ImportError DeteccionFoto; GREEN: test_detecciones_normalizadas 6/6 (incl. migration forward + reverse), suite 261 OK; dev DB migrated: 14 photos -> 48 rows, photo 2 identical |
| T2 | docs | inline | done | AGENTS.md (taxonomy/detections, report draft, key files, tests) |

## Log

- L1 (2026-11-11, user): "me gusto el esquema que propusiste para evitar usar el json, implementala"
- L2: data in the dev DB is test-only ("los datos son unicamente de prueba, si tocara reconstruir todo no habria ningun probelma"); a data migration is still written so the dev DB keeps working. Risk: item 1 (migration removing a column and a table).
- L3: migration split in two because the reverse accessor can only be named `detecciones` once the JSON column is gone (0011 uses a temporary `filas_deteccion`, 0012 renames it). `validado_por` left for the login PR.
- L4: independent verifier on main..534a85f: PASS S1-S5, no blockers. Fixed advisories: re-queued photo analyzed with nothing found returned null instead of `[]` (RED None != []; `detecciones_archivo` now marks a past analysis); reverse migration turned `[]` into null (RED; fixed); `VISION_BACKEND.md` and `backend/vision/INSPECCION_IA.md` still described the JSON column. Kept: out-of-domain duplicate classes/null counts in old JSON. Suite 262 OK.
- L5: gentle-ai review (risk, resilience, reliability) on main..a94fdb0: approved and acknowledged. Informational: 0011 (expand) and 0012 (contract) ship together, so a rolling deploy with old workers running would fail on the dropped column — stop Celery workers before `migrate`; photos analyzed before 0009 (no `detecciones_archivo`) that found nothing and are re-queued show null (test data only); single-photo serializations make one extra query (lists prefetch).
