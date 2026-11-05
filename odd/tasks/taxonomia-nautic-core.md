# Feature: taxonomia-nautic-core

Objective: use what nautic_core (core_engine 3.1.0) offers beyond inference: the class taxonomy
(Spanish label, component vs anomaly, severity, color) and the per-detection boxes and masks.
Delivery: stacked PRs to main, one per task. Runners: backend `env -u VIRTUAL_ENV uv run python
manage.py test <module>`; frontend `pnpm vitest run <files>`, `pnpm lint`, `pnpm build`.

## Specs

- S1 — Taxonomy on detections (backend). Every grouped detection in the photo dict and in the
  `foto-updated` SSE event carries `etiqueta` (`label_es`), `tipo` (`anomalia` | `componente`) and
  `severidad` (anomalies only, else null), computed at read time from the library taxonomy, so
  photos analyzed before this feature are covered with no data migration. Unknown classes keep the
  name with `_` replaced by spaces, `tipo` null, `severidad` null.
- S2 — Taxonomy endpoint. `GET /api/vision/taxonomia/` → `{version, clases: [{id, nombre, etiqueta,
  tipo, severidad, color}]}` (`color` = `#rrggbb`, the color the library uses on the annotated image).
- S3 — Results UI uses the taxonomy. Detection rows show `etiqueta` and a severity badge for
  anomalies; anomalies and components are listed apart. "Con anomalías" counts only photos with at
  least one anomaly, and "Sin anomalías detectadas" shows when a photo has only components.
- S4 — Raw detections stored (backend). The worker keeps boxes and masks
  (`run_inference(..., incluir_mascaras=True)`) and stores them as a JSON file in the photo storage
  (`default_storage`, local disk or bucket), not in Postgres; the photo keeps the key in a new
  nullable field. A re-analysis replaces the file (old one deleted) and deleting a photo deletes it.
- S5 — Raw detections endpoint. `GET /api/vision/fotos/<id>/detecciones/` → `{ancho, alto,
  detecciones: [{clase, etiqueta, tipo, severidad, color, confianza, bbox: {x1,y1,x2,y2},
  mascara: {size, counts} | null}]}`; 404 when the photo does not exist or has no stored detections.
  The photo dict and SSE event expose `detalle_disponible` (bool).
- S6 — Overlay UI. On the results page, a photo with `detalle_disponible` offers a toggle that draws
  the masks (filled, translucent) and boxes over the original image, in the taxonomy color, with a
  per-class filter. Models without masks show boxes only.

## Tasks

| ID | Specs | Route | Status | Commit / PR |
|---|---|---|---|---|
| T1 | S1, S2 | inline | done | 3239be2 |
| T2 | S3 | inline | done | b9ea189 |
| T3 | S4, S5 | inline | done | cb6a389 |
| T4 | S6 | inline | pending | |

Slices: T1 `feat/taxonomia-01-backend`, T2 `feat/taxonomia-02-frontend`, T3
`feat/taxonomia-03-mascaras-backend`, T4 `feat/taxonomia-04-mascaras-frontend`, each stacked on the
previous. Forecast ~200 / ~250 / ~300 / ~400 authored lines. Route: inline (no Writer trigger: the
units depend on each other and share files).

## Log

- L1 (2026-10-31, user): "sí, planifícalo como siguiente feature, la intencion a la final es
  utilizar lo que tiene por ofrecer la libreria que se esta desarrollando"
- L2 (2026-11-04, user): "incluye lo de las mascaras slice 2 en la feature y adelante con la
  implementación"
- L3: Not used on purpose: `render`, `to_jpeg` (analyze already returns the annotated JPEG),
  `clear_cache` (per-process detector cache needs no management). Masks go to storage, not a
  JSONField: RLE per detection can weigh tens to hundreds of KB.
- L4: Test rule: minimal tests only, run only the touched test files, never the full suite.
- L5 (T1): RED 3 failures in `test_taxonomia.py` (no enrichment, 404 on the endpoint), GREEN after
  `vision/taxonomia.py` + wiring in `_foto_to_dict`, `_notificar`, urls. Ran test_taxonomia,
  test_versiones_foto, test_severidad (22 OK), test_inspecciones_api (35 OK), `manage.py check` clean.
  Env fix by user: Postgres collation refresh after the glibc 2.44 upgrade. Assess main..3239be2:
  medium, under_budget (pending in the chain). Risk: none (additive response fields and endpoint).
- L6 (T2): RED 4 failures (repo DTO mapping, SSE mapping, Spanish rows, component-only photo
  counter), GREEN after `Deteccion.etiqueta/tipo/severidad`, `esAnomalia`/`tieneAnomalias`, split
  lists in `TarjetaResultado`. Ran ResultadosPage, infrastructure/, domain/, CargaPorZonaPage: 60
  passed, 1 failed (`CargaPorZonaPage` "shows the model and version on the photos that have one"),
  which also fails on the base without these changes (pre-existing, out of scope). Lint clean,
  build ok. Assess main..b9ea189: medium, under_budget. Risk: none.
- L7 (T3): RED 4 (missing `incluir_mascaras`, field, endpoint, 404 body), GREEN after migration
  `0009`, `guardar_detecciones`, `_detecciones_crudas`, `api_vision_foto_detecciones`. Updated 3
  existing tests that pin the exact `run_inference` call (now `incluir_mascaras=True`, intended).
  Ran test_detecciones_foto, test_taxonomia, test_versiones_foto, test_inspecciones_api,
  test_almacenamiento, test_seleccion_modelo: 107 OK; `check` and `makemigrations --check` clean.
  Risk: item 1 (additive migration + new persisted file per photo); independent verifier at the
  feature end.
- L8 Reviews (user pre-authorized): slice main..e383038 (T1+T2) medium, granted, lenses
  readability+reliability, APPROVED + acknowledged. Slice e383038..cb6a389 (T3) high (escalated item
  1), granted, lenses risk+resilience+reliability, APPROVED + acknowledged. Open advisories (no
  blocker): taxonomy import unguarded (core_engine is a hard dependency anyway); endpoint test pins
  library values (1.0.0, 10 classes, color); fallback label rule duplicated in backend and DTO
  mapper; photo-level badge no longer pinned by a test; `first-letter:uppercase` replaces
  `capitalize` for unknown labels; storing the detections JSON is on the completion path (a storage
  error retries the task; masks are JSON-native, verified: `encode_rle` uses `.tolist()`); orphan
  JSON on concurrent runs or a failed save; no test for the 500 branch nor for inspection delete
  cleanup; `crudas.get` outside the try.
