# AGENTS.md — Nautic

Guidance for agentic coding agents operating in this repository.

---

## Project Overview

Nautic is a hull-inspection system for naval vessels. This repository is a **monorepo root**:

- **`backend/`** — a Django project (DRF + Celery) with a single app, `vision`.
- **`frontend/`** — React + TypeScript SPA (Vite, Tailwind v4, React Router).

The product has three sections, each with its API and its screens:

| Section | Purpose | Status |
|---|---|---|
| **Buques** | Vessel entity with a technical sheet and its own hull sections | API create / list / detail (`vision/views_buques.py`, no update/delete); screens `/buques`, `/buques/nuevo`, `/buques/:id` |
| **Inspecciones** | History of the inspections already created | API search, detail, rename, delete; screens `/` (history with filters) and `/inspecciones/:id/resultados` |
| **Visión IA** | Create an inspection and analyze its photos; every analysis belongs to an inspection | API photos → Celery → SSE with model selection; screens `/vision`, `/vision/:id`, `/vision/:id/resultados` |

All endpoints live under `/api/`. The `vision` module needs infrastructure beyond Django + Postgres: **RabbitMQ** (Celery broker) and **Redis** (SSE pub/sub + rate limiting).

---

## Layout

```
.
├── AGENTS.md / README.md        # repo-level docs
├── VISION_BACKEND.md            # vision backend reference
├── backend/                     # ALL Python/Django lives here
│   ├── manage.py
│   ├── pyproject.toml, uv.lock  # uv-managed dependencies (no requirements.txt)
│   ├── Dockerfile, .dockerignore, start.sh
│   ├── .env, .env.example
│   ├── config/                  # Django project package
│   │   ├── settings.py, urls.py, celery.py, almacenamiento.py
│   │   ├── wsgi.py, asgi.py
│   │   └── spectacular_hooks.py
│   └── vision/                  # the only Django app
│       ├── models.py, views.py, views_buques.py, busqueda.py, secciones.py, urls.py, tasks.py
│       ├── almacenamiento.py
│       ├── inference.py, pubsub.py, ratelimit.py
│       └── INSPECCION_IA.md
└── frontend/                    # React + TypeScript SPA (pnpm)
    ├── package.json, vite.config.ts
    └── src/
        ├── app/                 # router, layout, composition root
        ├── inspecciones/        # domain / application / infrastructure / ui
        ├── buques/              # port + HTTP adapter + list/create/detail screens
        ├── shared/              # http client, theme, hooks, UI atoms
        └── test/                # Vitest setup and test doubles
```

---

## Build / Run Commands

Run from `backend/`. Python 3.12, dependencies managed with **uv** (`backend/.venv`).

```bash
cd backend
cp .env.example .env                       # first time; fill DB_PASSWORD, SECRET_KEY, NAUTIC_WEIGHTS_DIR
uv sync                                    # install dependencies from uv.lock
uv add <package>                           # add a dependency (updates pyproject.toml + uv.lock)

uv run python manage.py migrate
uv run python manage.py runserver              # dev server on :8000
uv run python manage.py check                  # system checks (includes vision.E001)
```

- Database: PostgreSQL, default name `NauticDB` (`DB_NAME` in `.env`).
- `nautic_core` (v3.1.0) is installed from `ssh://git@github.com/AaronDLF/nautic_core.git`; it needs an SSH key with access. It is installed as `nautic_core` but imported as `core_engine`.
- Docker: `DOCKER_BUILDKIT=1 docker build --ssh default backend/` (build context is `backend/`).
- API docs (drf-spectacular): `/api/docs/` (Swagger), `/api/docs/redoc/`, `/api/schema/`.

### Vision infrastructure

Required only when working on `vision/`. Without it, uploads succeed but nothing gets analyzed.

```bash
# 1. Base services
sudo systemctl start rabbitmq-server redis

# 2. Celery worker (run from backend/)
uv run celery -A config worker -Q vision -l info --concurrency=2 --pool=prefork

# 3. Flower — worker monitoring UI on :5555 (optional)
uv run celery -A config flower --port=5555 \
  --broker_api=http://guest:guest@localhost:15672/api/
```

Required environment: `NAUTIC_WEIGHTS_DIR` (directory with the model weights). Optional: `VISION_MODEL_ID` (default model, used when a request does not choose one; default `yolo-seg`; valid ids come from the `core_engine` catalog: `yolo-seg`, `yolo-tiled`, `maskrcnn`, `rtdetr`). A model is only usable if its weights are in `NAUTIC_WEIGHTS_DIR` and its Python dependencies are installed (`GET /api/vision/modelos/` reports it as `disponible`). Availability comes from the public `core_engine.vision.model_availability()` / `models_availability()` (nautic_core v3.1); never import `core_engine.vision.adapters` or `core_engine.vision.weights`.

`vision.inference.verificar_configuracion()` validates both settings. It is enforced by the Django system check `vision.E001` and by Celery `worker_init`: a misconfigured worker **refuses to start**.

### Photo storage

Inspection photos (originals and annotated) live behind Django's storage API, selected by environment in `backend/config/almacenamiento.py` (`configurar_storages()` builds `settings.STORAGES`):

| `STORAGE_BACKEND` | `default_storage` | Use |
|---|---|---|
| `local` (default) | `FileSystemStorage` on `MEDIA_ROOT` (`backend/media/`), URLs under `MEDIA_URL` | development |
| `s3` | `storages.backends.s3.S3Storage` (private bucket, signed URLs) | production |

`s3` reads `S3_BUCKET` (required), `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` (optional, set together; otherwise boto3's default credential chain), `S3_ENDPOINT_URL` (R2, MinIO), `S3_REGION`, `S3_LOCATION` (key prefix) and `S3_URL_EXPIRE_SECONDS` (default 900). An unknown backend or a missing bucket raises `ImproperlyConfigured` at startup. See `backend/.env.example`.

- The database stores the **storage key** (`inspecciones/originales/<uuid>.jpg`), never a URL or a `media/` prefix. URLs come from `vision.almacenamiento.url_archivo()` at response time.
- **Never use `open()`, `os.remove()`, `os.makedirs()` or `os.path.join(BASE_DIR, ...)` on photo paths.** Use the helpers in `vision/almacenamiento.py` (`guardar_original`, `guardar_anotada`, `leer_archivo`, `borrar_archivo`, `url_archivo`), which wrap `default_storage`. Persist the name `save()` returns.
- Storage errors on delete are logged and never turn the response into a 500 (`borrar_archivo`).
- Tests swap the backend with `override_settings(STORAGES=STORAGES_EN_MEMORIA)` from `vision/tests/utilidades.py`; never write photos to disk in tests.

---

## Test Commands

Backend tests live in `backend/vision/tests/` (`test_buques_api.py` for the Buques API, `test_inspecciones_api.py` and `test_busqueda_inspecciones.py` for inspection name/severity and search, `test_modelos.py` and `test_seleccion_modelo.py` for the model catalog and model selection, `test_secciones_migracion.py` for the sections-per-vessel data migration). The vision pipeline itself has no tests yet.

```bash
cd backend
uv run python manage.py test vision                      # all vision tests
uv run python manage.py test vision.tests.test_buques_api.CrearBuqueTests  # one class
uv run python manage.py test vision.tests.test_buques_api.CrearBuqueTests.test_falta_nombre  # one test
```

If you add tests that touch the vision module, set `CELERY_TASK_ALWAYS_EAGER=True` so tasks run inline instead of needing a live broker.

---

## Code Style Guidelines

### Python / Django (backend)

**Formatting**
- Standard Python conventions: **4-space indentation**, single or double quotes (be consistent within a file).
- `snake_case` for all functions, variables, and URL names.
- No formatter or linter is configured; follow the existing style manually.

**View conventions**
- All views are **function-based views (FBV)** — do not introduce class-based views.
- Decorate every API view with `@api_view(["GET", "POST"])` (or appropriate methods) from DRF.
- Return `Response(data)` with manually constructed Python dicts — the codebase does not use DRF serializers for output.
- The SSE stream is a plain Django `StreamingHttpResponse` view (not DRF).

**Naming conventions**
- View functions: `snake_case`, prefixed with domain (e.g., `api_vision_inspecciones`, `api_vision_subir_foto`).
- Internal helper functions: prefix with `_` (e.g., `_foto_to_dict`, `_media_url`).
- Models: **PascalCase** matching domain language (Spanish): `Buque`, `InspeccionCasco`, `FotoInspeccion`, `SeccionCasco`.
- Domain language is Spanish (model names, URL paths, business variables).

**Database**
- Use the Django ORM — `.select_related()`, `.annotate()`, `.filter()` as needed.
- Pagination, if added, is manual (offset/limit query params), not DRF's built-in pagination.
- PostgreSQL-specific features are acceptable (`JSONField`, `GinIndex`).

**Error handling**
- Use `get_object_or_404()` for not-found cases.
- Return structured error responses: `Response({"error": "..."}, status=400)`.
- Never expose server paths or internal exception text in API errors: log the details (`logger.exception(...)`) and return a generic message.
- Helpers that parse optional parameters catch exceptions and return `None` silently.
- Use `try/except Exception` for file/IO operations; log failures rather than crashing.

### Frontend

Run from `frontend/` with **pnpm** (version pinned in `package.json` `packageManager`; `corepack enable` provides it). `frontend/pnpm-lock.yaml` is the only lockfile: never commit `package-lock.json` or `yarn.lock`. Node `^20.19.0 || >=22.12.0`.

```bash
pnpm install
pnpm dev           # :5173, proxies /api and /media to :8000 when VITE_API_BASE_URL is empty
pnpm test          # Vitest, single run
pnpm vitest run src/inspecciones/ui/ListaInspeccionesPage.test.tsx   # one file
pnpm vitest run -t "creates the inspection"                          # one test by name
pnpm lint          # oxlint
pnpm build         # tsc -b + vite build
pnpm add <pkg>     # add a dependency (pnpm add -D <pkg> for dev)
```

- **TDD**: write the failing test first. Page tests go through accessible roles/labels with fake adapters from `src/test/dobles.tsx`; never hit the real API in tests.
- **Ports and adapters**: pages get adapters via `useDependencias()`. Only `src/app/composicion.ts` picks implementations. Map snake_case DTOs to the domain in `infrastructure/dtos.ts`; components never see wire shapes.
- **Container / presentational**: `*Page.tsx` loads data and owns state; presentational components receive props only.
- **Live updates** come from `EventSource` through the `EventosInspeccion` port and the `aplicarEvento` reducer. Do not add polling.
- **Styling**: Tailwind with the semantic tokens in `src/index.css` (`bg-surface`, `text-ink`, `border-line`, `text-critical`, …). They swap in dark mode, so `dark:` variants are rarely needed.
- **Language**: identifiers follow the Spanish domain (`Inspeccion`, `subirFoto`); UI copy is neutral Spanish; code comments in English.
- **Inspections history** (`/`): `ListaInspeccionesPage` calls `InspeccionesRepository.buscar(filtro, cursor?)` (one server page per call, `limit=24`, no walk-all). The filter bar (`FiltrosInspecciones`: vessel, `desde`/`hasta`, minimum severity, name text) keeps its state in the URL query (`buque`, `desde`, `hasta`, `severidad_min`, `q`; see `ui/filtroUrl.ts`); the text is debounced (300 ms) and `q` is only sent with 2+ characters. Any filter change restarts from the first page, "Cargar más" appends the next one while `hayMas`, and `useBusquedaInspecciones` drops responses of a previous search. 400 `ApiError.campos` messages are shown next to the matching control. Cards show `nombre` and the `severidadMax` badge; the rename (`renombrar` → `PATCH`) lives on `/inspecciones/:id/resultados`.
- **Hull sections**: the create form (`NuevoBuquePage` + `SeccionesCascoForm`) offers standard or custom sections; standard mode omits `secciones` from the POST (the backend default), custom sends `{nombre, codigo?, descripcion?}[]` in row order. `BuqueDetalle.secciones` feeds the vessel sheet, and `InspeccionesRepository.listarSecciones(buqueId)` requests `?buque=<id>` (the upload page uses the inspection's vessel).
- **Vessels**: `HttpBuquesRepository` (`buques/infrastructure/`) implements `BuquesRepository` (`listar` walks every page of `GET /api/buques/`, `obtener`, `crear`) and is wired in `composicion.ts`; DTO mapping lives in `buques/infrastructure/dtos.ts`. Field-level 400 errors arrive in `ApiError.campos` (snake_case keys). Screens live in `buques/ui/`: list with client-side search (`/buques`), create form (`/buques/nuevo`, server `campos` errors shown per field) and technical sheet (`/buques/:id`); the main nav has a "Buques" link. There is no edit/delete.

---

## Architecture Notes

- No authentication in this version (no JWT middleware, no login). Authorship fields such as `tomado_por` are free text.
- UI and API language: the domain is Spanish; the frontend UI copy is Spanish (no i18n layer yet).

### Inspections search (`vision/busqueda.py`)

- `GET /api/vision/inspecciones/` returns `{resultados, siguiente, hay_mas}` (no `total`). Order is fixed: `-fecha_creacion, -id`.
- Filters (combined with AND): `buque` (alias `buque_id`), `desde` / `hasta` (`YYYY-MM-DD`, `hasta` inclusive), `severidad_min` (`low|medium|high|critical`), `q` (2-100 chars, case-insensitive match on `nombre`). Plus `limit` (1-100, default 20) and `cursor` (the opaque `siguiente` of the previous page).
- Invalid parameters return 400 `{"error": "Datos inválidos.", "campos": {...}}`, with every invalid field reported at once. **Unknown query parameters are ignored**, not rejected.
- To add a criterion, add one `Filtro` entry (parser + `aplicar`) to `FILTROS`; the view does not change. `describir_filtros()` exposes the registry as JSON so a future natural-language interpreter can derive its schema.
- `InspeccionCasco.severidad_max` (`NivelSeveridad`, 1=low .. 4=critical) is denormalized from the photos: the Celery task raises it with a conditional UPDATE and the photo delete view recomputes it. Never write it from anywhere else.
- `InspeccionCasco.nombre` is optional on create; when blank the backend stores `Inspección #<id> — <buque>`. `PATCH /api/vision/inspecciones/<id>/` edits `nombre` and `descripcion` only.
- Migration `0002` runs `CREATE EXTENSION pg_trgm`: the PostgreSQL `contrib` package must be installed (Fedora: `postgresql-contrib`) and the DB user must be allowed to create extensions.

### Hull sections (`vision/secciones.py`)

- Sections belong to a vessel: `SeccionCasco.buque` (FK, cascade) and `codigo` is unique **per vessel** (`UniqueConstraint(buque, codigo)`). There is no global catalog and no seed command.
- `POST /api/buques/` takes an optional `secciones`: absent or `"estandar"` creates the 20 sections of `SECCIONES_ESTANDAR`; a non-empty list of `{nombre, codigo?, descripcion?}` creates exactly those, in order (`orden` = position; a blank `codigo` becomes `SEC-01`, `SEC-02`, ...). Invalid lists return 400 `{"error": "Datos inválidos.", "campos": {"secciones": [...]}}` and nothing is created (vessel and sections are saved in one transaction).
- The vessel sheet (`GET /api/buques/<id>/` and the 201 response) returns `secciones: [{id, codigo, nombre, descripcion, orden}]`. `GET /api/vision/secciones/?buque=<id>` lists them (`buque` required: 400 when missing or invalid, 404 when the vessel does not exist).
- `POST /api/vision/inspecciones/<id>/fotos/` rejects (400) a `seccion_id` that belongs to another vessel than the inspection's.
- Sections cannot be edited after creation (no vessel update endpoint yet).

### Vision module (async pipeline)

- Django views only enqueue: `procesar_foto.apply_async()` → RabbitMQ queue `vision`. Never run inference inline in a view (the direct endpoint `/api/ai/anomalias/` is the one documented exception: no persistence, no queue).
- The Celery worker (`vision/tasks.py`) persists results to Postgres and publishes events to Redis; Django streams them to the browser as SSE from `/api/vision/inspecciones/<id>/stream/`. Clients consume them with `EventSource` — **do not add polling loops**.
- Inference goes through `vision.inference.run_inference()`. Never call `core_engine` directly from views or tasks (the model catalog and its availability checks live in `vision/inference.py` too: `listar_modelos()`, `modelo_disponible()`). `core_engine` caches each detector per process, so there is no singleton to manage.
- `run_inference()` takes no `iou` parameter (removed in nautic_core v3).
- Postgres (`FotoInspeccion.estado`) is the source of truth — there is no Celery result backend.
- Failures that exhaust retries go to the `vision.dead` DLQ, visible in Flower.
- **Model selection**: the model is chosen when analyzing, not at upload. `GET /api/vision/modelos/` lists the catalog (`id, label, descripcion, arquitectura, version, produce_mascaras, confianza_por_defecto, por_defecto, disponible`). `POST /api/vision/inspecciones/<id>/analizar/` and the photo retry `POST /api/vision/fotos/<id>/` accept an optional `{"modelo": "<id>"}` (default: `VISION_MODEL_ID`, or the photo's own `modelo_id` on retry). An unknown or unavailable model returns 400 and nothing is enqueued or changed. Each photo stores the model in `FotoInspeccion.modelo_id` (exposed as `modelo` in the photo dict and SSE events) and the worker runs `run_inference(..., model_id=foto.modelo_id)`. On completion the worker also stores `FotoInspeccion.modelo_version` and `taxonomia_version` from the `analyze()` result (`model_version`, `taxonomy_version`; null when absent or for photos analyzed before migration `0005`; overwritten by a re-analysis), exposed under the same names in the photo dict and the `foto-updated` SSE event. When no confidence is given each model uses its own calibrated default (`run_inference` no longer forces 0.25).
- Rate limiting is per IP, Redis-backed and fail-open. Limits: `VISION_RATE_LIMIT_UPLOADS_PER_MINUTE` and `VISION_RATE_LIMIT_MAX_CONCURRENT` in `backend/config/settings.py`.

---

## Key Files

| File | Purpose |
|---|---|
| `backend/config/settings.py` | Django settings (DB, apps, CORS, Celery, Redis, vision, rate limits) |
| `backend/config/urls.py` | Root routing — mounts `vision` and the OpenAPI docs |
| `backend/config/celery.py` | Celery app definition |
| `backend/vision/models.py` | `Buque`, `SeccionCasco`, `InspeccionCasco`, `FotoInspeccion`, `NivelSeveridad` + `severidad_max` helpers |
| `backend/vision/views.py` | Vision REST endpoints + SSE stream |
| `backend/vision/busqueda.py` | Inspection search: declarative filter registry (`FILTROS`) + cursor pagination (`buscar_inspecciones`) |
| `backend/vision/secciones.py` | `SECCIONES_ESTANDAR` + per-vessel section creation and validation |
| `backend/vision/views_buques.py` | Buques REST endpoints (`/api/buques/`): list, create, detail |
| `backend/vision/urls.py` | URL routing for the vision app |
| `backend/vision/tasks.py` | Celery task `procesar_foto` + dead-letter task |
| `backend/vision/inference.py` | `run_inference(model_id=...)` adapter over `core_engine.vision.analyze`, model catalog/availability helpers + config validation |
| `backend/config/almacenamiento.py` | `configurar_storages(env)`: builds `STORAGES` (local or S3) from environment variables |
| `backend/vision/almacenamiento.py` | Photo storage helpers over `default_storage` (keys, save, read, delete, URL) |
| `backend/vision/pubsub.py` | Redis pub/sub used by SSE |
| `backend/vision/ratelimit.py` | Per-IP upload and concurrency limits |
| `backend/pyproject.toml`, `backend/uv.lock` | Dependencies (uv) |
| `backend/.env.example` | Environment variable template |
| `backend/Dockerfile` | Container image (build context `backend/`) |

---

## Module Documentation

| Doc | Scope |
|---|---|
| `README.md` | Project intro, roadmap, quickstart |
| `backend/vision/INSPECCION_IA.md` | Vision module end-to-end + design decisions |
| `VISION_BACKEND.md` | Vision backend reference (Celery, Redis, SSE, rate limiting, inference adapter) |
