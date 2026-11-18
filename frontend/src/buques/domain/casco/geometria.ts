/**
 * Code-generated hull: one mesh per standard zone plus neutral (deck, transom) and decorative
 * (superstructure) parts, as plain typed arrays. Pure and deterministic; no three.js.
 *
 * Coordinates, in meters:
 * - x along the length, from the transom (x = 0) to the stem head (x = L);
 * - y up from the keel baseline (y = 0);
 * - z transverse: port (babor, `-P` zones) at z < 0, starboard (estribor, `-S` zones) at z > 0.
 *
 * The hull is a series of frames from the stern (t = 0) to the bow (t = 1). Each frame is a
 * superellipse from the keel centreline to the deck edge, split into rows so that every band
 * limit (keel, bottom, bilge, side, waterline, side, deck edge) is an exact vertex row, and the
 * frame count is a multiple of three so t = 1/3 and t = 2/3 fall on frames: no triangle spans
 * two zones.
 */
import type { Arquetipo, Propulsion, TomasDeMar } from './arquetipo'
import type { DimensionesCasco } from './dimensiones'
import { formaDelCasco, superestructuraEnMetros, type FormaCasco, type PiezaEnMetros } from './forma'
import {
  agregarCaja,
  agregarCilindro,
  cajaDe,
  cruz,
  escala,
  normalizar,
  nuevaMalla,
  reflejarZ,
  resta,
  suma,
  unirMallas,
  type ConstructorMalla,
  type Malla,
  type Vec3,
} from './malla'
import {
  CODIGOS_ZONA,
  TRAMOS_DE_CUADERNA,
  alturasDeBandas,
  codigoDeZona,
  tercioDe,
  type Banda,
  type CodigoZona,
} from './zonas'

export type { Malla } from './malla'

export interface OpcionesCasco {
  /**
   * Lengthwise steps between frames (default 180, so 181 frames). Rounded up to a multiple of
   * three so the thirds fall on frames.
   */
  cuadernas?: number
  /** Approximate rows per side around each frame, from the keel to the deck edge (default 82). */
  filas?: number
}

export interface ZonaGenerada extends Malla {
  codigo: CodigoZona
}

export interface CascoGenerado {
  /** Exactly one entry per standard code, in `CODIGOS_ZONA` order. */
  zonas: ZonaGenerada[]
  /** Deck and transom: neutral, not clickable. */
  neutras: Malla[]
  /** Superstructure pieces, in archetype order: decorative, not clickable. */
  decorativas: Malla[]
  /** Bounding box of every mesh above. */
  caja: { min: [number, number, number]; max: [number, number, number] }
}

const CUADERNAS_POR_DEFECTO = 180
/** Rows per frame band, in `TRAMOS_DE_CUADERNA` order, at the default resolution (82 in all). */
const FILAS_POR_TRAMO = [2, 18, 16, 22, 6, 12, 6] as const
/** Samples of each frame curve used to space its rows evenly by girth. */
const MUESTRAS_POR_CUADERNA = 600
/** Every band keeps at least this fraction of the frame girth, even where limits coincide. */
const GIRO_MINIMO = 0.02
/** Propeller blade pitch angle, in radians. */
const PASO_DE_PALA = 0.5

function pasosLongitudinales(cuadernas: number | undefined): number {
  const pedidas =
    cuadernas !== undefined && Number.isFinite(cuadernas) && cuadernas > 0 ? cuadernas : CUADERNAS_POR_DEFECTO
  return Math.max(3, Math.ceil(pedidas / 3) * 3)
}

function repartirFilas(filas: number | undefined): number[] {
  if (filas === undefined || !Number.isFinite(filas) || filas <= 0) return [...FILAS_POR_TRAMO]
  const total = FILAS_POR_TRAMO.reduce((a, b) => a + b, 0)
  return FILAS_POR_TRAMO.map((f) => Math.max(1, Math.round((f * filas) / total)))
}

/** Hull grid of the starboard side: frame `i`, row `j` at index `i * (filas + 1) + j`. */
interface Rejilla {
  pasos: number
  filas: number
  x: Float64Array
  y: Float64Array
  z: Float64Array
  /** Outward unit normal per vertex, three values each. */
  normales: Float64Array
}

/**
 * Writes the rows of the starboard frame at `t` into `y` and `z` from index `desde`: row 0 on
 * the keel centreline (z = 0), the last row on the deck edge.
 */
function muestrearCuaderna(
  forma: FormaCasco,
  dim: DimensionesCasco,
  bandas: Arquetipo['bandas'],
  t: number,
  filasPorTramo: readonly number[],
  y: Float64Array,
  z: Float64Array,
  desde: number,
): void {
  const semimanga = forma.semimanga(t)
  const fondo = forma.fondo(t)
  const cubierta = forma.cubierta(t)
  const exponente = 2 / forma.plenitud(t)
  const alto = cubierta - fondo

  const K = MUESTRAS_POR_CUADERNA
  const ys = new Float64Array(K + 1)
  const zs = new Float64Array(K + 1)
  const arco = new Float64Array(K + 1)
  for (let k = 0; k <= K; k++) {
    const a = ((k / K) * Math.PI) / 2
    zs[k] = semimanga * Math.pow(Math.sin(a), exponente)
    ys[k] = fondo + alto * (1 - Math.pow(Math.max(Math.cos(a), 0), exponente))
    if (k > 0) arco[k] = arco[k - 1] + Math.hypot(zs[k] - zs[k - 1], ys[k] - ys[k - 1])
  }
  const total = arco[K]

  const arcoEnAltura = (altura: number) => {
    if (altura <= ys[0]) return 0
    if (altura >= ys[K]) return total
    let lo = 0
    let hi = K
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (ys[m] < altura) lo = m
      else hi = m
    }
    const f = (altura - ys[lo]) / Math.max(ys[hi] - ys[lo], 1e-12)
    return arco[lo] + f * (arco[hi] - arco[lo])
  }
  const escribirFila = (s: number, fila: number) => {
    let lo = 0
    let hi = K
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (arco[m] < s) lo = m
      else hi = m
    }
    const f = arco[hi] === arco[lo] ? 0 : (s - arco[lo]) / (arco[hi] - arco[lo])
    y[fila] = ys[lo] + f * (ys[hi] - ys[lo])
    z[fila] = zs[lo] + f * (zs[hi] - zs[lo])
  }

  const alturas = alturasDeBandas({ fondo, cubierta, calado: dim.calado, puntal: dim.puntal }, bandas)
  const limites = [0, 0, ...alturas.map(arcoEnAltura), total]
  limites[1] = bandas.quilla * limites[2]
  const tramos = limites.length - 1
  const minimo = total * GIRO_MINIMO
  for (let k = 1; k < tramos; k++) {
    limites[k] = Math.min(Math.max(limites[k], limites[k - 1] + minimo), total - minimo * (tramos - k))
  }

  let fila = desde
  filasPorTramo.forEach((filas, m) => {
    for (let r = 0; r < filas; r++) escribirFila(limites[m] + ((limites[m + 1] - limites[m]) * r) / filas, fila++)
  })
  escribirFila(total, fila)
}

function construirRejilla(
  forma: FormaCasco,
  dim: DimensionesCasco,
  arquetipo: Arquetipo,
  pasos: number,
  filasPorTramo: readonly number[],
): Rejilla {
  const filas = filasPorTramo.reduce((a, b) => a + b, 0)
  const ancho = filas + 1
  const total = (pasos + 1) * ancho
  const x = new Float64Array(total)
  const y = new Float64Array(total)
  const z = new Float64Array(total)
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos
    muestrearCuaderna(forma, dim, arquetipo.bandas, t, filasPorTramo, y, z, i * ancho)
    for (let j = 0; j <= filas; j++) x[i * ancho + j] = forma.x(t, y[i * ancho + j])
  }

  // Normals from central differences along the length and around the frame.
  const normales = new Float64Array(3 * total)
  for (let i = 0; i <= pasos; i++) {
    for (let j = 0; j <= filas; j++) {
      const proa = Math.min(pasos, i + 1) * ancho + j
      const popa = Math.max(0, i - 1) * ancho + j
      const arriba = i * ancho + Math.min(filas, j + 1)
      const abajo = i * ancho + Math.max(0, j - 1)
      const largo: Vec3 = [x[proa] - x[popa], y[proa] - y[popa], z[proa] - z[popa]]
      const giro: Vec3 = [x[arriba] - x[abajo], y[arriba] - y[abajo], z[arriba] - z[abajo]]
      const n = normalizar(cruz(largo, giro))
      const k = 3 * (i * ancho + j)
      normales[k] = n[0]
      normales[k + 1] = n[1]
      normales[k + 2] = n[2]
    }
  }
  return { pasos, filas, x, y, z, normales }
}

/** The 21 shell zones (every code but `PROP` and `SEA-CHEST`), both sides. */
function zonasDelForro(rejilla: Rejilla, filasPorTramo: readonly number[]): Map<CodigoZona, Malla> {
  const { pasos, filas, x, y, z, normales } = rejilla
  const ancho = filas + 1
  const total = (pasos + 1) * ancho
  const bandaDeFila: Banda[] = filasPorTramo.flatMap((n, m) => Array<Banda>(n).fill(TRAMOS_DE_CUADERNA[m]))
  const zonas = new Map<CodigoZona, { malla: ConstructorMalla; vertices: Map<number, number> }>()

  for (const lado of ['S', 'P'] as const) {
    const signo = lado === 'S' ? 1 : -1
    const desplazamiento = lado === 'S' ? 0 : total
    for (let i = 0; i < pasos; i++) {
      const tercio = tercioDe((i + 0.5) / pasos)
      for (let j = 0; j < filas; j++) {
        const codigo = codigoDeZona(bandaDeFila[j], tercio, lado)
        let zona = zonas.get(codigo)
        if (!zona) {
          zona = { malla: nuevaMalla(), vertices: new Map() }
          zonas.set(codigo, zona)
        }
        const { malla, vertices } = zona
        const vertice = (k: number) => {
          let indice = vertices.get(desplazamiento + k)
          if (indice === undefined) {
            indice = malla.vertice(
              [x[k], y[k], signo * z[k]],
              [normales[3 * k], normales[3 * k + 1], signo * normales[3 * k + 2]],
            )
            vertices.set(desplazamiento + k, indice)
          }
          return indice
        }
        const a = vertice(i * ancho + j)
        const b = vertice((i + 1) * ancho + j)
        const c = vertice((i + 1) * ancho + j + 1)
        const d = vertice(i * ancho + j + 1)
        // Starboard winds (a, b, c) outward; the mirrored port side needs the opposite order.
        if (lado === 'S') {
          malla.triangulo(a, b, c)
          malla.triangulo(a, c, d)
        } else {
          malla.triangulo(a, c, b)
          malla.triangulo(a, d, c)
        }
      }
    }
  }
  return new Map([...zonas].map(([codigo, { malla }]) => [codigo, malla.construir()]))
}

/** Main deck: a flat strip between the port and starboard deck edges. */
function cubiertaPrincipal(rejilla: Rejilla): Malla {
  const { pasos, filas, x, y, z } = rejilla
  const ancho = filas + 1
  const c = nuevaMalla()
  const babor: number[] = []
  const estribor: number[] = []
  for (let i = 0; i <= pasos; i++) {
    const k = i * ancho + filas
    const proa = Math.min(pasos, i + 1) * ancho + filas
    const popa = Math.max(0, i - 1) * ancho + filas
    const normal = normalizar([-(y[proa] - y[popa]), x[proa] - x[popa], 0], [0, 1, 0])
    babor.push(c.vertice([x[k], y[k], -z[k]], normal))
    estribor.push(c.vertice([x[k], y[k], z[k]], normal))
  }
  const arriba: Vec3 = [0, 1, 0]
  for (let i = 0; i < pasos; i++) {
    c.trianguloHacia(babor[i], estribor[i], estribor[i + 1], arriba)
    c.trianguloHacia(babor[i], estribor[i + 1], babor[i + 1], arriba)
  }
  return c.construir()
}

/** Transom: the first frame closed across the centreline, facing aft. */
function espejoDePopa(rejilla: Rejilla): Malla {
  const { filas, x, y, z } = rejilla
  const popa: Vec3 = [-1, 0, 0]
  const c = nuevaMalla()
  const quilla = c.vertice([x[0], y[0], 0], popa)
  const babor = [quilla]
  const estribor = [quilla]
  for (let j = 1; j <= filas; j++) {
    babor.push(c.vertice([x[j], y[j], -z[j]], popa))
    estribor.push(c.vertice([x[j], y[j], z[j]], popa))
  }
  c.trianguloHacia(quilla, estribor[1], babor[1], popa)
  for (let j = 1; j < filas; j++) {
    c.trianguloHacia(babor[j], estribor[j], estribor[j + 1], popa)
    c.trianguloHacia(babor[j], estribor[j + 1], babor[j + 1], popa)
  }
  return c.construir()
}

function piezaDecorativa(pieza: PiezaEnMetros): Malla {
  const c = nuevaMalla()
  if (pieza.forma === 'caja') {
    agregarCaja(
      c,
      [(pieza.x0 + pieza.x1) / 2, (pieza.y0 + pieza.y1) / 2, 0],
      [(pieza.x1 - pieza.x0) / 2, 0, 0],
      [0, (pieza.y1 - pieza.y0) / 2, 0],
      [0, 0, pieza.ancho / 2],
    )
  } else {
    agregarCilindro(c, [pieza.x, pieza.y0, 0], [0, pieza.y1 - pieza.y0, 0], pieza.radio, pieza.radioSuperior, 24)
  }
  return c.construir()
}

/** Offsets in [−separacion, separacion], evenly spread; a single one sits on the centreline. */
function posicionesTransversales(cantidad: number, separacion: number): number[] {
  const n = Math.max(0, Math.floor(cantidad))
  if (n === 1) return [0]
  return Array.from({ length: n }, (_, k) => separacion * (-1 + (2 * k) / (n - 1)))
}

/** One starboard shaft line at offset `z` ≥ 0: hub, blades, shaft and its bracket. */
function ejeConHelice(c: ConstructorMalla, forma: FormaCasco, dim: DimensionesCasco, p: Propulsion, z: number) {
  const { eslora: L, calado: T } = dim
  const radio = p.radioHelice * T
  const yEje = p.alturaEje * T
  const xHelice = p.tHelice * L
  const centro: Vec3 = [xHelice, yEje, z]

  agregarCilindro(c, [xHelice - 0.3 * radio, yEje, z], [0.6 * radio, 0, 0], 0.18 * radio, 0.28 * radio, 16)
  for (let k = 0; k < p.palas; k++) {
    const angulo = (2 * Math.PI * k) / p.palas + 0.3
    const radial: Vec3 = [0, Math.cos(angulo), Math.sin(angulo)]
    const tangente: Vec3 = [0, -Math.sin(angulo), Math.cos(angulo)]
    const cuerda = normalizar(suma(escala(tangente, Math.cos(PASO_DE_PALA)), [Math.sin(PASO_DE_PALA), 0, 0]))
    const espesor = cruz(radial, cuerda)
    agregarCaja(
      c,
      suma(centro, escala(radial, 0.6 * radio)),
      escala(radial, 0.4 * radio),
      escala(cuerda, 0.2 * radio),
      escala(espesor, 0.03 * radio),
    )
  }

  // The shaft runs forward until it is well inside the hull.
  const radioEje = 0.1 * radio
  let tFin = p.tHelice
  for (let k = 1; tFin < 0.5 && forma.alturaDelCasco(tFin, z) > yEje - 2 * radioEje; k++) {
    tFin = p.tHelice + 0.002 * k
  }
  const xInicio = xHelice + 0.3 * radio
  agregarCilindro(c, [xInicio, yEje, z], [tFin * L + 0.01 * L - xInicio, 0, 0], radioEje, radioEje, 12)

  // A centreline shaft needs no bracket; an offset one gets a boss and two legs into the hull.
  if (z < 1e-9) return
  const xArbotante = xHelice + p.arbotante * L
  const tArbotante = xArbotante / L
  agregarCilindro(c, [xArbotante - 0.25 * radio, yEje, z], [0.5 * radio, 0, 0], 0.2 * radio, 0.2 * radio, 12)
  for (const zPata of [0.55 * z, Math.min(1.3 * z, 0.95 * forma.semimanga(tArbotante))]) {
    const pie: Vec3 = [xArbotante, yEje, z]
    const cabeza: Vec3 = [xArbotante, forma.alturaDelCasco(tArbotante, zPata) + 0.05 * T, zPata]
    const mitad = escala(resta(cabeza, pie), 0.5)
    agregarCaja(c, suma(pie, mitad), mitad, [0.25 * radio, 0, 0], escala(normalizar(cruz(mitad, [1, 0, 0])), 0.06 * radio))
  }
}

/** One starboard rudder at offset `z` ≥ 0, from below the shaft line up into the hull. */
function timon(c: ConstructorMalla, forma: FormaCasco, dim: DimensionesCasco, p: Propulsion, z: number) {
  const { eslora: L, calado: T } = dim
  const cuerda = p.cuerdaTimon * L
  const x = p.tTimon * L
  const yBajo = Math.max(0.02 * T, (p.alturaEje - 0.85 * p.radioHelice) * T)
  const yAlto =
    Math.max(forma.alturaDelCasco(Math.max(0, (x - cuerda / 2) / L), z), forma.alturaDelCasco((x + cuerda / 2) / L, z)) +
    0.05 * T
  agregarCaja(c, [x, (yBajo + yAlto) / 2, z], [cuerda / 2, 0, 0], [0, (yAlto - yBajo) / 2, 0], [0, 0, 0.075 * cuerda])
}

/** `PROP`: shafts, brackets, propellers and rudders near the stern (appendages only). */
function zonaPropulsion(forma: FormaCasco, dim: DimensionesCasco, p: Propulsion): Malla {
  const semimanga = forma.semimanga(p.tHelice)
  const piezas: Malla[] = []
  const agregar = (construir: (c: ConstructorMalla, z: number) => void, k: number) => {
    const c = nuevaMalla()
    construir(c, Math.abs(k) * semimanga)
    piezas.push(k < 0 ? reflejarZ(c.construir()) : c.construir())
  }
  for (const k of posicionesTransversales(p.ejes, p.separacionEjes)) {
    agregar((c, z) => ejeConHelice(c, forma, dim, p, z), k)
  }
  for (const k of posicionesTransversales(p.timones, p.separacionTimones)) {
    agregar((c, z) => timon(c, forma, dim, p, z), k)
  }
  return unirMallas(piezas)
}

/** `SEA-CHEST`: two grilles lying on the bottom, one per side. */
function zonaTomasDeMar(forma: FormaCasco, dim: DimensionesCasco, tomas: TomasDeMar): Malla {
  const { eslora: L, manga: B, puntal: D } = dim
  const x = tomas.t * L
  const semimanga = forma.semimanga(tomas.t)
  const centro = tomas.separacion * semimanga
  const mitad = (tomas.ancho * B) / 2
  const z1 = Math.max(0, centro - mitad)
  const z2 = Math.min(0.98 * semimanga, centro + mitad)
  const p1: Vec3 = [x, forma.alturaDelCasco(tomas.t, z1), z1]
  const p2: Vec3 = [x, forma.alturaDelCasco(tomas.t, z2), z2]
  const tangente = normalizar(resta(p2, p1))
  const haciaFuera: Vec3 = [0, -tangente[2], tangente[1]]
  const grosor = 0.012 * D

  const c = nuevaMalla()
  agregarCaja(
    c,
    suma(escala(suma(p1, p2), 0.5), escala(haciaFuera, 0.2 * grosor)),
    [(tomas.largo * L) / 2, 0, 0],
    escala(resta(p2, p1), 0.5),
    escala(haciaFuera, grosor / 2),
  )
  const estribor = c.construir()
  return unirMallas([reflejarZ(estribor), estribor])
}

const MALLA_VACIA: Malla = { posiciones: new Float32Array(), normales: new Float32Array(), indices: new Uint32Array() }

/** Generates the hull of a vessel with the given measurements and archetype. Deterministic. */
export function generarCasco(
  dim: DimensionesCasco,
  arquetipo: Arquetipo,
  opciones: OpcionesCasco = {},
): CascoGenerado {
  const forma = formaDelCasco(dim, arquetipo)
  const filasPorTramo = repartirFilas(opciones.filas)
  const rejilla = construirRejilla(forma, dim, arquetipo, pasosLongitudinales(opciones.cuadernas), filasPorTramo)

  const forro = zonasDelForro(rejilla, filasPorTramo)
  forro.set('PROP', zonaPropulsion(forma, dim, arquetipo.propulsion))
  forro.set('SEA-CHEST', zonaTomasDeMar(forma, dim, arquetipo.tomasDeMar))

  const zonas = CODIGOS_ZONA.map((codigo) => ({ codigo, ...(forro.get(codigo) ?? MALLA_VACIA) }))
  const neutras = [cubiertaPrincipal(rejilla), espejoDePopa(rejilla)]
  const decorativas = superestructuraEnMetros(forma, dim, arquetipo).map(piezaDecorativa)
  return { zonas, neutras, decorativas, caja: cajaDe([...zonas, ...neutras, ...decorativas]) }
}
