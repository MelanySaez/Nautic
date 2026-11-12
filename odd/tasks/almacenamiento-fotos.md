# Feature: almacenamiento-fotos

## Objective
Store inspection photos (originals and annotated) through Django's storage API so the same code uses
the local disk in development and an S3-compatible bucket in production, selected by configuration.

## Problem / Why
Photos are written and deleted with `open()` / `os.makedirs()` / `os.remove()` under
`BASE_DIR/media/` (`vision/views.py` upload and delete, `vision/tasks.py` read original / write
annotated), and the DB stores paths with a `media/` prefix. In a container deployment the disk is
ephemeral, the web process and the Celery worker may run on different machines, and Django does not
serve `/media/` with `DEBUG=False`. Deployment needs object storage.

## Decisions
- Layered by environment (user): `STORAGE_BACKEND=local` (default, `FileSystemStorage` on
  `MEDIA_ROOT`) or `STORAGE_BACKEND=s3` (`django-storages` S3 backend). No code path knows which one
  is active.
- S3-compatible API so the provider stays open (AWS S3, Cloudflare R2, MinIO, GCS interoperability)
  via `endpoint_url`. Provider choice is a deployment decision, not a code one.
- The DB stores the **storage key** (`inspecciones/originales/<uuid>.jpg`), never a URL or a `media/`
  prefix. URLs are produced at response time by `storage.url(key)`.
- Private bucket + **signed URLs** that expire (default 900 s) in production.

## Scope (authorized)
- T1 — Storage abstraction (dev behaviour unchanged): upload, worker read/write and delete through
  `default_storage`; `_media_url` via `storage.url()`; data migration stripping the `media/` prefix
  from existing `imagen_original` / `imagen_anotada`; delete failures logged, never 500; tests with
  `InMemoryStorage`.
- T2 — Production backend: `django-storages[s3]` dependency; `STORAGES` built from env
  (`STORAGE_BACKEND`, `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_REGION`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, `S3_URL_EXPIRE_SECONDS`, `S3_LOCATION`) with validation at startup; tests of
  the settings selection without network; docs (`.env.example`, AGENTS.md, VISION_BACKEND.md,
  INSPECCION_IA.md).

## Out of scope / follow-ups
- Thumbnails, lifecycle/archival rules, CDN, moving existing files from disk to a bucket (a one-off
  management command can come later), direct browser uploads with presigned POST.

## TDD
Backend: off (source: no project/session configuration); runner
`uv run python manage.py test vision --noinput`; tests written alongside.

## Checklist
- [x] T1 — Storage abstraction + data migration + tests. Route: delegated direct. Commit c20cfcf.
- [x] T2 — S3 backend config + dependency + tests + docs. Route: delegated direct. Commit ab56ef8.

## Acceptance criteria
- With default settings, uploads, analysis and deletion behave as before; files land under
  `MEDIA_ROOT/<key>` and API URLs stay `/media/<key>` (absolute when a request is available).
- No `open()` / `os.remove()` / `os.makedirs()` on photo paths remains in `vision/`.
- Existing rows with `media/…` paths are migrated to keys.
- With `STORAGE_BACKEND=s3` and complete config, `default_storage` is the S3 backend with signed URLs;
  incomplete config fails at startup with a clear message.

## Checks
- `uv run python manage.py test vision --noinput`, `check`, `makemigrations --check --dry-run`,
  `migrate` (dev DB).
- `grep -rn "os.remove\|os.makedirs\|open(" backend/vision/views.py backend/vision/tasks.py`
  (no photo-path hits).

## Delivery
Strategy: stacked PRs (chain continues after #7). Forecast ~450–550 authored lines → two slices:
T1 and T2, one PR each.

## Progress / Evidence
Branch `feat/almacenamiento-fotos` from `feat/inspecciones-busqueda-03-docs` (eae4dfe), because
`views.py`/`tasks.py` change in the open PRs #5/#6.

- T1 c20cfcf: `vision/almacenamiento.py` helpers, views/tasks via `default_storage`, migration 0003
  strips `media/`, SSE `foto-updated` now carries `url_archivo(...)`, 17 tests. Suite 123 OK,
  `migrate` applied 0003 to NauticDB, only PIL `Image.open` on in-memory data remains.
- T2 ab56ef8: `config/almacenamiento.py` `configurar_storages(env)`, `django-storages[s3]==1.14.6`,
  startup validation (`ImproperlyConfigured`), 12 tests (signed URL built locally, no network), docs.
  Suite 135 OK (parent re-ran). Frontend `resolverUrlMedia` already passes absolute URLs through.
- Reviews (user pre-authorized): slice 1 (541 lines) and slice 2 (515 lines) medium, granted,
  APPROVED + acknowledged. Advisories: SSE URL is root-relative while REST is absolute (frontend
  handles both); a test uses `assertRaises(Exception)`; no test asserts `settings.STORAGES` wiring.
- Delivery: two stacked PRs on top of #7 (`-01-abstraccion`, `-02-s3`), both `size:exception`
  (~half tests).

## Next step
Merge after #5–#7. Follow-up: one-off command to copy existing disk files to a bucket.
