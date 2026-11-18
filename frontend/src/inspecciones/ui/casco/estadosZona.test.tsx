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
