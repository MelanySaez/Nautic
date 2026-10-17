# AGENTS.md — Nautic

Guidance for agentic coding agents operating in this repository.

---

## Project Overview

Nautic is a hull-inspection system for naval vessels. This repository is a **monorepo root**:

- **`backend/`** — the only code that exists today: a Django project (DRF + Celery) with a single app, `vision`.
- **`frontend/`** — React + TypeScript SPA (Vite, Tailwind v4, React Router). `frontend/interfaz/` holds the original mockups: visual reference only, never imported or shipped.

Intended product (roadmap, **not implemented yet**): three sections.

| Section | Purpose | Status |
|---|---|---|
| **Buques** | Vessel entity with a technical sheet | Model exists (`vision.models.Buque`); no CRUD endpoints |
| **Inspecciones** | Inspection sessions per vessel | Model + endpoints exist (`InspeccionCasco`) |
| **Visión IA** | YOLO hull analysis; every analysis belongs to a concrete inspection | Implemented (photos → Celery → SSE) |

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
│   │   ├── settings.py, urls.py, celery.py
│   │   ├── wsgi.py, asgi.py
│   │   └── spectacular_hooks.py
│   └── vision/                  # the only Django app
│       ├── models.py, views.py, urls.py, tasks.py
│       ├── inference.py, pubsub.py, ratelimit.py
│       ├── management/commands/seed_secciones_casco.py
│       └── INSPECCION_IA.md
└── frontend/                    # React + TypeScript SPA (npm)
    ├── package.json, vite.config.ts
    ├── interfaz/                # mockups (reference only)
    └── src/
        ├── app/                 # router, layout, composition root
        ├── inspecciones/        # domain / application / infrastructure / ui
        ├── buques/              # port + in-memory adapter
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
uv run python manage.py seed_secciones_casco   # seed the hull-section catalog
uv run python manage.py runserver              # dev server on :8000
uv run python manage.py check                  # system checks (includes vision.E001)
```

- Database: PostgreSQL, default name `NauticDB` (`DB_NAME` in `.env`).
- `nautic_core` (v3.0.0) is installed from `ssh://git@github.com/AaronDLF/nautic_core.git`; it needs an SSH key with access. It is installed as `nautic_core` but imported as `core_engine`.
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

Required environment: `NAUTIC_WEIGHTS_DIR` (directory with the model weights). Optional: `VISION_MODEL_ID` (default `yolo-seg`; valid ids come from the `core_engine` catalog: `yolo-seg`, `yolo-tiled`, `maskrcnn`, `rtdetr`).

`vision.inference.verificar_configuracion()` validates both settings. It is enforced by the Django system check `vision.E001` and by Celery `worker_init`: a misconfigured worker **refuses to start**.

---

## Test Commands

No backend tests exist yet (`vision/` has no `tests.py`).

```bash
cd backend
uv run python manage.py test vision                      # all vision tests
uv run python manage.py test vision.tests.SomeTestClass  # one class
uv run python manage.py test vision.tests.SomeTestClass.test_method_name
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

Run from `frontend/` with **npm** (pnpm files are git-ignored). Node `^20.19.0 || >=22.12.0`.

```bash
npm install
npm run dev        # :5173, proxies /api and /media to :8000 when VITE_API_BASE_URL is empty
npm test           # Vitest, single run
npx vitest run src/inspecciones/ui/ListaInspeccionesPage.test.tsx   # one file
npx vitest run -t "creates the inspection"                          # one test by name
npm run lint       # oxlint
npm run build      # tsc -b + vite build
```

- **TDD**: write the failing test first. Page tests go through accessible roles/labels with fake adapters from `src/test/dobles.tsx`; never hit the real API in tests.
- **Ports and adapters**: pages get adapters via `useDependencias()`. Only `src/app/composicion.ts` picks implementations. Map snake_case DTOs to the domain in `infrastructure/dtos.ts`; components never see wire shapes.
- **Container / presentational**: `*Page.tsx` loads data and owns state; presentational components receive props only.
- **Live updates** come from `EventSource` through the `EventosInspeccion` port and the `aplicarEvento` reducer. Do not add polling.
- **Styling**: Tailwind with the semantic tokens in `src/index.css` (`bg-surface`, `text-ink`, `border-line`, `text-critical`, …). They swap in dark mode, so `dark:` variants are rarely needed.
- **Language**: identifiers follow the Spanish domain (`Inspeccion`, `subirFoto`); UI copy is neutral Spanish; code comments in English.
- **Vessels**: no backend endpoints yet; `EnMemoriaBuquesRepository` with a seed whose ids must exist in the `buques` table.

---

## Architecture Notes

- No authentication in this version (no JWT middleware, no login). Authorship fields such as `tomado_por` are free text.
- UI and API language: the domain is Spanish; the frontend UI copy is Spanish (no i18n layer yet).

### Vision module (async pipeline)

- Django views only enqueue: `procesar_foto.apply_async()` → RabbitMQ queue `vision`. Never run inference inline in a view (the direct endpoint `/api/ai/anomalias/` is the one documented exception: no persistence, no queue).
- The Celery worker (`vision/tasks.py`) persists results to Postgres and publishes events to Redis; Django streams them to the browser as SSE from `/api/vision/inspecciones/<id>/stream/`. Clients consume them with `EventSource` — **do not add polling loops**.
- Inference goes through `vision.inference.run_inference()`. Never call `core_engine` directly from views or tasks. `core_engine` caches each detector per process, so there is no singleton to manage.
- `run_inference()` takes no `iou` parameter (removed in nautic_core v3).
- Postgres (`FotoInspeccion.estado`) is the source of truth — there is no Celery result backend.
- Failures that exhaust retries go to the `vision.dead` DLQ, visible in Flower.
- Rate limiting is per IP, Redis-backed and fail-open. Limits: `VISION_RATE_LIMIT_UPLOADS_PER_MINUTE` and `VISION_RATE_LIMIT_MAX_CONCURRENT` in `backend/config/settings.py`.

---

## Key Files

| File | Purpose |
|---|---|
| `backend/config/settings.py` | Django settings (DB, apps, CORS, Celery, Redis, vision, rate limits) |
| `backend/config/urls.py` | Root routing — mounts `vision` and the OpenAPI docs |
| `backend/config/celery.py` | Celery app definition |
| `backend/vision/models.py` | `Buque`, `SeccionCasco`, `InspeccionCasco`, `FotoInspeccion` |
| `backend/vision/views.py` | Vision REST endpoints + SSE stream |
| `backend/vision/urls.py` | URL routing for the vision app |
| `backend/vision/tasks.py` | Celery task `procesar_foto` + dead-letter task |
| `backend/vision/inference.py` | `run_inference()` adapter over `core_engine.vision.analyze` + config validation |
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
