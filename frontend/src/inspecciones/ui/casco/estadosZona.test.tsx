import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Severidad } from '../../domain/inspeccion'
import { InsigniaSeveridad } from '../Insignias'
import { ESTADOS_ZONA, PRESENTACION_ESTADO_ZONA } from './estadosZona'

const SEVERIDADES: Severidad[] = ['critical', 'high', 'medium', 'low']

/**
 * `src/index.css` as text. Vitest blanks every CSS import here (`test.css: false`, `?raw`
 * included), so it is read from disk, relative to the frontend root Vitest runs from. The module
 * name is a variable so the app's type environment stays free of Node types.
 */
async function leerCss(): Promise<string> {
  const modulo = 'node:fs/promises'
  const { readFile } = (await import(/* @vite-ignore */ modulo)) as {
    readFile: (ruta: string, codificacion: 'utf8') => Promise<string>
  }
  return readFile('src/index.css', 'utf8')
}

/** The declarations of one top-level rule of the stylesheet, e.g. `:root` or `.dark`. */
function bloque(css: string, selector: string): string {
  const inicio = css.search(new RegExp(`^${selector.replace('.', '\\.')} \\{`, 'm'))
  expect(inicio).toBeGreaterThanOrEqual(0)
  return css.slice(inicio, css.indexOf('}', inicio))
}

/** Value of a `--c-*` token inside a theme block, as `#rrggbb`. */
function valor(bloqueCss: string, variable: string): string {
  const coincidencia = new RegExp(`${variable}:\\s*(#[0-9a-f]{6})`, 'i').exec(bloqueCss)
  expect(coincidencia, variable).not.toBeNull()
  return coincidencia![1]
}

function canales(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
}

/** WCAG relative luminance contrast. */
function contraste(a: string, b: string): number {
  const luminancia = (hex: string) => {
    const [r, g, b2] = canales(hex)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2
  }
  const [mayor, menor] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (mayor + 0.05) / (menor + 0.05)
}

/** CIE76 distance in Lab: how different two colours look (about 2.3 is just noticeable). */
function distancia(a: string, b: string): number {
  const lab = (hex: string) => {
    const [r, g, b2] = canales(hex)
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
    const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b2) / 0.95047)
    const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b2)
    const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b2) / 1.08883)
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
  }
  const [p, q] = [lab(a), lab(b)]
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

describe('estadosZona', () => {
  it('presents every zone state once, from the worst severity to no photos', () => {
    expect(ESTADOS_ZONA).toEqual([
      'critical',
      'high',
      'medium',
      'low',
      'sin-clasificar',
      'sin-hallazgos',
      'sin-analizar',
      'sin-fotos',
    ])
    expect(Object.keys(PRESENTACION_ESTADO_ZONA).sort()).toEqual([...ESTADOS_ZONA].sort())
  })

  it('gives each state its own label and its own colour token', () => {
    const textos = ESTADOS_ZONA.map((estado) => PRESENTACION_ESTADO_ZONA[estado].texto)
    const variables = ESTADOS_ZONA.map((estado) => PRESENTACION_ESTADO_ZONA[estado].variableColor)

    expect(textos.slice(4)).toEqual(['Hallazgo sin clasificar', 'Sin hallazgos', 'Sin analizar', 'Sin fotos'])
    expect(new Set(textos).size).toBe(ESTADOS_ZONA.length)
    expect(new Set(variables).size).toBe(ESTADOS_ZONA.length)
  })

  it.each(SEVERIDADES)('labels the %s level like the severity badges', (severidad) => {
    render(<InsigniaSeveridad severidad={severidad} />)

    expect(screen.getByText(PRESENTACION_ESTADO_ZONA[severidad].texto)).toBeInTheDocument()
  })

  it('keeps the severity colours of the light theme easy to tell apart and the badges readable', async () => {
    const claro = bloque(await leerCss(), ':root')
    const severidades = ESTADOS_ZONA.slice(0, 4)
    const rellenos = severidades.map((estado) => valor(claro, PRESENTACION_ESTADO_ZONA[estado].variableColor))

    for (let i = 0; i < rellenos.length; i++) {
      for (let j = i + 1; j < rellenos.length; j++) {
        expect(distancia(rellenos[i], rellenos[j]), `${severidades[i]} / ${severidades[j]}`).toBeGreaterThanOrEqual(40)
      }
    }
    for (const estado of severidades) {
      const tinta = valor(claro, `--c-${estado}`)
      const fondo = valor(claro, `--c-${estado}-bg`)
      expect(contraste(tinta, fondo), estado).toBeGreaterThanOrEqual(4.5)
    }
    for (let i = 0; i < severidades.length; i++) {
      for (let j = i + 1; j < severidades.length; j++) {
        const [a, b] = [valor(claro, `--c-${severidades[i]}-bg`), valor(claro, `--c-${severidades[j]}-bg`)]
        expect(distancia(a, b), `${severidades[i]}-bg / ${severidades[j]}-bg`).toBeGreaterThanOrEqual(20)
      }
    }
  })

  it('reads every colour from a token declared for the light and the dark theme', async () => {
    const css = await leerCss()
    const claro = bloque(css, ':root')
    const oscuro = bloque(css, '.dark')

    for (const estado of ESTADOS_ZONA) {
      const { variableColor } = PRESENTACION_ESTADO_ZONA[estado]
      expect(variableColor).toMatch(/^--c-/)
      expect(claro).toContain(`${variableColor}:`)
      expect(oscuro).toContain(`${variableColor}:`)
    }
  })
})
