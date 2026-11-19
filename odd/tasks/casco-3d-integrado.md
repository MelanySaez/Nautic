# Feature: casco-3d-integrado
Objective: bring the 3D hull view (`feat/casco-3d-*` chain) into the vessel's inspections page as a list/3D switch, with a two-option menu per zone.
Branch: `feat/casco-3d-integrado` (from `main`, merges `feat/casco-3d-05-lienzo`). Runners: Django `manage.py test`, Vitest.

## Specs
- **S1** — "integrar esta idea que viene de las ramas que tratan el modelado 3d dentro de la vista de inspecciones asociadas a una embarcación", "de modo que tenga una opcion que me permita cambiar al modelado 3d segun requiera".
  - `/inspecciones/buque/:id` gets a "Lista" / "3D" switch kept in the URL (`?vista=3d`); the separate `/inspecciones/buque/:id/casco` page goes away.
- **S2** — "al seleccionar una seccion concreta de ese modelo permita desplegar un menu de 2 opciones".
- **S3** — "una que permita ir a generar una inspeccion nueva (obviamente siendo ya un atajo a la seccion de casco particular que ya se seleccionó)".
  - Links to `/vision?buque=<id>&zona=<seccionId>`, which already preselects vessel and zone.
- **S4** — "otra opcion que me permita ver las inspecciones directas ya existentes con el filtro aplicado de la seccion particular".
  - Switches to the list with `?seccion=<seccionId>`: only inspections with at least one photo in that section.
  - Backend: new search filter `seccion` in `FILTROS`.
  - The list shows the active section filter and lets the user remove it.
- **S5** — Zone colours: user choice (2026-11-18): "Última inspección". Each zone shows its worst finding in the most recent inspection. No inspection selector.

## Tasks
- [x] T1 — S4 backend: `seccion` filter + tests + docs. Route: inline.
- [x] T2 — S1–S5 frontend: switch, embedded 3D view, two-option zone menu, section filter in the list. Route: inline.

## Log
- L1 (2026-11-18): "necesito entonces integrar esta idea que viene de las ramas que tratan el modelado 3d dentro de la vista de inspecciones asociadas a una embarcación [Image #1], de modo que tenga una opcion que me permita cambiar al modelado 3d segun requiera, la intencion seria que al seleccionar una seccion concreta de ese modelo permita desplegar un menu de 2 opciones, una que permita ir a generar una inspeccion nueva (obviamente siendo ya un atajo a la seccion de casco particular que ya se seleccionó) y otra opcion que me permita ver las inspecciones directas ya existentes  con el filtro aplicado de la seccion particular"
- L2 (2026-11-18): colour rule answer: "Última inspección (Recomendado)".
- L3: the merge of `feat/casco-3d-05-lienzo` had a conflict only in `AGENTS.md`, resolved by keeping both sides.
- L4: T1 GREEN: `test_busqueda_inspecciones` OK (RED first: 3 failures). Commit e1f8447.
- L5: T2 GREEN: Vitest `VistaCascoBuque`, `ListaInspeccionesPage`, `HttpInspeccionesRepository`, the router tests and `ui/casco` all pass (RED first: 13 failures). `pnpm lint` passes. `pnpm build` passes, and the entry chunk has no `WebGLRenderer`. The `/casco` route and `SelectorInspeccion` are removed. Pending: a manual check in a WebGL browser.
- L6 (2026-11-18): the Gentle AI review was approved, with advisory findings. The user said: "adelante con las correcciones". The fixes:
  - `useBusquedaInspecciones` compares the filter by content and takes `activa`, so the list does not search while 3D is shown;
  - the vessel error in 3D offers "Reintentar";
  - the switch is driven by a `vista3d` flag, not by its label;
  - the switch and section-chip tests moved to `ListaInspeccionesPage.test.tsx`;
  - a filter round-trip test was added.

  The retry and hidden-search tests failed before the fix (RED) and pass now.
