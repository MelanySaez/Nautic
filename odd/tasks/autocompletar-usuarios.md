# Autocompletar usuarios al invitar

Objective: suggest registered users while typing who to invite to an inspection (Gmail-like). Branch `feat/autocompletar-usuarios`.
Delivery: two work-unit commits (backend, frontend); PRs decided by the user. Runners: `uv run python manage.py test <module>`, `pnpm vitest run <file>`.

## Specs

- S1 — Where: "en la parte en la que la que agregamos a personas con permisos sobre nuestra inspeccion tengamos un sistema que nos permita ir viendo los resultados posibles de los usuarios que estan inscritos en la app, como un sistema parecido al que se implementa el escribir el correo al que enviarias en software como gmail". Applies to both invite places: the new-inspection "Acceso y equipo" rows and the results page "Invitar miembro" form.
- S2 — Scope (user choice, L2): "Todos los usuarios": searches every active account, from 2 characters, at most 8 results, rate limited.
- S3 — Privacy (user choice, L3): "Nombre y cargo, sin correo": search by name only, suggestions show name and cargo, never the email; picking someone invites by id; typing a full email still invites as today.
- S4 — Backend search: `GET /api/auth/usuarios/?q=` (session required). `q` stripped, 2-100 chars, else 400 `campos.q`. Matches active users whose `nombre` contains `q` (case-insensitive), excluding the requester; never matches on email. Ordered by `nombre, id`, limit 8. Returns `{resultados: [{id, nombre, cargo}]}`. Per-user throttle (scope `busqueda_usuarios`).
- S5 — Backend invite by id: an invitation (`POST .../miembros/` and `miembros` on create) takes exactly one of `email` or `usuario_id`. Errors for the id go under `usuario_id`; both or neither → 400. Same rules otherwise (active, not leader, not already member).
- S6 — Frontend: a combobox field (`role=combobox`, listbox of options "nombre · cargo", arrows/Enter/Escape) debounced, min 2 chars, no search when the text contains "@"; picking a suggestion selects the user; editing the text clears it. Stale responses are dropped. Server errors (`email` or `usuario_id`) show on the row/field.
- S7 — No results (user, L6): "sí, agrega el aviso de sin resultados": when the search for the current text returns nobody, a status notice says "Nadie coincide con «<texto>». Escribe su email completo; si aún no tiene cuenta, debe registrarse primero."

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S2-S5 | inline | done (RED 10 → GREEN, 59 tests) | 787159f |
| T2 | S1, S3, S6 | inline | done (RED 11 → GREEN, 268 tests; tsc, oxlint clean) | 32d742e |
| T3 | S7 | inline | done (RED 1 → GREEN) | (this commit) |

Route evidence: no writer trigger (T2 depends on T1's contract; single session). Risk: item 2 (new endpoint exposing the user directory) → one independent verifier at the end.

## Log

- L1 (2026-11-20, user): "quiero que trabajemos ahora sobre una rama para que en la parte en la que la que agregamos a personas con permisos sobre nuestra inspeccion tengamos un sistema que nos permita ir viendo los resultados posibles de los usuarios que estan inscritos en la app, como un sistema parecido al que se implementa el escribir el correo al que enviarias en software como gmail"
- L2 (2026-11-20, user answer): scope = "Todos los usuarios (Recommended)".
- L3 (2026-11-20, user answer): after being told commit 894ded8 made other users' emails private → "Nombre y cargo, sin correo (Recommended)".
- L4 (2026-11-20, assumption): a typed text that is neither a picked user nor an email is rejected on the client with "Elige a alguien de la lista o escribe su email completo." instead of reaching the server's misleading "no account with this email".
- L5 (2026-11-20, verification): independent verifier PASS on S1-S6, no blockers. Native review (reliability lens) approved and acknowledged. Follow-up commit: invite schema lists `usuario_id`, a misplaced dtos comment is moved back, and the `usuario_id` 0 / 2**70 cases are pinned. The reviewer warned they could answer 500; they already answer 400.
- L6 (2026-11-20, user): "sí, agrega el aviso de sin resultados". Also documented in the invite schema that exactly one of email/usuario_id is required (review suggestion R3-001).
