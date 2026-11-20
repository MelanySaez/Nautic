/**
 * Hull archetype: every shape parameter the code-generated hull needs. A vessel type catalogue
 * only adds more `Arquetipo` values; the generator never hardcodes a hull form.
 *
 * Conventions: `t` runs along the length from the stern (0) to the bow (1). L, B, D and T are the
 * length (eslora), beam (manga), depth (puntal) and draft (calado) in meters. A "half-beam" is the
 * local half-width of the hull at a given `t`.
 */

/**
 * A decorative superstructure piece, described in hull units so it scales with the vessel.
 * Heights (`base`, `alto`) are multiples of D measured from the main deck; widths are multiples
 * of B. Pieces are never clickable.
 */
export type PiezaDecorativa =
  | {
      forma: 'caja'
      /** Lengthwise extent, as `t` values. */
      desde: number
      hasta: number
      /** Bottom face above the main deck, × D. */
      base: number
      /** Height, × D. */
      alto: number
      /** Full width, × B. */
      ancho: number
    }
  | {
      /** A vertical, possibly tapered cylinder (mast, gun mount). */
      forma: 'cilindro'
      t: number
      base: number
      alto: number
      /** Radius at the base and at the top, × B. */
      radio: number
      radioSuperior: number
    }

/** Shafts, brackets, propellers and rudders: the `PROP` zone. */
export interface Propulsion {
  /** Number of shafts, each with its bracket and propeller. */
  ejes: number
  /** Transverse offset of the outermost shaft, × the half-beam at the propeller. */
  separacionEjes: number
  /** Propeller plane, as `t`. */
  tHelice: number
  /** Propeller radius, × T. */
  radioHelice: number
  /** Shaft axis height above the baseline, × T. */
  alturaEje: number
  palas: number
  /** Shaft bracket distance forward of the propeller, × L. */
  arbotante: number
  /** Number of rudders. */
  timones: number
  /** Transverse offset of the outermost rudder, × the half-beam at the propeller. */
  separacionTimones: number
  /** Rudder centre, as `t`. */
  tTimon: number
  /** Rudder chord, × L. */
  cuerdaTimon: number
}

/** A symmetric pair of sea-chest grilles under the bottom: the `SEA-CHEST` zone. */
export interface TomasDeMar {
  /** Lengthwise position, as `t`. */
  t: number
  /** Transverse offset of each grille, × the local half-beam. */
  separacion: number
  /** Grille length, × L. */
  largo: number
  /** Grille width, × B. */
  ancho: number
}

export interface Arquetipo {
  /** Stable identifier, for a future type catalogue. */
  id: string
  /** Ratios used when the technical sheet lacks a measure: B/L, D/B and T/D. */
  proporciones: { mangaEslora: number; puntalManga: number; caladoPuntal: number }
  /** Length (m) used when neither the length nor the beam are known. */
  esloraPorDefecto: number
  /**
   * Section fullness at the stern, amidships and at the bow. The frame is a superellipse with
   * exponent e = 2 / plenitud: 1 is a V, 2 an ellipse, larger values a boxier section.
   */
  plenitud: { popa: number; centro: number; proa: number }
  /** Full beam (parallel middle body) between these `t`; fullness blends outside them. */
  mangaPlena: { desde: number; hasta: number }
  /** Transom half-width, × the full half-beam. */
  espejo: number
  /** Exponent of the waterline taper toward the bow: lower values give a finer entry. */
  afinamientoProa: number
  /** Rise of the bottom (keel line) above the baseline. */
  fondo: {
    /** Rise at the transom, × T, fading out at `hastaPopa`. */
    elevacionPopa: number
    hastaPopa: number
    /** Forefoot rise at the stem, × D, starting at `desdeProa`. */
    elevacionProa: number
    desdeProa: number
    exponenteProa: number
  }
  /** Sheer: the deck height rises from `desde` to `elevacionProa` × D at the stem. */
  cubierta: { elevacionProa: number; desde: number }
  /**
   * Stem rake: the stem foot sits `lanzamiento` × L aft of the stem head. The rake starts at
   * `desde`, which the generator keeps above 2/3 so the thirds stay planar.
   */
  roda: { lanzamiento: number; desde: number }
  /** Vertical band limits along each frame (see `alturasDeBandas` in `zonas.ts`). */
  bandas: {
    /** Keel strip, as a fraction of the bottom band girth on each side. */
    quilla: number
    /** Top of the bottom band, × the frame height (keel line to deck). */
    fondo: number
    /** Top of the bilge band, × the frame height. */
    pantoque: number
    /** Half-height of the waterline band around T, × D. */
    flotacion: number
    /** Height of the deck-edge band below the deck, × D. */
    cinta: number
  }
  superestructura: readonly PiezaDecorativa[]
  propulsion: Propulsion
  tomasDeMar: TomasDeMar
}

/**
 * Generic steel warship (frigate or patrol vessel): fine hull, sharp raked bow, V bottom
 * forward, transom stern, twin shafts and a central superstructure with bridge, mast and funnel.
 */
export const BUQUE_DE_GUERRA: Arquetipo = {
  id: 'buque-de-guerra',
  proporciones: { mangaEslora: 0.13, puntalManga: 0.62, caladoPuntal: 0.45 },
  esloraPorDefecto: 120,
  plenitud: { popa: 2.6, centro: 3.2, proa: 1.4 },
  mangaPlena: { desde: 0.25, hasta: 0.5 },
  espejo: 0.75,
  afinamientoProa: 1.6,
  fondo: { elevacionPopa: 0.8, hastaPopa: 0.35, elevacionProa: 0.32, desdeProa: 0.84, exponenteProa: 1.6 },
  cubierta: { elevacionProa: 1.12, desde: 0.55 },
  roda: { lanzamiento: 0.035, desde: 0.8 },
  bandas: { quilla: 0.1, fondo: 0.07, pantoque: 0.3, flotacion: 0.05, cinta: 0.1 },
  superestructura: [
    // Hangar and main deckhouse.
    { forma: 'caja', desde: 0.35, hasta: 0.65, base: 0, alto: 0.3, ancho: 0.8 },
    // Upper deckhouse.
    { forma: 'caja', desde: 0.42, hasta: 0.63, base: 0.3, alto: 0.24, ancho: 0.62 },
    // Bridge, with its wings.
    { forma: 'caja', desde: 0.57, hasta: 0.645, base: 0.54, alto: 0.22, ancho: 0.76 },
    // Funnel.
    { forma: 'caja', desde: 0.44, hasta: 0.5, base: 0.54, alto: 0.3, ancho: 0.26 },
    // Mast.
    { forma: 'cilindro', t: 0.54, base: 0.54, alto: 1.15, radio: 0.028, radioSuperior: 0.01 },
    // Forward gun mount and its barrel.
    { forma: 'cilindro', t: 0.78, base: 0, alto: 0.13, radio: 0.05, radioSuperior: 0.04 },
    { forma: 'caja', desde: 0.79, hasta: 0.845, base: 0.06, alto: 0.025, ancho: 0.014 },
  ],
  propulsion: {
    ejes: 2,
    separacionEjes: 0.42,
    tHelice: 0.075,
    radioHelice: 0.24,
    alturaEje: 0.26,
    palas: 5,
    arbotante: 0.03,
    timones: 2,
    separacionTimones: 0.42,
    tTimon: 0.035,
    cuerdaTimon: 0.026,
  },
  tomasDeMar: { t: 0.44, separacion: 0.5, largo: 0.035, ancho: 0.09 },
}

/* ───────────── Naval type catalogue (see `tiposBuque.ts`) ─────────────
 * Each type starts from the generic warship and changes what makes its silhouette recognizable:
 * size, fineness, fullness and superstructure. Values are tuned by eye, not taken from a class. */

/** General-purpose escort: the generic warship itself. */
export const FRAGATA: Arquetipo = { ...BUQUE_DE_GUERRA, id: 'fragata' }

/** Smaller escort: shorter hull, one compact deckhouse block. */
export const CORBETA: Arquetipo = {
  ...BUQUE_DE_GUERRA,
  id: 'corbeta',
  proporciones: { mangaEslora: 0.135, puntalManga: 0.62, caladoPuntal: 0.45 },
  esloraPorDefecto: 90,
  superestructura: [
    { forma: 'caja', desde: 0.4, hasta: 0.66, base: 0, alto: 0.34, ancho: 0.78 },
    { forma: 'caja', desde: 0.58, hasta: 0.66, base: 0.34, alto: 0.22, ancho: 0.8 },
    { forma: 'caja', desde: 0.45, hasta: 0.5, base: 0.34, alto: 0.26, ancho: 0.24 },
    { forma: 'cilindro', t: 0.55, base: 0.34, alto: 1.0, radio: 0.026, radioSuperior: 0.01 },
    { forma: 'cilindro', t: 0.79, base: 0, alto: 0.12, radio: 0.05, radioSuperior: 0.04 },
    { forma: 'caja', desde: 0.8, hasta: 0.85, base: 0.055, alto: 0.024, ancho: 0.014 },
  ],
}

/** Coastal patrol vessel: short and beamy, with a tall deckhouse forward of amidships. */
export const PATRULLERA: Arquetipo = {
  ...BUQUE_DE_GUERRA,
  id: 'patrullera',
  proporciones: { mangaEslora: 0.16, puntalManga: 0.6, caladoPuntal: 0.42 },
  esloraPorDefecto: 60,
  plenitud: { popa: 2.8, centro: 3.4, proa: 1.5 },
  superestructura: [
    { forma: 'caja', desde: 0.45, hasta: 0.7, base: 0, alto: 0.45, ancho: 0.8 },
    { forma: 'caja', desde: 0.62, hasta: 0.7, base: 0.45, alto: 0.25, ancho: 0.86 },
    { forma: 'cilindro', t: 0.6, base: 0.7, alto: 0.9, radio: 0.025, radioSuperior: 0.01 },
    { forma: 'cilindro', t: 0.82, base: 0, alto: 0.1, radio: 0.04, radioSuperior: 0.03 },
  ],
}

/** Large escort: long and fine, with fore and aft blocks, two funnels and two masts. */
export const DESTRUCTOR: Arquetipo = {
  ...BUQUE_DE_GUERRA,
  id: 'destructor',
  proporciones: { mangaEslora: 0.12, puntalManga: 0.64, caladoPuntal: 0.45 },
  esloraPorDefecto: 150,
  plenitud: { popa: 2.6, centro: 3.2, proa: 1.3 },
  superestructura: [
    // Hangar block aft and main block forward.
    { forma: 'caja', desde: 0.28, hasta: 0.45, base: 0, alto: 0.32, ancho: 0.78 },
    { forma: 'caja', desde: 0.45, hasta: 0.72, base: 0, alto: 0.35, ancho: 0.82 },
    { forma: 'caja', desde: 0.62, hasta: 0.71, base: 0.35, alto: 0.3, ancho: 0.8 },
    // Two funnels.
    { forma: 'caja', desde: 0.42, hasta: 0.46, base: 0.32, alto: 0.32, ancho: 0.24 },
    { forma: 'caja', desde: 0.5, hasta: 0.54, base: 0.35, alto: 0.32, ancho: 0.24 },
    // Main and aft masts.
    { forma: 'cilindro', t: 0.6, base: 0.65, alto: 1.1, radio: 0.026, radioSuperior: 0.01 },
    { forma: 'cilindro', t: 0.4, base: 0.32, alto: 0.7, radio: 0.02, radioSuperior: 0.008 },
    // Vertical launch cells and the gun forward.
    { forma: 'caja', desde: 0.74, hasta: 0.79, base: 0, alto: 0.05, ancho: 0.5 },
    { forma: 'cilindro', t: 0.83, base: 0, alto: 0.13, radio: 0.05, radioSuperior: 0.04 },
    { forma: 'caja', desde: 0.84, hasta: 0.89, base: 0.06, alto: 0.025, ancho: 0.014 },
  ],
}

/** Amphibious ship: big, full and high-sided, with a long flat deck and a central island. */
export const BUQUE_ANFIBIO: Arquetipo = {
  ...BUQUE_DE_GUERRA,
  id: 'buque-anfibio',
  proporciones: { mangaEslora: 0.155, puntalManga: 0.85, caladoPuntal: 0.35 },
  esloraPorDefecto: 180,
  plenitud: { popa: 3.2, centro: 4.5, proa: 1.8 },
  mangaPlena: { desde: 0.2, hasta: 0.62 },
  espejo: 0.9,
  afinamientoProa: 1.9,
  cubierta: { elevacionProa: 1.06, desde: 0.6 },
  superestructura: [
    { forma: 'caja', desde: 0.45, hasta: 0.65, base: 0, alto: 0.32, ancho: 0.3 },
    { forma: 'caja', desde: 0.55, hasta: 0.64, base: 0.32, alto: 0.2, ancho: 0.34 },
    { forma: 'cilindro', t: 0.56, base: 0.52, alto: 0.6, radio: 0.02, radioSuperior: 0.008 },
  ],
}

/** Replenishment ship: full merchant-like hull, superstructure aft, kingposts amidships. */
export const BUQUE_LOGISTICO: Arquetipo = {
  ...BUQUE_DE_GUERRA,
  id: 'buque-logistico',
  proporciones: { mangaEslora: 0.145, puntalManga: 0.6, caladoPuntal: 0.55 },
  esloraPorDefecto: 170,
  plenitud: { popa: 3, centro: 5, proa: 2 },
  mangaPlena: { desde: 0.25, hasta: 0.6 },
  espejo: 0.82,
  afinamientoProa: 2,
  fondo: { ...BUQUE_DE_GUERRA.fondo, elevacionPopa: 0.5 },
  superestructura: [
    { forma: 'caja', desde: 0.12, hasta: 0.3, base: 0, alto: 0.6, ancho: 0.85 },
    { forma: 'caja', desde: 0.25, hasta: 0.3, base: 0.6, alto: 0.2, ancho: 0.95 },
    { forma: 'caja', desde: 0.15, hasta: 0.2, base: 0.6, alto: 0.35, ancho: 0.3 },
    { forma: 'cilindro', t: 0.22, base: 0.8, alto: 0.6, radio: 0.02, radioSuperior: 0.008 },
    // Replenishment kingposts.
    { forma: 'cilindro', t: 0.42, base: 0, alto: 0.9, radio: 0.03, radioSuperior: 0.02 },
    { forma: 'cilindro', t: 0.55, base: 0, alto: 0.9, radio: 0.03, radioSuperior: 0.02 },
  ],
  propulsion: { ...BUQUE_DE_GUERRA.propulsion, ejes: 1, separacionEjes: 0, timones: 1, separacionTimones: 0 },
}
