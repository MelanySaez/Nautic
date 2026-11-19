import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Malla, Vec3 } from '../../../buques/domain/casco/malla'
import {
  DURACION_VISTA_MS,
  UMBRAL_ARRASTRE_PX,
  VISTAS_CAMARA,
  centroDeCaja,
  distanciaDeEncuadre,
  duracionMovimiento,
  esArrastre,
  interpolarOrbita,
  limitesDeDistancia,
  miraHaciaCamara,
  posicionDeVista,
  progreso,
  puntoDeInsignia,
  suavizar,
  useMovimientoReducido,
  webglDisponible,
} from './vistaCasco'

const longitud = (v: Vec3) => Math.hypot(v[0], v[1], v[2])

function expectCerca(real: Vec3, esperado: Vec3, digitos = 6) {
  real.forEach((valor, i) => expect(valor).toBeCloseTo(esperado[i], digitos))
}

/** A 120 m hull box: 120 m long, 26 m from the keel to the mast top, 15.6 m beam. */
const CAJA = { min: [0, 0, -7.8] as Vec3, max: [120, 26, 7.8] as Vec3 }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('camera views', () => {
  it('offers the presets in button order', () => {
    expect(VISTAS_CAMARA.map((vista) => vista.texto)).toEqual(['3/4', 'Babor', 'Estribor', 'Fondo'])
  })

  it('places every view at the given distance from the hull centre', () => {
    for (const vista of ['3/4', 'babor', 'estribor', 'fondo', 'lateral'] as const) {
      expect(longitud(posicionDeVista(vista, 100))).toBeCloseTo(100, 6)
    }
  })

  it('starts the fly-in from the starboard elevation of the silhouette', () => {
    expectCerca(posicionDeVista('lateral', 100), [0, 0, 100])
  })

  it('looks at each side from slightly above, and at the bottom from below', () => {
    const [xe, ye, ze] = posicionDeVista('estribor', 100)
    const [xb, yb, zb] = posicionDeVista('babor', 100)
    const [, yf] = posicionDeVista('fondo', 100)

    expect(ze).toBeGreaterThan(90)
    expect(zb).toBeLessThan(-90)
    expect(xe).toBeCloseTo(0, 6)
    expect(xb).toBeCloseTo(0, 6)
    expect(ye).toBeGreaterThan(0)
    expect(yb).toBeCloseTo(ye, 6)
    expect(yf).toBeLessThan(-90)
  })

  it('shows the 3/4 view from above, on the starboard bow', () => {
    const [x, y, z] = posicionDeVista('3/4', 100)

    expect(x).toBeGreaterThan(0)
    expect(y).toBeGreaterThan(0)
    expect(z).toBeGreaterThan(0)
  })
})

describe('distanciaDeEncuadre', () => {
  const tanMedia = Math.tan((35 * Math.PI) / 360)

  it('fits the whole length across a 16:9 slot, with a small margin', () => {
    const distancia = distanciaDeEncuadre(CAJA, 35, 16 / 9)
    const mitadVisible = distancia * tanMedia * (16 / 9)

    expect(mitadVisible).toBeGreaterThanOrEqual(60)
    expect(mitadVisible).toBeLessThan(60 * 1.25)
  })

  it('fits the height when the box is taller than the slot', () => {
    const distancia = distanciaDeEncuadre({ min: [0, 0, -1], max: [10, 40, 1] }, 35, 16 / 9)

    expect(distancia * tanMedia).toBeGreaterThanOrEqual(20)
    expect(distancia * tanMedia).toBeLessThan(20 * 1.25)
  })

  it('assumes a 16:9 slot when the aspect is unknown', () => {
    expect(distanciaDeEncuadre(CAJA, 35, 0)).toBe(distanciaDeEncuadre(CAJA, 35, 16 / 9))
    expect(distanciaDeEncuadre(CAJA, 35, Number.NaN)).toBe(distanciaDeEncuadre(CAJA, 35, 16 / 9))
  })

  it('keeps the presets within the zoom limits, from a quarter to three lengths', () => {
    const { min, max } = limitesDeDistancia(120)
    const distancia = distanciaDeEncuadre(CAJA, 35, 16 / 9)

    expect(min).toBe(30)
    expect(max).toBe(360)
    expect(distancia).toBeGreaterThan(min)
    expect(distancia).toBeLessThan(max)
  })
})

describe('interpolarOrbita', () => {
  const ORIGEN: Vec3 = [0, 0, 0]

  it('goes from the start to the end of the move', () => {
    const desde: Vec3 = [0, 0, 100]
    const hasta = posicionDeVista('3/4', 80)

    expectCerca(interpolarOrbita(desde, hasta, ORIGEN, ORIGEN, 0).posicion, desde)
    expectCerca(interpolarOrbita(desde, hasta, ORIGEN, ORIGEN, 1).posicion, hasta)
  })

  it('orbits around the target instead of cutting through it', () => {
    const { posicion } = interpolarOrbita([0, 0, 100], [100, 0, 0], ORIGEN, ORIGEN, 0.5)

    expectCerca(posicion, [100 * Math.SQRT1_2, 0, 100 * Math.SQRT1_2])
  })

  it('moves the target along with the camera', () => {
    const { posicion, objetivo } = interpolarOrbita([10, 0, 100], [0, 0, 100], [10, 0, 0], ORIGEN, 0.5)

    expectCerca(objetivo, [5, 0, 0])
    expectCerca(posicion, [5, 0, 100])
  })

  it('turns the short way round', () => {
    const angulo = (grados: number): Vec3 => [
      100 * Math.sin((grados * Math.PI) / 180),
      0,
      100 * Math.cos((grados * Math.PI) / 180),
    ]

    expectCerca(interpolarOrbita(angulo(170), angulo(-170), ORIGEN, ORIGEN, 0.5).posicion, [0, 0, -100])
  })
})

describe('timing', () => {
  it('eases in and out between 0 and 1', () => {
    expect(suavizar(0)).toBe(0)
    expect(suavizar(0.5)).toBeCloseTo(0.5, 9)
    expect(suavizar(1)).toBe(1)
    expect(suavizar(0.1)).toBeLessThan(0.1)
    expect(suavizar(0.9)).toBeGreaterThan(0.9)
    expect(suavizar(-1)).toBe(0)
    expect(suavizar(2)).toBe(1)
  })

  it('measures the progress of a move, finished at once when it has no duration', () => {
    expect(progreso(0, DURACION_VISTA_MS)).toBe(0)
    expect(progreso(DURACION_VISTA_MS / 2, DURACION_VISTA_MS)).toBe(0.5)
    expect(progreso(2 * DURACION_VISTA_MS, DURACION_VISTA_MS)).toBe(1)
    expect(progreso(-5, DURACION_VISTA_MS)).toBe(0)
    expect(progreso(0, 0)).toBe(1)
  })

  it('drops every animation when the user prefers reduced motion', () => {
    expect(duracionMovimiento(DURACION_VISTA_MS, false)).toBe(DURACION_VISTA_MS)
    expect(duracionMovimiento(DURACION_VISTA_MS, true)).toBe(0)
  })
})

describe('esArrastre', () => {
  it('counts a pointer that moved more than 5 px as a camera drag, not a click', () => {
    expect(UMBRAL_ARRASTRE_PX).toBe(5)
    expect(esArrastre(0)).toBe(false)
    expect(esArrastre(5)).toBe(false)
    expect(esArrastre(5.5)).toBe(true)
  })
})

describe('hull anchors', () => {
  it('finds the centre of the hull box', () => {
    expect(centroDeCaja(CAJA)).toEqual([60, 13, 0])
  })

  it('anchors a photo badge on the zone surface, just off it along its normal', () => {
    // Three vertices on a quarter circle: their average lies inside the curve, the middle one on it.
    const s = Math.SQRT1_2
    const malla: Malla = {
      posiciones: new Float32Array([0, 0, 10, 0, 10 * s, 10 * s, 0, 10, 0]),
      normales: new Float32Array([0, 0, 1, 0, s, s, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    }

    const insignia = puntoDeInsignia(malla, 1)

    expect(insignia).not.toBeNull()
    expectCerca(insignia!.punto, [0, 11 * s, 11 * s], 5)
    expectCerca(insignia!.normal, [0, s, s], 5)
  })

  it('has no badge anchor for an empty zone', () => {
    const vacia: Malla = { posiciones: new Float32Array(), normales: new Float32Array(), indices: new Uint32Array() }

    expect(puntoDeInsignia(vacia, 1)).toBeNull()
  })

  it('shows a badge only while its side of the hull faces the camera', () => {
    expect(miraHaciaCamara([0, 0, 5], [0, 0, 1], [0, 0, 100])).toBe(true)
    expect(miraHaciaCamara([0, 0, 5], [0, 0, 1], [0, 0, -100])).toBe(false)
    expect(miraHaciaCamara([0, 0, 5], [0, 0, 1], [100, 0, 5])).toBe(false)
  })
})

describe('useMovimientoReducido', () => {
  function preferencia(reducido: boolean) {
    const oyentes = new Set<() => void>()
    const consulta = {
      matches: reducido,
      addEventListener: (_: string, oyente: () => void) => oyentes.add(oyente),
      removeEventListener: (_: string, oyente: () => void) => oyentes.delete(oyente),
    }
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (media) => ({ ...consulta, matches: consulta.matches, media }) as unknown as MediaQueryList,
    )
    return {
      cambiar(valor: boolean) {
        consulta.matches = valor
        oyentes.forEach((oyente) => oyente())
      },
    }
  }

  it('follows the prefers-reduced-motion setting, also when it changes', () => {
    const sistema = preferencia(false)
    const { result } = renderHook(() => useMovimientoReducido())
    expect(result.current).toBe(false)

    act(() => sistema.cambiar(true))

    expect(result.current).toBe(true)
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
  })
})

describe('webglDisponible', () => {
  it('is false without the WebGL API, as in jsdom', () => {
    expect(webglDisponible()).toBe(false)
  })

  it('probes a context and releases it at once', () => {
    const loseContext = vi.fn()
    vi.stubGlobal('WebGLRenderingContext', class {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({ getExtension: () => ({ loseContext }) }) as unknown as WebGLRenderingContext,
    )

    expect(webglDisponible()).toBe(true)
    expect(loseContext).toHaveBeenCalled()
  })

  it('is false when the browser refuses or fails to create a context', () => {
    vi.stubGlobal('WebGL2RenderingContext', class {})
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(webglDisponible()).toBe(false)

    getContext.mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(webglDisponible()).toBe(false)
  })
})
