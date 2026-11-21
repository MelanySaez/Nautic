# AGENTS.md — Nautic

Guidance for agentic coding agents operating in this repository.

---

## Project Overview

Nautic is a hull-inspection system primarily for naval (warship) hulls, also applicable to other medium and large steel-hulled vessels. This repository is a **monorepo root**:

- **`backend/`** — a Django project (DRF + Celery) with a single app, `vision`.
- **`frontend/`** — React + TypeScript SPA (Vite, Tailwind v4, React Router; three.js with React Three Fiber and drei for the 3D hull view, in a lazy chunk).

The product has three sections, each with its API and its screens:

| Section | Purpose | Status |
|---|---|---|
| **Buques** | Vessel entity with a technical sheet and its own hull sections | API create / list / detail / partial update (`vision/views_buques.py`, no delete); screens `/buques`, `/buques/nuevo`, `/buques/:id`, `/buques/:id/editar` |
| **Inspecciones** | History of the inspections already created | API search, detail, rename, delete, editable report + PDF; screens `/` (vessels with inspections), `/inspecciones/buque/:id` (that vessel's inspections, with filters, or its 3D hull with `?vista=3d`) and `/inspecciones/:id/resultados`, `/inspecciones/:id/reporte` (report editor) |
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
│   ├── cuentas/                 # user accounts: Usuario model, session login, registration
│   └── vision/                  # inspections, photos, AI analysis, reports, members
│       ├── models.py, views.py, views_buques.py, views_reporte.py, busqueda.py, secciones.py, taxonomia.py, reporte.py, urls.py, tasks.py
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
- **Never use `open()`, `os.remove()`, `os.makedirs()` or `os.path.join(BASE_DIR, ...)` on photo paths.** Use the helpers in `vision/almacenamiento.py` (`guardar_original`, `guardar_anotada`, `guardar_detecciones`, `leer_archivo`, `borrar_archivo`, `url_archivo`), which wrap `default_storage`. Persist the name `save()` returns.
- Storage errors on delete are logged and never turn the response into a 500 (`borrar_archivo`).
- With `s3`, `url_archivo` reuses each key's signed URL for half of `S3_URL_EXPIRE_SECONDS` (Django cache alias `compartida`, Redis, shared with the Celery worker), so the URL stays stable and browsers can cache the photo; new objects are uploaded with `Cache-Control: private, max-age=<expiry>, immutable`. The cache key covers the S3 options a signed URL depends on (`_ALCANCE_FIRMA`: bucket, endpoint, custom domain, region, prefix, signature version, addressing style, expiry, access key), so changing any of them or rotating the access key starts from fresh URLs. A cache failure only means a fresh signature, and the cache is then skipped for `PAUSA_CACHE_SEGUNDOS` (30 s) so an unreachable Redis does not cost its timeout on every URL. The `default` cache stays local memory (the `cuentas` throttle uses it).
- Tests swap the backend with `override_settings(STORAGES=STORAGES_EN_MEMORIA)` from `vision/tests/utilidades.py`; never write photos to disk in tests.

---

## Test Commands

Backend tests live in `backend/vision/tests/` (`test_buques_api.py` for the Buques API, `test_inspecciones_api.py` and `test_busqueda_inspecciones.py` for inspection name/severity and search, `test_modelos.py` and `test_seleccion_modelo.py` for the model catalog and model selection, `test_secciones_migracion.py` for the sections-per-vessel data migration, `test_versiones_foto.py` for the `procesar_foto` task with `run_inference` mocked, `test_severidad.py` for its severity helper, `test_taxonomia.py` for the class taxonomy on detections and its endpoint, `test_detecciones_foto.py` for the raw boxes/masks file and its endpoint, `test_reporte_inspeccion.py` for the PDF report data and download, `test_reporte_edicion.py` for the editable draft and its effect on the PDF, `test_detecciones_normalizadas.py` for the detection rows, the worker replacing them and migrations `0011`/`0012`). There is no end-to-end test with a real broker or real inference.

```bash
cd backend
uv run python manage.py test                             # everything (cuentas + vision)
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
- **Navigation and transitions**: every route change animates with the View Transitions API (cross-fade; the app bar stays put). Never import `Link`, `NavLink` or `useNavigate` from `react-router` in screens: use `Enlace` / `EnlaceNav` (`shared/ui/Enlace.tsx`, `EnlaceBoton` builds on it) and `useNavegar` (`shared/hooks/useNavegar.ts`), which turn `viewTransition` on by default. An element that should morph between pages gets the same `viewTransitionName` on both (`shared/ui/transiciones.ts`, e.g. the vessel name from its card to the page title). List items use the `.animar-entrada` class, and so does the content container of every page that loads its data after navigating (otherwise the transition ends on "Cargando…" and the content pops in). The `::view-transition-*` rules live in `src/index.css`, and everything is off under `prefers-reduced-motion`; browsers without the API navigate instantly.
- **Live updates** come from `EventSource` through the `EventosInspeccion` port and the `aplicarEvento` reducer. Do not add polling.
- **Styling**: Tailwind with the semantic tokens in `src/index.css` (`bg-surface`, `text-ink`, `border-line`, `text-critical`, …). They swap in dark mode, so `dark:` variants are rarely needed.
- **Language**: identifiers follow the Spanish domain (`Inspeccion`, `subirFoto`); UI copy is neutral Spanish; code comments in English.
- **Inspections history**: `/` (`BuquesConInspeccionesPage`) lists only the vessels that have inspections, by name, with their count (`BuquesRepository.listarConInspecciones()`), plus a client-side vessel name search (case- and accent-insensitive, kept in `?q=`); there are no inspection cards there. Vessel links pass `{buqueNombre, volverA}` in the location state, so the vessel name morphs into the next page's title and the back link restores the search. Each vessel links to `/inspecciones/buque/:id` (`ListaInspeccionesPage`), which shows the vessel name (and the list / 3D switch, see Hull 3D view) and calls `InspeccionesRepository.buscar({...filtro, buqueId}, cursor?)` (one server page per call, `limit=24`, no walk-all). The vessel comes from the route; the filter bar (`FiltrosInspecciones`: `desde`/`hasta`, minimum severity, name text, no vessel selector) keeps its state in the URL query (`desde`, `hasta`, `severidad_min`, `q`; see `ui/filtroUrl.ts`); the text is debounced (300 ms) and `q` is only sent with 2+ characters. Any filter change restarts from the first page, "Cargar más" appends the next one while `hayMas`, and `useBusquedaInspecciones` drops responses of a previous search. 400 `ApiError.campos` messages are shown next to the matching control. Cards show `nombre` and the `severidadMax` badge, not the vessel; the rename (`renombrar` → `PATCH`) lives on `/inspecciones/:id/resultados`. Its "Nueva inspección" links go to `/vision?buque=<id>`, so the form opens with that vessel preselected.
- **Session**: `src/cuentas/` (port `CuentasRepository`, `HttpCuentasRepository`, `SesionProvider`). `RaizSesion` loads the current user; `RequiereSesion` sends every route except `/login` and `/registro` to `/login`; signing in or registering always opens `/` (the inspections view), never the page that was open before. `ApiClient` sends `credentials` and `X-CSRFToken` (cookie `csrftoken`) on unsafe methods, and any 401 triggers `alNoAutorizado` → login; a 403 is shown as a normal error. The app bar shows the user and "Cerrar sesión". Password fields use `InputContrasena` (`shared/ui/`, inside `Campo`): a "Mostrar contraseña" / "Ocultar contraseña" button toggles the input between `password` and `text`.
- **Inspection permissions in the UI**: `Inspeccion.lider`, `privada` and `misPermisos` (all false when the server omits them) hide or disable upload/delete photos, analyze/retry, rename, report editing (read-only form) and delete (list: admin or leader). A "Privada" badge marks private inspections. The new-inspection form has no inspector field: it omits `tomado_por`, so the backend signs with the leader's name, and the team goes in its "Acceso y equipo" card (`EquipoInicial`: "Inspección privada" checkbox, sent only when checked; person + role rows; blank rows are not sent; server errors `miembros.<i>.*`, including `usuario_id`, are mapped back to their row). The results page's "Equipo" section (`EquipoInspeccion`, port `MiembrosInspeccion`) lets the leader invite someone with a role, change role or each permission, remove members and toggle privacy; others see it read-only. Both invite fields use `SelectorPersona` ("Nombre o email …"), a Gmail-like combobox. From 2 characters it suggests registered users by name, through `MiembrosInspeccion.buscarUsuarios` → `GET /api/auth/usuarios/?q=`. The search waits 250 ms after typing, is skipped when the text contains "@", and drops answers to an older text. Suggestions show the name and cargo, never the email. Arrows, Enter and Escape move through the list, and Enter picks instead of submitting. A picked user is invited as `{usuarioId}` (`usuario_id`), and editing the text drops the pick. A typed email is invited as `{email}`. `invitadoDe` (`domain/miembros.ts`) resolves which one; text that is neither shows "Elige a alguien de la lista o escribe su email completo." without calling the server. When a search finds nobody, a `role="status"` notice says "Nadie coincide con «…». Escribe su email completo; si aún no tiene cuenta, debe registrarse primero." (Escape closes it).
- **Inspection report**: the results page links to `/inspecciones/:id/reporte` (`ReportePage`). It loads `InspeccionesRepository.obtenerReporte(id)` (`domain/reporte.ts`: `BorradorReporte`, `FotoRevisable`) and edits the inspector texts plus, per photo (`FotoRevision`), a confirm/discard checkbox per anomaly and a note. "Guardar" sends only `cambiosDeReporte(guardado, edicion)` via `guardarReporte` (`PATCH`). "Descargar PDF" is a plain `<a download>` (`AnclaBoton`) to `urlReporte(id)` (`/reporte/pdf/`); it is a disabled button while there are unsaved changes.
- **Detections**: `Deteccion` carries the backend taxonomy (`etiqueta`, `tipo` `anomalia` | `componente` | null, `severidad`); the DTO mapper falls back to the de-snaked class name when a server omits it. `Deteccion.descartada` says the report discarded the class (false when the server omits it). `esAnomalia` / `tieneAnomalias` (`domain/reglas.ts`) treat only components as non-anomalies, so an unknown class is never hidden; `esHallazgo` also drops discarded ones, and `resumirZonas` (`domain/resumenZonas.ts`) applies the PDF report's rule per section (completed photos only; worst severity, else `sin-clasificar` / `sin-hallazgos` / `sin-analizar` / `sin-fotos`). Result cards list anomalies (with a severity badge) apart from components, and "Con anomalías" counts photos with at least one anomaly.
- **Boxes and masks**: `Foto.detalleDisponible` says the server kept the instances of the last analysis; `InspeccionesRepository.obtenerDetecciones(fotoId)` loads them (`domain/detecciones.ts`: `DetallePorInstancia`, `decodificarRle` for the column-major COCO RLE). On `/vision/:id/resultados` the "Mostrar contornos" switch shows the original image with `CapaDetecciones` (a canvas in the image's pixel space: translucent masks plus boxes in the taxonomy color) and a per-class filter ("Clases visibles"); the annotated switch is disabled meanwhile.
- **Hull sections**: the create form (`NuevoBuquePage` + `SeccionesCascoForm`) offers standard or custom sections; standard mode omits `secciones` from the POST (the backend default), custom sends `{nombre, codigo?, descripcion?}[]` in row order. `BuqueDetalle.secciones` feeds the vessel sheet, and `InspeccionesRepository.listarSecciones(buqueId)` requests `?buque=<id>` (the upload page uses the inspection's vessel). Deep links by zone use the numeric `SeccionCasco.id` (`ui/parametrosUrl.ts`; anything but a positive integer, or an id not offered, is ignored): `/vision?buque=<id>&zona=<seccionId>` preselects the vessel and opens the new inspection at `/vision/<id>?zona=`; on `/vision/:id` and the results pages `?zona=` is the selected zone (results: only among zones with analyzed photos) and changing it rewrites the URL with `replace` (pressing the active zone on the upload page clears it). `buques/domain/casco/` holds the code-generated hull, pure and without three.js: the archetype (`arquetipo.ts`), measurements with fallbacks (`dimensiones.ts`), the 23 zones and exact-code matching (`zonas.ts`), mesh data per zone (`geometria.ts`) and the side profile as an SVG path (`perfil.ts`).
- **Hull 3D view**: inside `/inspecciones/buque/:id`, a "Lista" / "Vista 3D" switch (`aria-pressed` buttons) sets `?vista=3d` (push; switching drops `?zona`). The 3D view (`VistaCascoBuque`) uses the vessel already loaded by the page (measures, `secciones`, and its `tipo`, whose archetype shapes the hull) and colours every zone with the most recent inspection of the vessel (`buscar({buqueId})`, first result, named above the hull; no selector), kept live with `useInspeccionEnVivo`; `resumirZonas(fotos, buque.secciones)` gives each section its state (all `sin-fotos` without inspections). `?zona=<seccionId>` is the selected zone (a toggle, `replace`). Layout: the hull fills the width (`aspect-video`, at most 72vh) with the legend, then `PanelZona`, then a folded `<details>` "Lista de secciones (n)" (closed by default); there is no side list. Hovering a zone shows a label next to the pointer with its code, section name (`nombresZona` prop) and state; it is moved through its style, never re-rendering the scene. `ui/casco/`: `ListaZonasCasco` (inside that `<details>`) is the accessible path ("Zonas del casco" in standard order, then "Secciones sin ubicación en el casco" for codes `ubicarSecciones` does not place); `PanelZona` shows the counts and a two-option group "Acciones de la zona": "Nueva inspección en esta sección" (`/vision?buque=&zona=`) and "Ver inspecciones de esta sección" (back to the list with `?seccion=<seccionId>`, i.e. `FiltroInspecciones.seccionId`, sent as the `seccion` search filter; the list shows "Sección: <código> · <nombre>" with "Quitar filtro de sección"); `estadosZona.ts` maps each state to its label, classes and colour token (`--c-*` in `index.css`, including the `--c-zona-sin-*` neutrals; the `--color-*` names are not emitted). The scene slot `EscenaCasco` receives `PropsLienzoCasco` (`lienzoCasco.ts`) and lazy-loads the WebGL canvas `LienzoCasco.tsx` (`React.lazy(() => import('./LienzoCasco.tsx'))`; the extension is explicit because `lienzoCasco.ts` differs only in case). It is the only module, with what only it imports, allowed to import `three`, `@react-three/fiber` or `@react-three/drei`, so three.js stays in its own chunk (`pnpm build`: the entry `index-*.js` must not contain `WebGLRenderer`). `SiluetaCasco` (from `perfil.ts`) shows while the chunk loads, and stays when `webglDisponible()` is false (jsdom included) or the canvas throws (error boundary). The canvas builds one mesh per zone from `generarCasco` (deck, transom and superstructure neutral and not selectable), coloured from the `--c-*` tokens read with `getComputedStyle` and re-read when the `<html>` `class`/`data-theme` or the system colour scheme changes (`coloresZona.ts`); zones stay `sin-fotos` while the inspection loads and colour changes blend in. Hover highlights and labels a zone, a click that is not a drag (> 5 px) calls `onSeleccionar`, a click elsewhere clears it, and the selected zone gets an accent outline; zones with photos show a count badge. `OrbitControls` (damping, 0.25–3 hull lengths) plus the preset buttons "3/4", "Babor", "Estribor", "Fondo" and the "Mostrar flotación" toggle (a translucent plane at the draft). On mount the camera flies from the silhouette's side view to 3/4; with `prefers-reduced-motion` there is no fly-in or colour blend and presets jump. The canvas is `aria-hidden` inside a `role="img"` wrapper; the zone list stays the accessible path. Camera, timing and anchor math is pure in `vistaCasco.ts`; jsdom has no WebGL, so tests replace the canvas with a double and the scene is checked by hand.
- **Vessels**: `HttpBuquesRepository` (`buques/infrastructure/`) implements `BuquesRepository` (`listar` walks every page of `GET /api/buques/`, `listarConInspecciones` walks `?con_inspecciones=1`, `obtener`, `crear`, `actualizar` → `PATCH`) and is wired in `composicion.ts`; DTO mapping lives in `buques/infrastructure/dtos.ts`. Field-level 400 errors arrive in `ApiError.campos` (snake_case keys). Screens live in `buques/ui/`: list with client-side search (`/buques`), create form (`/buques/nuevo`, server `campos` errors shown per field) technical sheet (`/buques/:id`, with an "Editar buque" button) and edit form (`/buques/:id/editar`, `EditarBuquePage`: prefilled, sends only the changed fields, sections read-only). Create and edit share `CamposBuque` + `formularioBuque.ts`. The type is not free text: "Tipo" is a `<select>` of `TIPOS_BUQUE` (`buques/domain/tiposBuque.ts`: Fragata, Corbeta, Patrullera, Destructor, Buque anfibio, Buque logístico, each with its own `Arquetipo` in `casco/arquetipo.ts`, used only by the inspections 3D hull); the value is the type name, stored as `tipo` (the backend is unchanged). `tipoBuqueDe` matches a stored type ignoring case and accents; a type from before the catalogue is listed as "<tipo> (fuera del catálogo)" and kept until another one is chosen, and `arquetipoDeBuque` gives it the generic warship (`BUQUE_DE_GUERRA`).
  - **Image field:** `CampoImagen` is a file picker (`type=file`, `accept="image/*"`) with a preview and "Quitar imagen".
    - State: `useEleccionImagen` (`eleccionImagen.ts`) gives both pages their `EleccionImagen {archivo, quitar}`, and keeps its error in the form `errores`.
    - A file rejected by the client check (image type, `MAXIMO_MB_IMAGEN`) is never kept, so it never blocks submitting.
    - The preview URL is created and released in the same effect, which keeps it working under StrictMode.
  - **Create:** the vessel is created first, then `subirImagen(id, file)` runs. If the upload fails the vessel is kept, and the sheet opens with `state.aviso`, shown as an alert.
  - **Edit:** the PATCH runs first, then `subirImagen` or `quitarImagen`. An image error is shown under the field.
  - **Sheet:** `Buque.imagen` is the image URL (read-only, never sent in `crear`/`actualizar`); the sheet shows it instead of the ship icon.
  - **Repository:** `HttpBuquesRepository.subirImagen` posts `FormData` to `/api/buques/<id>/imagen/`, and `quitarImagen` sends `DELETE` (it removes only the image).
  - The main nav has a "Buques" link. Vessels cannot be deleted.

---

## Architecture Notes

- **Accounts and sessions** (`backend/cuentas/`): custom user `cuentas.Usuario` (`AUTH_USER_MODEL`; email login stored lowercase, `nombre`, `cargo`). Session-cookie auth, not JWT, because `EventSource` cannot send an `Authorization` header: `GET /api/auth/csrf/` (sets `csrftoken`), `POST /api/auth/login/`, `POST /api/auth/registro/` (open registration; Django password validators; never grants privileges), `POST /api/auth/logout/`, `GET /api/auth/yo/` (`{id, email, nombre, cargo, es_admin}`), `GET /api/auth/usuarios/?q=` (invite autocomplete: active users whose `nombre` contains `q`, 2-100 chars else 400 `campos.q`, excluding the requester, ordered by name, at most 8, `{resultados: [{id, nombre, cargo}]}`; never searches or returns emails, which stay private; throttled per user, `DEFAULT_THROTTLE_RATES['busqueda_usuarios']`). Login and registration enforce CSRF explicitly and are throttled per IP (`DEFAULT_THROTTLE_RATES['cuentas']`). Every other endpoint requires a session: `cuentas.autenticacion.Sesion` answers **401** without one; unsafe requests need `X-CSRFToken`. Sessions expire after one hour without requests (`SESSION_COOKIE_AGE`; `SESSION_SAVE_EVERY_REQUEST` renews the deadline on every request); they live in the database, so a server restart does not end them.
- **Inspection permissions** (`vision/permisos.py`, use `exigir()` in every view that takes an inspection or photo): the creator is `InspeccionCasco.lider`. Public inspections (`privada=false`, default) are readable by every signed-in user; private ones only by the leader and members. Superusers read and do everything (support). `InspeccionMiembro` (migration `0013`) stores invited users with `rol` (`colaborador` = all four permissions, `revisor` = `editar_reporte`, `observador` = none, `personalizado` when adjusted) and `puede_subir_fotos` (upload/delete photos), `puede_analizar` (analyze/retry), `puede_editar_reporte` (report draft), `puede_editar_inspeccion` (name/description). Creation also takes an optional `privada` (boolean, default false; 400 `campos.privada` otherwise), since the creator is the leader. The team can also be invited at creation: `POST /api/vision/inspecciones/` takes an optional `miembros: [{email | usuario_id, rol, permisos?}]` validated with the same rules (`views_miembros.validar_equipo`); any invalid entry creates nothing and answers 400 with flat keys `miembros.<i>.email|usuario_id|rol|permisos`. Every invitation (here and `POST .../miembros/`) names the user by exactly one of `email` or `usuario_id` (the id from the user search); errors go under the field sent, and sending both is a 400 `usuario_id`. Leader only: `privada`, members (`/api/vision/inspecciones/<id>/miembros/[<miembro_id>/]`), leadership transfer (`PATCH lider_id`; the previous leader stays as Colaborador) and deleting the inspection. Unreadable → **404** (existence not revealed), readable without the permission → **403**. `visibles_para()` filters lists and search; the SSE stream checks session and visibility itself (plain Django view). Detail/create responses carry `lider`, `privada` and `mis_permisos` for the UI.
- **Traceability** (migration `0014`, all nullable, SET_NULL): `Buque.creado_por` (read-only, exposed as `creado_por`), `FotoInspeccion.subida_por`, `DeteccionFoto.validado_por` (set when the report changes `descartadas`), `ReporteInspeccion.revisado_por`. `tomado_por` stays free text, defaulting to the leader's name (the SPA never sends it; the API still accepts it).
- **Account deployment limits**: serve the SPA and `/api` from the same origin (Vite's development proxy supports this). An explicit cross-origin `VITE_API_BASE_URL` is not sufficient for session auth: fetch/EventSource credentials, CSRF token transport and cookie policy must also be configured and tested. The account throttle currently uses Django's default per-process cache; it is not a strict distributed limit. Open registration intentionally reports duplicate emails, and immediate membership invitations reveal whether an active account exists. Removing those disclosures requires a different registration/invitation flow.
- **Account and stream validation**: model validation and saves normalize account email to lowercase, including Django admin; registration rejects emails beyond the model's 254-character limit with field errors. Duplicate invitations racing with another insertion return the existing member field error after rollback. Open SSE streams recheck the session (an expired or closed one ends them, since the open stream does not renew it), the active account and current inspection visibility before emitting data and during idle waits, closing and releasing pubsub when access is lost or the inspection is deleted.
- **Account throttle client IP**: without `REST_FRAMEWORK['NUM_PROXIES']`, use `REMOTE_ADDR` and ignore forwarded headers. An explicit proxy count uses DRF's client-IP selection (`0` still ignores forwarded headers). Set a positive count only behind a controlled proxy chain that sanitizes `X-Forwarded-For`; login and registration share one per-client limit.
- UI and API language: the domain is Spanish; the frontend UI copy is Spanish (no i18n layer yet).

### Inspections search (`vision/busqueda.py`)

- `GET /api/vision/inspecciones/` returns `{resultados, siguiente, hay_mas}` (no `total`). Order is fixed: `-fecha_creacion, -id`.
- Filters (combined with AND): `buque` (alias `buque_id`), `desde` / `hasta` (`YYYY-MM-DD`, `hasta` inclusive), `severidad_min` (`low|medium|high|critical`), `q` (2-100 chars, case-insensitive match on `nombre`), `seccion` (a hull section id: inspections with at least one photo in that section, each listed once). Plus `limit` (1-100, default 20) and `cursor` (the opaque `siguiente` of the previous page).
- Invalid parameters return 400 `{"error": "Datos inválidos.", "campos": {...}}`, with every invalid field reported at once. **Unknown query parameters are ignored**, not rejected.
- To add a criterion, add one `Filtro` entry (parser + `aplicar`) to `FILTROS`; the view does not change. `describir_filtros()` exposes the registry as JSON so a future natural-language interpreter can derive its schema.
- `InspeccionCasco.severidad_max` (`NivelSeveridad`, 1=low .. 4=critical) is denormalized from the photos: the Celery task raises it with a conditional UPDATE and the photo delete view recomputes it. Never write it from anywhere else.
- `InspeccionCasco.nombre` is optional on create; when blank the backend stores `Inspección #<id> — <buque>`. `PATCH /api/vision/inspecciones/<id>/` edits `nombre` and `descripcion` only.
- Migration `0002` runs `CREATE EXTENSION pg_trgm`: the PostgreSQL `contrib` package must be installed (Fedora: `postgresql-contrib`) and the DB user must be allowed to create extensions.

### Vessels API (`vision/views_buques.py`)

- `GET /api/buques/` returns `{total, offset, limit, resultados}` ordered by `nombre, id`; each result adds `total_inspecciones` (the vessel's inspection count).
- **Vessel image** (`api_buque_imagen`): `POST /api/buques/<id>/imagen/` (multipart `imagen`) stores or replaces it, and `DELETE` removes it. Both answer with the sheet.
  - **Validation:** `vision/imagenes.validar_imagen`, shared with photo uploads (extension, content type, PIL), plus at most 5 MB (`TAMANO_MAXIMO_IMAGEN`, whole MB; messages derive from it). Errors return 400 `campos.imagen`.
  - **Storage:** `guardar_imagen_buque` stores the file under `buques/imagenes/`. A replaced or removed file is deleted.
  - **Concurrency:** the row is updated under `select_for_update`, so concurrent uploads queue and each one deletes the file before it. If the save fails, the new file is deleted.
  - **Read-only in JSON:** `imagen` is in `_CAMPOS_SOLO_LECTURA`, so a POST/PATCH that sends it gets a 400. This stops a client from pointing it at another file's key.
  - **Responses:** list, sheet and upload expose `imagen` as `url_archivo(key)` only for keys under `buques/imagenes/` (`es_imagen_buque`). Legacy free text is `null`.
- `?con_inspecciones=1` keeps only vessels with at least one inspection (accepts `true`/`false`/`1`/`0`; anything else is a 400). Absent means every vessel.

### Hull sections (`vision/secciones.py`)

- Sections belong to a vessel: `SeccionCasco.buque` (FK, cascade) and `codigo` is unique **per vessel** (`UniqueConstraint(buque, codigo)`). There is no global catalog and no seed command.
- `POST /api/buques/` takes an optional `secciones`: absent or `"estandar"` creates the 23 sections of `SECCIONES_ESTANDAR`; a non-empty list of `{nombre, codigo?, descripcion?}` creates exactly those, in order (`orden` = position; a blank `codigo` becomes `SEC-01`, `SEC-02`, ...). Invalid lists return 400 `{"error": "Datos inválidos.", "campos": {"secciones": [...]}}` and nothing is created (vessel and sections are saved in one transaction).
- The vessel sheet (`GET /api/buques/<id>/` and the 201 response) returns `secciones: [{id, codigo, nombre, descripcion, orden}]`. `GET /api/vision/secciones/?buque=<id>` lists them (`buque` required: 400 when missing or invalid, 404 when the vessel does not exist).
- `POST /api/vision/inspecciones/<id>/fotos/` rejects (400) a `seccion_id` that belongs to another vessel than the inspection's.
- Sections cannot be edited after creation: `PATCH /api/buques/<id>/` edits the technical sheet only (same validation as create, only the sent fields change, `null` clears a measure; nothing is saved on any error) and rejects `secciones` with 400.

### Vision module (async pipeline)

- Django views only enqueue: `procesar_foto.apply_async()` → RabbitMQ queue `vision`. Never run inference inline in a view (the direct endpoint `/api/ai/anomalias/` is the one documented exception: no persistence, no queue).
- The Celery worker (`vision/tasks.py`) persists results to Postgres and publishes events to Redis; Django streams them to the browser as SSE from `/api/vision/inspecciones/<id>/stream/`. Clients consume them with `EventSource` — **do not add polling loops**.
- Inference goes through `vision.inference.run_inference()`. Never call `core_engine` directly from views or tasks (the model catalog and its availability checks live in `vision/inference.py` too: `listar_modelos()`, `modelo_disponible()`). `core_engine` caches each detector per process, so there is no singleton to manage.
- `run_inference()` takes no `iou` parameter (removed in nautic_core v3).
- Postgres (`FotoInspeccion.estado`) is the source of truth — there is no Celery result backend.
- Failures that exhaust retries go to the `vision.dead` DLQ, visible in Flower.
- **RabbitMQ 4.x**: transient non-exclusive queues are rejected (`transient_nonexcl_queues`). Task queues (`vision`, `vision.dead`) are durable; the remote-control and event queues are declared exclusive with `CELERY_CONTROL_QUEUE_EXCLUSIVE` / `CELERY_EVENT_QUEUE_EXCLUSIVE` (celery 5.6.3), pinned by `test_colas_celery.py`. Never declare a queue that is neither durable nor exclusive. Because the per-worker control queue is exclusive, two workers with the same node name cannot run at once: start each extra worker with a unique `-n <name>@%h`.
- **Model selection**: the model is chosen when analyzing, not at upload. `GET /api/vision/modelos/` lists the catalog (`id, label, descripcion, arquitectura, version, produce_mascaras, confianza_por_defecto, por_defecto, disponible`). `POST /api/vision/inspecciones/<id>/analizar/` and the photo retry `POST /api/vision/fotos/<id>/` accept an optional `{"modelo": "<id>"}` (default: `VISION_MODEL_ID`, or the photo's own `modelo_id` on retry). An unknown or unavailable model returns 400 and nothing is enqueued or changed. Each photo stores the model in `FotoInspeccion.modelo_id` (exposed as `modelo` in the photo dict and SSE events) and the worker runs `run_inference(..., model_id=foto.modelo_id)`. On completion the worker also stores `FotoInspeccion.modelo_version` and `taxonomia_version` from the `analyze()` result (`model_version`, `taxonomy_version`; null when absent or for photos analyzed before migration `0005`; overwritten by a re-analysis), exposed under the same names in the photo dict and the `foto-updated` SSE event. When no confidence is given each model uses its own calibrated default (`run_inference` no longer forces 0.25).
- **Taxonomy**: `vision/taxonomia.py` is the only reader of the `core_engine.vision.domain` taxonomy (`CLASSES`, `TAXONOMY_VERSION`). Grouped detections are rows of `DeteccionFoto` (`foto.detecciones`: one per class per photo, `clase`, `cantidad`, `confianza_max`, `descartada`; unique `(foto, clase)`, index `(clase, foto)`, migrations `0011`/`0012` replaced the old JSON column). The worker replaces a photo's rows on every analysis, so a re-analysis drops earlier discards. `resumen_detecciones(foto)` turns them into the API shape `{class_name, count, max_confidence, descartada}` (`descartada`: dismissed in the report, so readers can drop false positives like the PDF; null while the photo was never analyzed, `[]` when analyzed with nothing found); prefetch `detecciones` when listing photos; the photo dict and `foto-updated` add `etiqueta`, `tipo` (`anomalia` | `componente`) and `severidad` at read time (`enriquecer_detecciones`). `GET /api/vision/taxonomia/` returns `{version, clases: [{id, nombre, etiqueta, tipo, severidad, color}]}`.
- **Raw detections (boxes and masks)**: the worker calls `run_inference(..., incluir_mascaras=True)` and stores one JSON file per analysis in photo storage (`inspecciones/detecciones/<foto>_<hex>.json`: `{ancho, alto, detecciones: [{class_id, class_name, confidence, bbox{x1,y1,x2,y2}, mask}]}`, `mask` = uncompressed COCO RLE or null); `FotoInspeccion.detecciones_archivo` (migration `0009`) keeps the key. A re-analysis deletes the previous file once the new key is saved; deleting a photo or an inspection deletes it. `GET /api/vision/fotos/<id>/detecciones/` serves it with the taxonomy per entry (`clase, etiqueta, tipo, severidad, color, confianza, bbox, mascara`); 404 when the photo has none. It sends an `ETag` (hash of the file key + taxonomy version + `FORMATO_DETECCIONES` in `views.py`, which must be bumped when the payload shape changes) with `Cache-Control: private, no-cache`: a matching `If-None-Match` gets a 304 without reading storage, always after the permission check. The photo dict and `foto-updated` expose `detalle_disponible`.
- **Inspection report** (`vision/reporte.py`, `vision/views_reporte.py`):
  - **Draft:** stored per inspection in `ReporteInspeccion` (1:1, created on the first `PATCH`: `conclusion`, `observaciones`, `recomendaciones`, `inspector_nombre`, `inspector_cargo`); the per-photo review lives on the photo itself: `DeteccionFoto.descartada` per anomaly class and `FotoInspeccion.nota_inspector`.
  - **Draft API:** `GET /api/vision/inspecciones/<id>/reporte/` returns the texts (`inspector_nombre` falls back to the inspection's `tomado_por` when none is saved, via `textos_reporte()`, which the PDF header and signature also use), `actualizado` (null until saved) and `fotos` (analyzed photos with anomalies, each with `hallazgos[].descartado` and `nota`). `PATCH` takes the texts and `fotos: [{foto_id, descartadas?, nota?}]` and changes only what is sent. It rejects unknown fields, photos of another inspection or not analyzed, and classes the photo does not have, with 400 `campos`, saving nothing.
  - **PDF:** `GET .../reporte/pdf/` returns `application/pdf` as `attachment; filename="reporte-inspeccion-<id>.pdf"` (404 when missing) and is built from the draft. Discarded findings leave every count, severity (section and max severity come from the confirmed findings' taxonomy severity, not `foto.severidad`) and the evidence.
  - **PDF sections:**
    1. Header, using the draft inspector name over `tomado_por`.
    2. Executive summary, plus the inspector's conclusion.
    3. Vessel data.
    4. Findings per section.
    5. Evidence: annotated image, which still shows discarded boxes and says so, plus the photo note.
    6. Sections not inspected.
    7. Methodology, with a reviewed/not-reviewed notice and the discarded count.
    8. Observations, recommendations and signature, with blank lines when empty.
  - **Rendering details:** components are not findings; unknown classes are. An unreadable photo is logged and listed without image. Photos are decoded with JPEG draft + thumbnail before the RGB convert. `_PdfRenderer` lets `Accept: application/pdf` clients through and labels their error bodies `application/json`. Built with ReportLab (pure Python). Timestamps are naive (`USE_TZ=False`), so format them with `_fecha()`.
- Rate limiting is per IP, Redis-backed and fail-open. Limits: `VISION_RATE_LIMIT_UPLOADS_PER_MINUTE` and `VISION_RATE_LIMIT_MAX_CONCURRENT` in `backend/config/settings.py`.

---

## Key Files

| File | Purpose |
|---|---|
| `backend/config/settings.py` | Django settings (DB, apps, CORS, Celery, Redis, vision, rate limits) |
| `backend/config/urls.py` | Root routing — mounts `vision` and the OpenAPI docs |
| `backend/config/celery.py` | Celery app definition |
| `backend/vision/models.py` | `Buque`, `SeccionCasco`, `InspeccionCasco`, `FotoInspeccion`, `ReporteInspeccion`, `DeteccionFoto` + `resumen_detecciones()`, `NivelSeveridad` + `severidad_max` helpers |
| `backend/vision/views.py` | Vision REST endpoints + SSE stream |
| `backend/vision/busqueda.py` | Inspection search: declarative filter registry (`FILTROS`) + cursor pagination (`buscar_inspecciones`) |
| `backend/vision/secciones.py` | `SECCIONES_ESTANDAR` + per-vessel section creation and validation |
| `backend/vision/views_buques.py` | Buques REST endpoints (`/api/buques/`): list, create, detail, `PATCH` edit |
| `backend/vision/urls.py` | URL routing for the vision app |
| `backend/vision/tasks.py` | Celery task `procesar_foto` + dead-letter task |
| `backend/vision/reporte.py` | PDF inspection report: `datos_reporte()` (summary, findings per section, evidence, coverage, draft applied) + `generar_pdf()` (ReportLab) + `fotos_revisables()` |
| `backend/cuentas/` | `Usuario` model, session auth (`autenticacion.Sesion`), login/registration/logout/current-user endpoints |
| `backend/vision/permisos.py` | Who may read or change an inspection: `exigir`, `visibles_para`, `permisos_de` |
| `backend/vision/views_miembros.py` | Members of an inspection: list, invite, change role/permissions, remove |
| `backend/vision/views_reporte.py` | Report endpoints: draft `GET`/`PATCH` `/reporte/` and the PDF `/reporte/pdf/` |
| `backend/vision/taxonomia.py` | Class taxonomy of `core_engine`: read-time enrichment of detections + `/api/vision/taxonomia/` payload |
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
