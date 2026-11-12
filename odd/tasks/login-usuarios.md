# Feature: login-usuarios

Objective: user accounts with session login, inspection leaders who invite members with roles, and public-read / private inspections.
Branch: `feat/login-usuarios` (stacked on `feat/detecciones-normalizadas`, PR #2) · Delivery: chained PR after #2 · Runners: `uv run python manage.py test`, `pnpm test`.

## Specs

- S1 — Custom user model `Usuario` (new app `cuentas`): login by email, `nombre`, `cargo`, password hash, `is_active`, `is_staff`, `fecha_registro`. `AUTH_USER_MODEL = "cuentas.Usuario"`; the dev DB is recreated ("si tocara reconstruir todo no habria ningun probelma").
- S2 — Session-cookie auth (not JWT: `EventSource` cannot send headers). Endpoints: CSRF cookie, login (email + password), logout, current user. The frontend sends `X-CSRFToken` on unsafe methods and redirects to the login on 401/403.
- S2b — "Registro abierto: cualquiera se registra desde la pantalla de login.": `POST /api/auth/registro/` (email, password, nombre, cargo?) creates the account and opens the session; duplicate email (case-insensitive), invalid email, Django password validators and blank name return 400 `campos`. Login and registration are throttled per IP.
- S3 — `InspeccionCasco.lider` (FK, the creator) and `privada` (default false). "visible para todos en modo lectura"; only the leader ("al líder de esa inspección") makes it private.
- S4 — `InspeccionMiembro` (inspeccion, usuario, rol, puede_subir_fotos, puede_analizar, puede_editar_reporte, puede_editar_inspeccion, agregado_por, fecha; unique (inspeccion, usuario)). The leader invites, removes and sets roles/permissions ("quien crea la inspeccion pueda ser capaz de inlcuir a otros usuarios y sea capaz de otorgarle permisos"). Role templates: Colaborador = all four ("quiero q el colaborador tenga permiso de todo"); Revisor = editar_reporte; Observador = none.
- S5 — Enforcement on every endpoint: read = not private, or leader, or member (or superuser — assumption); subir_fotos = upload/delete photo; analizar = analyze/retry; editar_reporte = report PATCH; editar_inspeccion = rename/description PATCH; leader only = delete, privacy, members, leadership transfer. Lists and search hide private inspections the user cannot read. Every API requires login.
- S6 — Traceability FKs: `FotoInspeccion.subida_por`, `DeteccionFoto.validado_por`, `ReporteInspeccion.revisado_por`, `Buque.creado_por` (nullable for old rows).
- S7 — Frontend: login screen, session state, logout, members management and privacy toggle for the leader, actions hidden/disabled per permission.
- Assumptions (open): `tomado_por` is kept as free text, prefilled with the leader's name; a Django superuser can read private inspections for support. Accounts: open self-registration (L9).

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1, S2 (backend) | inline | done | RED: User() got unexpected kwargs nombre/cargo; GREEN: cuentas 10/10, suite 272 OK |
| T2 | S3-S5 | inline | done | RED: ImportError InspeccionMiembro; GREEN: test_permisos 15/15, suite 292 OK |
| T3 | S6 | inline | pending | — |
| T4 | S2 (frontend), S7 | inline | pending | — |
| T5 | docs, dev DB reset | inline | pending | — |

## Log

- L1 (2026-11-11, user): "mira, mi intencion es hacer un login pero me gustaria saber como se relacionaria el usurio con lo que se tiene en la base de datos"
- L2 (user): "la idea es que para el tema de permisos entre usuarios es que el que crea la inspeccion seria el "lider" de esa inspeccion"
- L3 (user): "la itencion es quien crea la inspeccion pueda ser capaz de inlcuir a otros usuarios y sea capaz de otorgarle permisos q sean necearios para cada uno"
- L4 (user): "queremos que el diseño sea visible para todos en modo lectura pero que administrador aun asi tenga la opcion de colocar esa inspeccion privada, peero en general si no tiene esa opcion q sea modo lectura para todo el mundo y que ya el admin del inspector sea quien invite a personas a esa inspeccion y le coloque los roles a esas personas" — clarified: "al líder de esa inspección".
- L5 (user): "quiero q el colaborador tenga permiso de todo y q el revisor pues se quede con el q dejaste"
- L6 (user): "abre el PR de detecciones y luego empieza el login"
- L7: Risk: item 2 (auth, permissions), item 1 (custom user model needs a DB reset), item 3 (every API starts requiring login).
- L8: T1 done: app `cuentas` (`Usuario`, emails stored lowercase), `AUTH_USER_MODEL`, DRF `SessionAuthentication`, `/api/auth/csrf|login|logout|yo/`; login enforces CSRF explicitly (DRF skips it for anonymous requests). The dev DB now fails `makemigrations --check` with InconsistentMigrationHistory (admin.0001 before cuentas.0001): needs the T5 reset. Permissions still AllowAny until T2.
- L9 (2026-11-11, user): "Registro abierto: cualquiera se registra desde la pantalla de login."
- L10: registration done: `POST /api/auth/registro/` (CSRF, case-insensitive unique email, Django password validators added to settings — there were none, nombre required, privileges never taken from the request), per-IP throttle `cuentas` 10/min on login and registration (custom SimpleRateThrottle: ScopedRateThrottle passes everything when the view has no `throttle_scope`). Suite 277 OK.
- L11: T2 done: `lider`/`privada` + `InspeccionMiembro` (migration 0013, generated with `DB_PORT=1` because the dev DB history is inconsistent until T5), `vision/permisos.py` (`exigir`, `visibles_para`, `permisos_de`), `views_miembros.py` (list/invite/patch/remove, roles derive `personalizado` when adjusted), leadership transfer via PATCH `lider_id` (previous leader stays as Colaborador), `mis_permisos` in detail/create responses, every endpoint requires a session (`cuentas.autenticacion.Sesion` answers 401), stream checks session + visibility. Unreadable -> 404, readable without permission -> 403. Assumption applied: any signed-in user manages vessels. Legacy tests authenticate as superuser (`cliente_admin`); passwordless test users keep the suite fast (10 s).
