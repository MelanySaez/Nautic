# Feature: analisis-en-cola

Objective: photos over the per-IP concurrency limit wait in a persistent queue and the worker launches them as slots free up, instead of needing "Iniciar análisis" again every 10 photos.
Branch: `feat/casco-selector-inspeccion` · Delivery: same branch, own commit · Runners: `uv run python manage.py test`, `pnpm test`.

## Specs

- S1 — "analiza en bloques de 10 pero hay que darle a iniciar análisis cada vez que llega a 10 y debería ser automático": `POST /api/vision/inspecciones/<id>/analizar/` starts what fits under `VISION_RATE_LIMIT_MAX_CONCURRENT` and queues the rest (`FotoInspeccion.cola_ip` = requesting IP, with the chosen `modelo_id` already saved). Response stays `{iniciadas, omitidas_por_limite}` (now: queued), always 202 when there were pending photos (no more 429 when none fits).
- S2 — "En el backend (recomendado)": whenever the worker releases a slot (success, final error, missing or already completed photo) it launches the oldest queued pending photos of that IP while slots allow. Works with the browser closed.
- S3 — A queued photo is claimed once (`select_for_update(skip_locked=True)`): two workers never launch the same photo. A launched photo leaves the queue (`cola_ip` null); a photo retried on its own leaves it too.
- S4 — Frontend message: queued photos are reported as analyzed automatically, not "en espera".
- Assumption: queues are per IP, like the limit; if Redis loses the photo→IP map the queue waits until "Iniciar análisis" is pressed again (photos stay `pendiente`).

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1-S4 | inline (no writer reason) | in progress | — |

Risk: item 4 (concurrency: claiming queued photos across workers), item 1 (migration adding `cola_ip`).

## Log

- L1 (2026-11-21, user): "cuando se están analizando las imágenes, analiza en bloques de 10 pero hay que darle a iniciar análisis cada vez que llega a 10 y debería ser automático..."
- L2 (2026-11-21, user): "Prefiero esta: En el backend (recomendado)"
- L3: root cause: `api_vision_analizar_inspeccion` skips photos over `VISION_RATE_LIMIT_MAX_CONCURRENT` (default 10) and nothing relaunches them (`views.py:1011`).
