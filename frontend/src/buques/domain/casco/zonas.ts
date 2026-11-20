import type { Arquetipo } from './arquetipo'

/** The 23 standard hull sections, in the backend `SECCIONES_ESTANDAR` order. */
export const CODIGOS_ZONA = [
  'FWD-BTM',
  'MID-BTM',
  'AFT-BTM',
  'FWD-BLG-P',
  'FWD-BLG-S',
  'MID-BLG-P',
  'MID-BLG-S',
  'AFT-BLG-P',
  'AFT-BLG-S',
  'FWD-SS-P',
  'MID-SS-P',
  'AFT-SS-P',
  'FWD-SS-S',
  'MID-SS-S',
  'AFT-SS-S',
  'FWD-DK',
  'MID-DK',
  'AFT-DK',
  'KEEL',
  'WL-P',
  'WL-S',
  'PROP',
  'SEA-CHEST',
] as const

export type CodigoZona = (typeof CODIGOS_ZONA)[number]

const CODIGOS = new Set<string>(CODIGOS_ZONA)

/** True only for an exact standard code: no trimming, no case folding. */
export function esCodigoZona(codigo: string): codigo is CodigoZona {
  return CODIGOS.has(codigo)
}

/** Lengthwise third: aft, middle or forward. */
export type Tercio = 'AFT' | 'MID' | 'FWD'
/** Side: port (babor, `P`, z < 0) or starboard (estribor, `S`, z > 0). */
export type Lado = 'P' | 'S'
/** Vertical band of a frame. */
export type Banda = 'KEEL' | 'BTM' | 'BLG' | 'SS' | 'WL' | 'DK'

/**
 * Bands met along a frame, from the keel centreline to the deck edge. The side band appears twice:
 * below and above the waterline. The keel is the first `bandas.quilla` fraction of the bottom band.
 */
export const TRAMOS_DE_CUADERNA: readonly Banda[] = ['KEEL', 'BTM', 'BLG', 'SS', 'WL', 'SS', 'DK']

/** Third of a lengthwise position `t` (0 = stern, 1 = bow). */
export function tercioDe(t: number): Tercio {
  if (t < 1 / 3) return 'AFT'
  if (t < 2 / 3) return 'MID'
  return 'FWD'
}

/**
 * Zone of a hull cell. The keel is one strip; bottom and deck edge split by third only; the
 * waterline by side only; bilge and side by third and side.
 */
export function codigoDeZona(banda: Banda, tercio: Tercio, lado: Lado): CodigoZona {
  switch (banda) {
    case 'KEEL':
      return 'KEEL'
    case 'BTM':
      return `${tercio}-BTM`
    case 'DK':
      return `${tercio}-DK`
    case 'WL':
      return `WL-${lado}`
    default:
      return `${tercio}-${banda}-${lado}`
  }
}

/** Vertical extent of one frame (heights in meters above the baseline) and the vessel's T and D. */
export interface AlturasCuaderna {
  /** Keel line height of the frame. */
  fondo: number
  /** Deck edge height of the frame. */
  cubierta: number
  calado: number
  puntal: number
}

/**
 * The bottom and bilge bands never take more than these fractions of the immersed depth below the
 * waterline band, so a rising bottom (transom, forefoot) cannot push them above the waterline.
 */
const FONDO_MAX_SUMERGIDO = 0.25
const PANTOQUE_MAX_SUMERGIDO = 0.75

/**
 * Heights (m) of the five vertical band limits of a frame, from the keel up: bottom|bilge,
 * bilge|side, side|waterline, waterline|side and side|deck edge. The waterline band spans
 * `flotacion` × D around T. Heights may coincide when the frame is short; the generator then
 * keeps a minimum girth per band.
 */
export function alturasDeBandas(
  cuaderna: AlturasCuaderna,
  bandas: Arquetipo['bandas'],
): [number, number, number, number, number] {
  const { fondo, cubierta, calado, puntal } = cuaderna
  const altura = cubierta - fondo
  const flotacionInferior = calado - bandas.flotacion * puntal
  const sumergido = Math.max(0, flotacionInferior - fondo)
  return [
    fondo + Math.min(bandas.fondo * altura, FONDO_MAX_SUMERGIDO * sumergido),
    fondo + Math.min(bandas.pantoque * altura, PANTOQUE_MAX_SUMERGIDO * sumergido),
    flotacionInferior,
    calado + bandas.flotacion * puntal,
    cubierta - bandas.cinta * puntal,
  ]
}

/**
 * Places a vessel's sections on the hull by EXACT code match with a standard code. Unmatched
 * sections (custom codes, lower case, free text) keep their input order in `sinUbicar`. If a
 * standard code repeats, the first section wins and the rest are left unplaced.
 */
export function ubicarSecciones<S extends { codigo: string }>(
  secciones: readonly S[],
): { ubicadas: Map<CodigoZona, S>; sinUbicar: S[] } {
  const ubicadas = new Map<CodigoZona, S>()
  const sinUbicar: S[] = []
  for (const seccion of secciones) {
    if (esCodigoZona(seccion.codigo) && !ubicadas.has(seccion.codigo)) ubicadas.set(seccion.codigo, seccion)
    else sinUbicar.push(seccion)
  }
  return { ubicadas, sinUbicar }
}
