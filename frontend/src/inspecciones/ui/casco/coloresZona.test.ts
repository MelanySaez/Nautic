import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CodigoZona } from '../../../buques/domain/casco/zonas'
import type { EstadoZona } from '../../domain/resumenZonas'
import { VARIABLES_COLOR, colorDivisor, leerColores, mezclarColores, observarTema, useColoresTema, variableDeZona } from './coloresZona'
import { ESTADOS_ZONA, PRESENTACION_ESTADO_ZONA } from './estadosZona'

const ESTADOS = new Map<CodigoZona, EstadoZona>([
  ['KEEL', 'critical'],
  ['MID-BTM', 'sin-hallazgos'],
])

/** A computed style that answers from a plain object, like `getComputedStyle` does for custom properties. */
function estilo(valores: Record<string, string>): Pick<CSSStyleDeclaration, 'getPropertyValue'> {
  return { getPropertyValue: (nombre: string) => valores[nombre] ?? '' }
}

const html = document.documentElement

afterEach(() => {
  html.classList.remove('dark')
  html.removeAttribute('data-theme')
})

describe('variableDeZona', () => {
  it('colours a zone with the token of its state', () => {
    expect(variableDeZona('KEEL', ESTADOS, false)).toBe('--c-critical-fill')
    expect(variableDeZona('MID-BTM', ESTADOS, false)).toBe('--c-zona-sin-hallazgos')
  })

  it('keeps every zone neutral while the inspection loads', () => {
    expect(variableDeZona('KEEL', ESTADOS, true)).toBe('--c-zona-sin-fotos')
  })

  it('has no token for a zone the vessel has no section for', () => {
    expect(variableDeZona('PROP', ESTADOS, false)).toBeNull()
  })
})

describe('VARIABLES_COLOR', () => {
  it('lists every state token plus the accent, waterline and neutral ones, once', () => {
    for (const estado of ESTADOS_ZONA) expect(VARIABLES_COLOR).toContain(PRESENTACION_ESTADO_ZONA[estado].variableColor)
    for (const variable of ['--c-accent', '--c-info', '--c-surface', '--c-ink']) expect(VARIABLES_COLOR).toContain(variable)
    expect(new Set(VARIABLES_COLOR).size).toBe(VARIABLES_COLOR.length)
  })
})

describe('leerColores', () => {
  it('reads the trimmed value of each token and leaves out the blank ones', () => {
    const colores = leerColores(['--c-critical', '--c-low', '--c-info'], estilo({ '--c-critical': ' #93000a', '--c-low': '#166534 ' }))

    expect([...colores]).toEqual([
      ['--c-critical', '#93000a'],
      ['--c-low', '#166534'],
    ])
  })
})

describe('mezclarColores', () => {
  it('mixes two hex colours channel by channel', () => {
    expect(mezclarColores('#ffffff', '#000000', 0.2)).toBe('#cccccc')
    expect(mezclarColores('#000', '#fff', 0.5)).toBe('#808080')
    expect(mezclarColores('#102030', '#102030', 0.7)).toBe('#102030')
  })

  it('gives up on anything but a hex colour', () => {
    expect(mezclarColores('rgb(0 0 0)', '#ffffff', 0.5)).toBeNull()
    expect(mezclarColores('#ffffff', '', 0.5)).toBeNull()
  })
})

describe('observarTema', () => {
  it('reports a theme switch on <html> until it is stopped', async () => {
    const alCambiar = vi.fn()
    const dejar = observarTema(alCambiar)

    html.classList.add('dark')
    await vi.waitFor(() => expect(alCambiar).toHaveBeenCalledTimes(1))
    html.setAttribute('data-theme', 'dark')
    await vi.waitFor(() => expect(alCambiar).toHaveBeenCalledTimes(2))

    dejar()
    html.classList.remove('dark')
    await act(async () => {})
    expect(alCambiar).toHaveBeenCalledTimes(2)
  })

  it('reports a change of the system colour scheme', () => {
    const oyentes = new Set<() => void>()
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (media) =>
        ({
          matches: false,
          media,
          addEventListener: (_: string, oyente: () => void) => oyentes.add(oyente),
          removeEventListener: (_: string, oyente: () => void) => oyentes.delete(oyente),
        }) as unknown as MediaQueryList,
    )
    const alCambiar = vi.fn()
    const dejar = observarTema(alCambiar)

    oyentes.forEach((oyente) => oyente())
    expect(alCambiar).toHaveBeenCalledTimes(1)
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)')

    dejar()
    expect(oyentes.size).toBe(0)
  })
})

describe('useColoresTema', () => {
  it('re-reads the tokens when the theme changes', async () => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() =>
      estilo({ '--c-critical-fill': html.classList.contains('dark') ? '#ff2a51' : '#e11d48' }) as CSSStyleDeclaration,
    )
    const { result } = renderHook(() => useColoresTema())
    expect(result.current.get('--c-critical-fill')).toBe('#e11d48')

    await act(async () => html.classList.add('dark'))

    await vi.waitFor(() => expect(result.current.get('--c-critical-fill')).toBe('#ff2a51'))
  })

  it('keeps the same colours object while nothing changes', async () => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => estilo({ '--c-critical': '#93000a' }) as CSSStyleDeclaration)
    const { result } = renderHook(() => useColoresTema())
    const antes = result.current

    await act(async () => html.setAttribute('data-theme', 'light'))

    expect(result.current).toBe(antes)
  })
})

describe('colorDivisor', () => {
  it('darkens the zone colour halfway towards the ink, so the border shows on any zone colour', () => {
    expect(colorDivisor('#ffffff', '#000000')).toBe('#808080')
    expect(colorDivisor('#e8a400', '#191c1e')).toBe(mezclarColores('#e8a400', '#191c1e', 0.5))
  })

  it('falls back to the ink when the zone colour cannot be mixed', () => {
    expect(colorDivisor('rgb(1, 2, 3)', '#191c1e')).toBe('#191c1e')
  })
})

