# Feature: tipos-buque
Objective: in the vessel form, replace the free-text "Tipo" with a grid of defined naval vessel types. Each card shows a slowly rotating 3D thumbnail of that type with its name under it.
Branch: `feat/tipos-buque` (stacked on `feat/casco-3d-integrado`, which holds the 3D hull code). Runner: Vitest.

## Specs
- **S1** — The user asked: "para la vista de creacion del buque se cambie el campo de escritura libre por unas cuadriculas que tengan tipos de embarcaciones definidos".
  - The catalogue, chosen by the user on 2026-11-18 ("Navales"): Fragata, Corbeta, Patrullera, Destructor, Buque anfibio, Buque logístico.
  - The backend keeps `tipo` as text. The form sends the type name.
  - The grid is a radio group, so it can be used with the keyboard.
- **S2** — The user asked: "en ella aparezcan renderizados en miniatura de ese tipo debajo aparezca el nombre del mismo".
  - Each type has its own code-generated `Arquetipo`.
  - Each card shows that hull as a thumbnail, with the name under it.
- **S3** — The user asked: "me gustaria que el modelo 3d en miniatura este girando levemente".
  - The thumbnail turns slowly.
  - It stays still under `prefers-reduced-motion`.
  - Without WebGL, the side silhouette is shown instead.
- **S4** (implied by S2):
  - The 3D hull of the inspections page uses the archetype of the vessel's type.
  - An unknown or legacy free-text type falls back to the generic warship.
  - The edit form shows a legacy type that is not in the catalogue, and does not lose it.

## Tasks
- [x] T1 — S1, S2, S4 domain: archetypes per type, the `TIPOS_BUQUE` catalogue, and type matching, with tests. Route: inline.
- [x] T2 — S1-S3 UI: `SelectorTipoBuque` grid plus `MiniaturaCasco` (lazy WebGL, rotating), in the create and edit forms. Route: inline.
- [x] T3 — S4: the inspections 3D view uses the type's archetype; docs. Route: inline.

## Log
- L1 (2026-11-18): "me gustaria que para la vista de creacion del buque se cambie el campo de escritura libre por unas cuadriculas que tengan tipos de embarcaciones definidos, en ella aparezcan renderizados en miniatura de ese tipo debajo aparezca el nombre del mismo, ademas me gustaria que el modelo 3d en miniatura este girando levemente"
- L2 (2026-11-18): the catalogue answer was "Navales (Recomendado)": Fragata, Corbeta, Patrullera, Destructor, Buque anfibio, Buque logístico.
- L3: T1 GREEN.
  - Six archetypes in `arquetipo.ts`. `tiposBuque.ts` has the catalogue and matches type names ignoring case and accents.
  - Each archetype builds a valid hull (23 zones, thirds, L x B box).
  - RED was the missing module. Commit f005de5.
- L4: T2 GREEN.
  - `buques/ui/tipo/SelectorTipoBuque`: a radio group of cards. A legacy type is named and kept until another one is chosen.
  - `MiniaturaCasco` is a lazy `LienzoMiniatura` that turns once every ~20 s and stays still under reduced motion. Without WebGL, or if the canvas fails, it shows the silhouette.
  - `geometriaDe` moved to `casco/geometriaThree.ts`, and `LimiteDelLienzo` is now exported. Both are shared, not duplicated.
  - Also fixed the lint warning about reading a ref during render in the hover label.
  - RED first: 13 failing. Now 162 tests pass (`buques`, `ui/casco`, `VistaCascoBuque`), lint is clean, and the build passes with no `WebGLRenderer` in the entry chunk.
  - Thumbnails and rotation need WebGL and are checked by hand.
- L5: T3 GREEN.
  - `VistaCascoBuque` shapes the hull with `arquetipoDeBuque(buque.tipo)`.
  - RED first (1 failing). Now 48 tests pass, lint is clean, and the build passes with three.js out of the entry chunk.
  - Docs are in AGENTS.md.
  - Pending: the visual check in a WebGL browser (thumbnails, rotation, hull per type).
- L6 (2026-11-18): the user said: "no me gusta la idea de colocar los cuadros con el renderizado, mas bien coloca unicamente la lista de los tipos para seleccionar y reservamos el renderizado en si para la zona de inspecciones como ya se venia tratando"
  - S2 and S3 are dropped: there are no thumbnails and no rotation.
  - S1 is now a `<select>` "Tipo" with the catalogue. A legacy type shows as "<tipo> (fuera del catálogo)".
  - Removed: `buques/ui/tipo/` (the grid and thumbnails) and `geometriaThree.ts`, which moved back into `LienzoCasco`. The `LimiteDelLienzo` export is reverted.
  - The catalogue and the per-type archetypes stay for the inspections 3D view (S4).
  - Evidence: RED first (12 failing). Now 163 tests pass, lint is clean, and the build passes with no three.js in the entry chunk.
