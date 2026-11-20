import type { Arquetipo } from './arquetipo'
import type { DimensionesCasco } from './dimensiones'
import { formaDelCasco, superestructuraEnMetros } from './forma'

/** Side silhouette as an SVG path, for `viewBox="0 0 {ancho} {alto}"`: x from the transom, y down. */
export interface PerfilLateral {
  d: string
  /** Width in meters: the vessel length. */
  ancho: number
  /** Height in meters: from the keel to the top of the tallest piece. */
  alto: number
}

/** Lengthwise samples of the sheer and keel lines. */
const PASOS = 90

/** Coordinates are written to the centimetre. */
const centimetros = (valor: number) => Math.round(valor * 100) / 100
const redondear = (valor: number) => String(centimetros(valor))

/**
 * Starboard side profile: the hull (sheer line, raked stem, keel line and transom) followed by
 * one outline per superstructure piece. Every subpath is closed and wound the same way, so the
 * default fill draws their union.
 */
export function perfilLateral(dim: DimensionesCasco, arquetipo: Arquetipo): PerfilLateral {
  const forma = formaDelCasco(dim, arquetipo)
  const piezas = superestructuraEnMetros(forma, dim, arquetipo)
  // Both are kept on the centimetre grid (the height rounded up) so rounded points stay inside.
  const ancho = centimetros(dim.eslora)
  const alto = Math.ceil(Math.max(forma.cubierta(0), forma.cubierta(1), ...piezas.map((p) => p.y1)) * 100) / 100
  const punto = (x: number, y: number) => `${redondear(x)} ${redondear(alto - y)}`
  const contorno = (puntos: Array<[number, number]>) =>
    `M${puntos.map(([x, y]) => punto(x, y)).join(' L')} Z`

  const casco: Array<[number, number]> = []
  for (let k = 0; k <= PASOS; k++) {
    const t = k / PASOS
    casco.push([forma.x(t, forma.cubierta(t)), forma.cubierta(t)])
  }
  for (let k = PASOS; k >= 0; k--) {
    const t = k / PASOS
    casco.push([forma.x(t, forma.fondo(t)), forma.fondo(t)])
  }

  const trazos = [contorno(casco)]
  for (const pieza of piezas) {
    if (pieza.forma === 'caja') {
      trazos.push(
        contorno([
          [pieza.x0, pieza.y1],
          [pieza.x1, pieza.y1],
          [pieza.x1, pieza.y0],
          [pieza.x0, pieza.y0],
        ]),
      )
    } else {
      trazos.push(
        contorno([
          [pieza.x - pieza.radioSuperior, pieza.y1],
          [pieza.x + pieza.radioSuperior, pieza.y1],
          [pieza.x + pieza.radio, pieza.y0],
          [pieza.x - pieza.radio, pieza.y0],
        ]),
      )
    }
  }
  return { d: trazos.join(' '), ancho, alto }
}
