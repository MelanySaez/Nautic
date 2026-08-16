# AGENTS.md — PSCV-Lite-Nautic-Module

Guidance for agentic coding agents operating in this repository.

---

## Project Overview

Multi-tier naval vessel maintenance management system ("rondas de mantenimiento"):

- **`frontend/`** — React 18 SPA (Create React App + CRACO, plain JavaScript, no TypeScript)
- **`api/`** — Django app (models, views, URLs, serializers)
- **`backend/`** — Django project config (settings, wsgi/asgi, Dockerfile)
- **`chatbot/`** — AI microservice (n8n + Qdrant + Ollama + Python translator, Docker Compose)
- **`manage.py`** — Root Django entry point
- **`requirements.txt`** — Python dependencies

---

## Build / Run Commands

### Frontend (run from `frontend/`)

```bash
npm start          # Dev server on port 3000 (CRACO)
npm run build      # Production build
```

### Backend (run from project root)

```bash
python manage.py runserver          # Dev server on port 8000
python manage.py migrate            # Apply migrations
python manage.py makemigrations     # Generate migration files
python manage.py shell              # Django interactive shell
```

### Chatbot infrastructure (run from `chatbot/`)

```bash
docker compose up    # Start Postgres, n8n, Qdrant, Ollama, translator
docker compose down  # Stop all services
```

---

## Test Commands

### Frontend (Jest via CRACO)

```bash
# Run all tests (interactive watch mode)
npm test

# Run all tests once (CI mode)
npm test -- --watchAll=false

# Run a single test file by filename pattern
npm test -- --watchAll=false --testPathPattern="ComponentName"

# Run a single test by test name
npm test -- --watchAll=false --testNamePattern="test description here"
```

Testing libraries: `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`.

### Backend (Django)

```bash
# Run all backend tests
python manage.py test

# Run tests for the api app
python manage.py test api

# Run a specific test class
python manage.py test api.tests.SomeTestClass

# Run a specific test method
python manage.py test api.tests.SomeTestClass.test_method_name
```

> Note: `api/tests.py` is currently a stub — no backend tests are implemented yet.

---

## Lint / Format

- **ESLint**: Configured via `"eslintConfig"` in `frontend/package.json`; extends `react-app` and `react-app/jest` (default CRA config, no custom rules).
- **No Prettier** and no `.editorconfig` — formatting is not automated.
- **No dedicated lint script** in `package.json`; ESLint runs implicitly during `npm start` / `npm run build`.

Follow the existing code style manually (see guidelines below).

---

## Code Style Guidelines

### JavaScript / React (Frontend)

**Language**
- Plain JavaScript (`.js` / `.jsx`) — no TypeScript, no JSDoc type annotations.
- Runtime guards use `typeof`, `Array.isArray()`, `parseInt(k, 10)`, etc.

**Formatting**
- **Single quotes** for all JS strings.
- **2-space indentation**.
- **Semicolons** at end of every statement.
- Multi-line JSX uses consistent 2-space indentation with each prop on its own line when wrapping.

**Imports order** (follow this order within each file):
1. React and hooks: `import React, { useState, useEffect } from 'react';`
2. React Router: `import { useParams, useNavigate } from 'react-router-dom';`
3. Third-party libraries (axios instance, Swal, chart.js, etc.)
4. Local components and services
5. CSS: `import './ComponentName.css';`

**Naming conventions**
- React components: **PascalCase** (`RondaEquipo`, `BuqueForm`)
- Component files: **PascalCase** matching the component name (`RondaEquipo.js`)
- Functions and variables: **camelCase** (`loadLang`, `handleSubmit`, `buqueId`)
- CSS class names: **kebab-case** (`.ronda-card`, `.param-grid`)
- Top-level string constants: **SCREAMING_SNAKE_CASE** (`LANG_KEY`, `SS_KEYS`)

**React patterns**
- Functional components only — no class components.
- Hooks: `useState`, `useEffect`, `useMemo`, `useRef` are the standard set.
- Clean up effects: always return a cleanup function from `useEffect` when using `setInterval` or `addEventListener`.
- File uploads use `FormData`.
- Navigation uses `useNavigate`; route params use `useParams`.

**i18n pattern** (used in every component)
```js
const i18n = {
  es: { label: 'Etiqueta' },
  en: { label: 'Label' },
};
const loadLang = () => localStorage.getItem(LANG_KEY) || navigator.language?.slice(0,2) || 'es';
const [lang, setLang] = useState(loadLang);
```
Language changes are dispatched via `window.dispatchEvent(new CustomEvent('app:language', ...))`.

**Error handling (frontend)**
- Wrap async calls in `try/catch`; log errors with `console.error()`.
- Surface user-facing errors via `alert()` for simple cases or `Swal.fire()` for richer UX.
- The axios instance in `frontend/src/services/api.js` handles 401 refresh-token retry and cooldown — do not re-implement this logic in components.
- Log API-level messages with the prefix `[API][...]`.

### Python / Django (Backend)

**Formatting**
- Standard Python conventions: **4-space indentation**, single or double quotes (be consistent within a file).
- Snake_case for all functions, variables, and URL names.

**View conventions**
- All views are **function-based views (FBV)** — do not introduce class-based views.
- Decorate every API view with `@api_view(["GET", "POST"])` (or appropriate methods) from DRF.
- Return `Response(data)` with manually constructed Python dicts — the existing codebase does not use DRF serializers for output, even though `serializers.py` exists.

**Naming conventions**
- View functions: `snake_case`, prefixed with domain (e.g., `api_buques`, `api_equipos`, `obtener_parametros`).
- Internal helper functions: prefix with `_` (e.g., `_as_int_or_none`, `_parse_json`).
- Models: **PascalCase** matching domain language (Spanish): `Buque`, `Equipo`, `Ronda`, `Parametro`.

**Database**
- Use Django ORM — `.select_related()`, `.annotate()`, `.filter()` as needed.
- Pagination is manual (offset/limit query params), not DRF's built-in pagination.
- PostgreSQL-specific features are acceptable: `GinIndex`, `JSONField`.

**Error handling (backend)**
- Use `get_object_or_404()` for not-found cases.
- Return structured error responses: `Response({"error": "..."}, status=400)`.
- Helper functions that parse optional parameters should catch exceptions and return `None` silently (see `_as_int_or_none` pattern in `api/views.py`).
- Use `try/except Exception` for file/IO operations; log failures rather than crashing.

---

## Architecture Notes

- The frontend communicates with the backend exclusively through the shared axios instance at `frontend/src/services/api.js`. Do not create additional axios instances in components.
- The backend exposes REST endpoints under `/api/`; the frontend config (`frontend/src/config.js`) defines `API_BASE`.
- The chatbot service communicates with Django via webhooks (`requests.post()` to n8n from `api/views.py`).
- Domain language is Spanish (model names, URL paths, variable names in business logic); UI supports both `es` and `en` via the i18n pattern.

---

## Key Files

| File | Purpose |
|---|---|
| `frontend/src/services/api.js` | Axios instance, interceptors, all API call functions |
| `frontend/src/config.js` | `API_BASE` and other frontend constants |
| `frontend/src/App.js` | Top-level routing and layout |
| `api/models.py` | All Django ORM models |
| `api/views.py` | All backend API views (~1400+ lines) |
| `api/urls.py` | URL routing for the api app |
| `backend/settings.py` | Django project settings (DB, installed apps, CORS, JWT) |
| `requirements.txt` | Python dependencies |
| `frontend/package.json` | JS dependencies and ESLint config |
| `chatbot/docker-compose.yml` | AI infrastructure services |
