/**
 * Camera, timing and anchor helpers of the 3D hull view. Plain math on the hull coordinates of
 * `buques/domain/casco/geometria.ts` (x towards the bow, y up, z towards starboard): no three.js,
 * so the page can import them without pulling the WebGL chunk.
 */
import { useSyncExternalStore } from 'react'
import type { Malla, Vec3 } from '../../../buques/domain/casco/malla'

export type NombreVista = '3/4' | 'babor' | 'estribor' | 'fondo'

/** The camera presets offered as buttons, in button order. */
export const VISTAS_CAMARA: readonly { vista: NombreVista; texto: string }[] = [
  { vista: '3/4', texto: '3/4' },
  { vista: 'babor', texto: 'Babor' },
  { vista: 'estribor', texto: 'Estribor' },
  { vista: 'fondo', texto: 'Fondo' },
]

/**
 * Orbit angles in degrees. `polar` goes from straight above (0) to straight below (180);
 * `azimut` from starboard (0) towards the bow (90), port being 180.
 */
const ORIENTACIONES: Record<NombreVista | 'lateral', { polar: number; azimut: number }> = {
  '3/4': { polar: 62, azimut: 40 },
  babor: { polar: 84, azimut: 180 },
  estribor: { polar: 84, azimut: 0 },
  // Slightly to starboard, so the bow stays on the right as in the other views.
  fondo: { polar: 166, azimut: 0 },
  // The starboard elevation the silhouette draws: where the fly-in starts.
  lateral: { polar: 90, azimut: 0 },
}

/** Vertical field of view of the camera, in degrees. */
export const CAMPO_VISION_GRADOS = 35
/** Aspect of the scene slot (`aspect-video`), used before the canvas is measured. */
export const ASPECTO_POR_DEFECTO = 16 / 9
/** Extra room around the hull when a view frames it. */
const MARGEN_ENCUADRE = 1.15

export const DURACION_ENTRADA_MS = 1200
export const DURACION_VISTA_MS = 750
export const DURACION_COLOR_MS = 700

/** A pointer that travelled further than this between press and release was orbiting the camera. */
export const UMBRAL_ARRASTRE_PX = 5

const radianes = (grados: number) => (grados * Math.PI) / 180

function enOrbita(distancia: number, polar: number, azimut: number): Vec3 {
  return [
    distancia * Math.sin(polar) * Math.sin(azimut),
    distancia * Math.cos(polar),
    distancia * Math.sin(polar) * Math.cos(azimut),
  ]
}

function orbitaDe(desplazamiento: Vec3): { distancia: number; polar: number; azimut: number } {
  const [x, y, z] = desplazamiento
  const distancia = Math.hypot(x, y, z)
  if (distancia === 0) return { distancia, polar: 0, azimut: 0 }
  return { distancia, polar: Math.acos(Math.min(1, Math.max(-1, y / distancia))), azimut: Math.atan2(x, z) }
}

/** Camera position of a view, at `distancia` from the hull centre (the orbit target). */
export function posicionDeVista(vista: NombreVista | 'lateral', distancia: number): Vec3 {
  const { polar, azimut } = ORIENTACIONES[vista]
  return enOrbita(distancia, radianes(polar), radianes(azimut))
}

/**
 * Distance from the box centre at which the whole box length and height fit the view, seen from
 * the side: the framing of the silhouette, also used by every preset.
 */
export function distanciaDeEncuadre(
  caja: { min: Vec3; max: Vec3 },
  campoVisionGrados: number,
  aspecto: number,
): number {
  const proporcion = Number.isFinite(aspecto) && aspecto > 0 ? aspecto : ASPECTO_POR_DEFECTO
  const tangente = Math.tan(radianes(campoVisionGrados) / 2)
  const mitadLargo = (caja.max[0] - caja.min[0]) / 2
  const mitadAlto = (caja.max[1] - caja.min[1]) / 2
  return MARGEN_ENCUADRE * Math.max(mitadLargo / (tangente * proporcion), mitadAlto / tangente)
}

/** How close and how far the user may zoom: a quarter to three hull lengths. */
export function limitesDeDistancia(eslora: number): { min: number; max: number } {
  return { min: 0.25 * eslora, max: 3 * eslora }
}

/**
 * Camera position and target at `t` (0 → 1) of a move. The camera orbits the moving target,
 * interpolating distance and angles (the short way round) instead of cutting a straight line.
 */
export function interpolarOrbita(
  desde: Vec3,
  hasta: Vec3,
  objetivoDesde: Vec3,
  objetivoHasta: Vec3,
  t: number,
): { posicion: Vec3; objetivo: Vec3 } {
  const mezcla = (a: number, b: number) => a + (b - a) * t
  const objetivo: Vec3 = [
    mezcla(objetivoDesde[0], objetivoHasta[0]),
    mezcla(objetivoDesde[1], objetivoHasta[1]),
    mezcla(objetivoDesde[2], objetivoHasta[2]),
  ]
  const a = orbitaDe([desde[0] - objetivoDesde[0], desde[1] - objetivoDesde[1], desde[2] - objetivoDesde[2]])
  const b = orbitaDe([hasta[0] - objetivoHasta[0], hasta[1] - objetivoHasta[1], hasta[2] - objetivoHasta[2]])
  let giro = b.azimut - a.azimut
  if (giro > Math.PI) giro -= 2 * Math.PI
  if (giro < -Math.PI) giro += 2 * Math.PI
  const [x, y, z] = enOrbita(mezcla(a.distancia, b.distancia), mezcla(a.polar, b.polar), a.azimut + giro * t)
  return { posicion: [objetivo[0] + x, objetivo[1] + y, objetivo[2] + z], objetivo }
}

/** Ease-in-out (cubic) of a progress clamped to [0, 1]. */
export function suavizar(t: number): number {
  const p = Math.min(1, Math.max(0, t))
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
}

/** Progress (0 → 1) of a move after `transcurrido` ms; a move without duration is already done. */
export function progreso(transcurrido: number, duracion: number): number {
  if (duracion <= 0) return 1
  return Math.min(1, Math.max(0, transcurrido / duracion))
}

/** The duration of an animation, none when the user prefers reduced motion. */
export function duracionMovimiento(ms: number, movimientoReducido: boolean): number {
  return movimientoReducido ? 0 : ms
}

/** A click whose pointer travelled further than the threshold was a camera drag. */
export function esArrastre(deltaPx: number): boolean {
  return deltaPx > UMBRAL_ARRASTRE_PX
}

export function centroDeCaja(caja: { min: Vec3; max: Vec3 }): Vec3 {
  return [(caja.min[0] + caja.max[0]) / 2, (caja.min[1] + caja.max[1]) / 2, (caja.min[2] + caja.max[2]) / 2]
}

/**
 * Where the photo badge of a zone floats: on the vertex nearest to the zone's average point (so
 * on the surface even for curved strips), moved `separacion` along that vertex normal.
 */
export function puntoDeInsignia(malla: Malla, separacion: number): { punto: Vec3; normal: Vec3 } | null {
  const { posiciones, normales } = malla
  const vertices = Math.floor(posiciones.length / 3)
  if (vertices === 0) return null
  const media = [0, 0, 0]
  for (let k = 0; k < vertices; k++) {
    for (let e = 0; e < 3; e++) media[e] += posiciones[3 * k + e] / vertices
  }
  let mejor = 0
  let distanciaMejor = Infinity
  for (let k = 0; k < vertices; k++) {
    const d = Math.hypot(posiciones[3 * k] - media[0], posiciones[3 * k + 1] - media[1], posiciones[3 * k + 2] - media[2])
    if (d < distanciaMejor) {
      distanciaMejor = d
      mejor = k
    }
  }
  const normal: Vec3 = [normales[3 * mejor], normales[3 * mejor + 1], normales[3 * mejor + 2]]
  const punto: Vec3 = [
    posiciones[3 * mejor] + separacion * normal[0],
    posiciones[3 * mejor + 1] + separacion * normal[1],
    posiciones[3 * mejor + 2] + separacion * normal[2],
  ]
  return { punto, normal }
}

/** True when the surface at `punto` (facing `normal`) faces a camera at `camara`. */
export function miraHaciaCamara(punto: Vec3, normal: Vec3, camara: Vec3): boolean {
  return (
    normal[0] * (camara[0] - punto[0]) + normal[1] * (camara[1] - punto[1]) + normal[2] * (camara[2] - punto[2]) > 0
  )
}

const CONSULTA_MOVIMIENTO = '(prefers-reduced-motion: reduce)'

function consultaMovimiento(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(CONSULTA_MOVIMIENTO) : null
}

function suscribirMovimiento(alCambiar: () => void): () => void {
  const consulta = consultaMovimiento()
  consulta?.addEventListener('change', alCambiar)
  return () => consulta?.removeEventListener('change', alCambiar)
}

/** Whether the user asked for reduced motion; follows the setting live. */
export function useMovimientoReducido(): boolean {
  return useSyncExternalStore(
    suscribirMovimiento,
    () => consultaMovimiento()?.matches ?? false,
    () => false,
  )
}

/**
 * Whether this browser can create a WebGL context. The probe context is released at once, since
 * browsers cap how many can be alive.
 */
export function webglDisponible(): boolean {
  if (typeof globalThis.WebGL2RenderingContext === 'undefined' && typeof globalThis.WebGLRenderingContext === 'undefined') {
    return false
  }
  try {
    const lienzo = document.createElement('canvas')
    const contexto = lienzo.getContext('webgl2') ?? lienzo.getContext('webgl')
    if (!contexto) return false
    contexto.getExtension?.('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}
