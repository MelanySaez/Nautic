import type { Arquetipo } from './arquetipo'
import type { DimensionesCasco } from './dimensiones'

/**
 * Hull form of one vessel: the shape functions shared by the 3D geometry and the side profile.
 * `t` runs from the stern (0) to the bow (1); heights are meters above the keel baseline.
 */
export interface FormaCasco {
  /** Half-beam (m) at `t`: the transom width, the full beam amidships, a fine entry forward. */
  semimanga(t: number): number
  /** Keel line height (m) at `t`: the run rises toward the transom, the forefoot toward the stem. */
  fondo(t: number): number
  /** Deck edge height (m) at `t`, with the sheer rising toward the stem. */
  cubierta(t: number): number
  /** Section fullness at `t`; the frame superellipse exponent is 2 / plenitud. */
  plenitud(t: number): number
  /** Lengthwise position (m) of a hull point at `t` and height `y`, with the stem rake applied. */
  x(t: number, y: number): number
  /** Height (m) of the hull surface below the transverse offset `z` at `t`. */
  alturaDelCasco(t: number, z: number): number
}

const mezcla = (a: number, b: number, k: number) => a + (b - a) * k

/** Smoothstep of `k` clamped to [0, 1]. */
function suave(k: number): number {
  const u = Math.min(1, Math.max(0, k))
  return u * u * (3 - 2 * u)
}

/** Narrowest half-beam, as a fraction of B/2, so the stem never collapses into a line. */
const SEMIMANGA_MINIMA = 0.004

export function formaDelCasco(dim: DimensionesCasco, arquetipo: Arquetipo): FormaCasco {
  const { eslora: L, manga: B, puntal: D, calado: T } = dim
  const { mangaPlena, espejo, afinamientoProa, plenitud: p, fondo: f, cubierta: c, roda } = arquetipo
  const desdeRoda = Math.max(roda.desde, 2 / 3)

  const semimanga = (t: number) => {
    let k: number
    if (t < mangaPlena.desde) k = espejo + (1 - espejo) * Math.sin(((t / mangaPlena.desde) * Math.PI) / 2)
    else if (t <= mangaPlena.hasta) k = 1
    else k = 1 - Math.pow((t - mangaPlena.hasta) / (1 - mangaPlena.hasta), afinamientoProa)
    return (Math.max(k, SEMIMANGA_MINIMA) * B) / 2
  }

  const fondo = (t: number) => {
    let y = 0
    if (t < f.hastaPopa) y += Math.pow(1 - t / f.hastaPopa, 2) * f.elevacionPopa * T
    if (t > f.desdeProa) y += Math.pow((t - f.desdeProa) / (1 - f.desdeProa), f.exponenteProa) * f.elevacionProa * D
    return y
  }

  const cubierta = (t: number) =>
    D * (1 + (c.elevacionProa - 1) * Math.pow(Math.max(0, (t - c.desde) / (1 - c.desde)), 2))

  const plenitud = (t: number) => {
    if (t < mangaPlena.desde) return mezcla(p.popa, p.centro, t / mangaPlena.desde)
    if (t <= mangaPlena.hasta) return p.centro
    return mezcla(p.centro, p.proa, (t - mangaPlena.hasta) / (1 - mangaPlena.hasta))
  }

  const x = (t: number, y: number) => {
    if (t <= desdeRoda || roda.lanzamiento <= 0) return t * L
    const rake = roda.lanzamiento * L * suave((t - desdeRoda) / (1 - desdeRoda))
    return t * L - rake * Math.max(0, 1 - y / cubierta(t))
  }

  const alturaDelCasco = (t: number, z: number) => {
    const y0 = fondo(t)
    const e = 2 / plenitud(t)
    // Inverse of the frame superellipse: z = hb · sin(a)^e, y = y0 + h · (1 − cos(a)^e).
    const seno = Math.pow(Math.min(1, Math.abs(z) / semimanga(t)), 1 / e)
    const coseno = Math.sqrt(Math.max(0, 1 - seno * seno))
    return y0 + (cubierta(t) - y0) * (1 - Math.pow(coseno, e))
  }

  return { semimanga, fondo, cubierta, plenitud, x, alturaDelCasco }
}

/** A decorative piece resolved to meters, in hull coordinates (x from the stern, y from the keel). */
export type PiezaEnMetros =
  | { forma: 'caja'; x0: number; x1: number; y0: number; y1: number; ancho: number }
  | { forma: 'cilindro'; x: number; y0: number; y1: number; radio: number; radioSuperior: number }

/** Pieces sink this fraction of D into whatever they stand on, so no seam shows. */
const HUNDIMIENTO = 0.01

/** The archetype superstructure, resolved to meters for this vessel. */
export function superestructuraEnMetros(
  forma: FormaCasco,
  dim: DimensionesCasco,
  arquetipo: Arquetipo,
): PiezaEnMetros[] {
  const { eslora: L, manga: B, puntal: D } = dim
  return arquetipo.superestructura.map((pieza) => {
    if (pieza.forma === 'caja') {
      const desde = Math.min(pieza.desde, pieza.hasta)
      const hasta = Math.max(pieza.desde, pieza.hasta)
      const cubierta = forma.cubierta(desde)
      return {
        forma: 'caja',
        x0: desde * L,
        x1: hasta * L,
        y0: cubierta + (pieza.base - HUNDIMIENTO) * D,
        y1: cubierta + (pieza.base + pieza.alto) * D,
        ancho: pieza.ancho * B,
      }
    }
    const cubierta = forma.cubierta(pieza.t)
    return {
      forma: 'cilindro',
      x: pieza.t * L,
      y0: cubierta + (pieza.base - HUNDIMIENTO) * D,
      y1: cubierta + (pieza.base + pieza.alto) * D,
      radio: pieza.radio * B,
      radioSuperior: pieza.radioSuperior * B,
    }
  })
}
