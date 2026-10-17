# Feature: frontend-react
Objective: TypeScript + React frontend in `frontend/`, inspired (not copied) by the `frontend/interfaz/` mockups, wired to the existing vision API.
Branch: `feat/frontend-react` · Delivery: `ask-on-risk` · Test runner: Vitest + Testing Library (`npm test` in `frontend/`), TDD (RED → GREEN → refactor).

## Specs

- S1. "en @frontend/interfaz\ se enuentra la idea de interfaz que se piensa implementar para este proyecto, la idea es que viva en ese directorio de frontend" — the app lives in `frontend/`.
- S2. "ese interfaz solamente es una idea por lo que no lo deberias usarr para nada oficial para el frontend nativo de este proyecto" — mockups are visual reference only; no mockup HTML is copied or shipped; `frontend/interfaz/` stays untouched.
- S3. "me gustariia que me ayudaras a generarlo con typescript y react" — TypeScript + React.
- S4. "hgaamos lo que propones y activa el tdd" — proposed stack: Vite + React + TypeScript + Tailwind. TDD: every behavior gets a failing test first.
- S5. (proposal accepted in S4) Connect to the real backend where endpoints exist: `/api/vision/secciones/`, `/api/vision/inspecciones/` (GET/POST), `/api/vision/inspecciones/<id>/` (GET/DELETE), `/api/vision/inspecciones/<id>/fotos/` (POST multipart), `/api/vision/inspecciones/<id>/analizar/` (POST), `/api/vision/fotos/<id>/` (POST retry, DELETE), SSE `/api/vision/inspecciones/<id>/stream/` via `EventSource` (no polling).
- S6. (proposal accepted in S4) Buques have no backend CRUD: served by an in-memory adapter behind a port, replaceable later.
- S7. Screens from the mockups: inspection list, new inspection, zone upload, analysis results; light and dark theme.
- Assumption A1: UI copy in Spanish, because domain language and backend error messages are Spanish (AGENTS.md: "the future frontend decides its own i18n").

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1 S3 S4 | inline | done (RED→GREEN: theme, layout) | 935ce49 |
| T2 | S5 S6 | inline | done (RED→GREEN: rules, HTTP, SSE, buques) | 0bbc07a |
| T3 | S5 S7 | inline | done (RED→GREEN: 11 page tests) | c24bdab |
| T4 | S5 S6 S7 | inline | done (RED→GREEN: 6 form tests) | 77a6ed9 |
| T5 | S5 S7 | inline | done (RED→GREEN: 12 page tests) | 71a3d0a |
| T6 | S5 S7 | inline | done (RED→GREEN: 6 page tests) | 8e4719f |
| T7 | S1 | inline | done (docs; documented commands run) | (this commit) |

- T1: scaffold (Vite, TS strict, Tailwind design tokens light/dark, Vitest, router shell, theme toggle).
- T2: domain types + pure rules, repository ports, HTTP adapter, SSE adapter, in-memory buques.
- T3: inspection list (search, delete, navigate).
- T4: new inspection form.
- T5: zone upload (sections grid, upload, queue, SSE live state, start analysis).
- T6: analysis results (original/annotated toggle, detections, severity).
- T7: docs (`frontend/README.md`, AGENTS.md frontend section).

Route evidence: no Writer trigger (units share infra and are sequential); all inline.

## Log

- L1 (2026-10-17, user): "bueno mira, en @frontend/interfaz\ se enuentra la idea de interfaz que se piensa implementar para este proyecto, la idea es que viva en ese directorio de frontend, para aclarar, ese interfaz solamente es una idea por lo que no lo deberias usarr para nada oficial para el frontend nativo de este proyecto, me gustariia que me ayudaras a generarlo con typescript y react"
- L2 (2026-10-17, user): "hgaamos lo que propones y activa el tdd"
- L3: Backend gotcha: SSE `foto-updated` sends `imagen_anotada` as a raw relative path (`media/...`), while REST returns absolute URLs. Frontend must normalize.
- L4: Repo convention: npm + package-lock (pnpm ignored in .gitignore).
- L5: T1 review assess: medium (configuration_change `.env.example`), review_due=false `under_budget`; pending in slice.
- L6: `.env*` edits are blocked by a permission rule; `.env.example` keeps `VITE_API_BASE_URL=http://localhost:8000`. Vite also proxies `/api` and `/media` to :8000 for an empty base URL.
- L7: Composition root split (`composicion.ts`, `useDependencias.ts`, `DependenciasProvider.tsx`) to satisfy oxlint `only-export-components`.
- L8: Checks at T6: 72 tests, `tsc -b`, oxlint, `vite build` green. Dev-server smoke: app served on Vite; backend not running locally, so no end-to-end run against the real API (proxy returned 502).
- L9: Every slice assessment so far: medium, `under_budget`.
