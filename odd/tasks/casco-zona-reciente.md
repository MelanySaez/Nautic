# Feature: casco-zona-reciente

Objective: the 3D hull colours each zone with the most recent inspection that has photos of that zone, instead of using only the vessel's latest inspection.
Branch: `feat/casco-zona-reciente` (from `main` 457637d) · Delivery: single PR · Runners: `uv run python manage.py test`, `pnpm test`.

## Specs

- S1 — "la opción 1, la más reciente de cada zona": for every section of the vessel, the zone state comes from the **most recent inspection that has at least one photo in that section** (most recent = `fecha_creacion` desc, then `id` desc), read with the existing per-zone rule (`resumirZonas`: completed photos only, findings are anomalies not discarded). A section no readable inspection photographed is `sin-fotos`.
- S2 — Only inspections the user may read count (`vision.permisos.visibles_para`): a private inspection never colours a zone for someone who cannot see it.
- S3 — Backend: `GET /api/buques/<id>/zonas/` (session required; 404 for a missing vessel) returns `{"zonas": [{"seccion_id", "inspeccion": {"id", "nombre", "fecha_creacion"}, "fotos": [photo dicts]}]}` — one entry per section that has a readable photographed inspection, `fotos` = that inspection's photos of that section (same photo dict as the inspection detail, detections prefetched, no N+1). Resolved in the database (latest inspection per section via a subquery), not by scanning every photo of the vessel in Python.
- S4 — Frontend: `VistaCascoBuque` uses this endpoint; each zone keeps its state, photo count and name, and the selected zone's panel/hover shows **which inspection** its colour comes from (name). The header text "Colores según la última inspección: …" becomes a per-zone explanation (e.g. "Cada zona muestra su inspección más reciente"). Actions that opened "the" latest inspection open the zone's own inspection.
- S5 — Live updates stay event-driven (no polling): keep following the vessel's latest inspection through the existing SSE hook and reload the zones when its photos change.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T0 | — | inline | done | b7843bc: 3D hull tests aligned with standard-only sections (15 failing on main → 13/13; suite 444/444) |
| T1 | S1-S5 | delegated (context backstop) | done | backend 380 OK (test_zonas_buque 10 RED→GREEN); frontend 448/448, lint clean, build OK |

## Log

- L1 (2026-11-21, user): "respecto al modelo 3d, solo muestra el color de la ultima inspeccion q se hizo? pensaba q mostraba varias simultaneamente"
- L2 (2026-11-21, user): "la opción 1, la más reciente de cada zona"
- L3: the 15 `VistaCascoBuque` tests failed on main since 8416b2c (fixture had a custom section, which now disables the 3D view); fixed first in b7843bc so the feature can be built test-first. Risk: item 2 (data visibility across inspections), item 3 (new endpoint).
- 2026-11-21 T1 (writer): `GET /api/buques/<id>/zonas/` in `views_buques.api_buque_zonas` (correlated Subquery, 3 queries, reuses `views._foto_to_dict`); port method `InspeccionesRepository.zonasRecientes` (photos are inspection data and reuse `aFoto`); `VistaCascoBuque` colours each zone from its own inspection, panel "Según la inspección …" + "Abrir inspección", hover `inspeccionesZona`; live reload on SSE events of the latest inspection via the `EventosInspeccion` port. Next: parent review and commit.
- L5: gentle-ai review (risk, reliability) of b7843bc..d8d2c60 approved and acknowledged. Pinned that a live reload keeps the previous zones visible (no 'Cargando zonas…'). Accepted trade-off: only the vessel's latest inspection is followed live; zones coloured by an older inspection refresh when the view remounts.
