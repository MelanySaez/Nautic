/**
 * Colours of the 3D hull, read from the theme tokens of `index.css` so the canvas follows the
 * light and dark themes like the rest of the page. No three.js here.
 */
import { useEffect, useState } from 'react'
import type { CodigoZona } from '../../../buques/domain/casco/zonas'
import type { EstadoZona } from '../../domain/resumenZonas'
import { ESTADOS_ZONA, PRESENTACION_ESTADO_ZONA, type PresentacionEstadoZona } from './estadosZona'

export type VariableColor = PresentacionEstadoZona['variableColor']

/** Tokens the canvas reads besides the zone states: selection, waterline and the neutral mix. */
const VARIABLES_ESCENA: readonly VariableColor[] = ['--c-accent', '--c-info', '--c-surface', '--c-ink']

/** Every colour token the canvas reads, once each. */
export const VARIABLES_COLOR: readonly VariableColor[] = [
  ...new Set([...ESTADOS_ZONA.map((estado) => PRESENTACION_ESTADO_ZONA[estado].variableColor), ...VARIABLES_ESCENA]),
]

/**
 * Token of a hull zone: the colour of its state, the neutral "sin fotos" one while the inspection
 * loads, and none for a code the vessel has no section for (drawn like the deck).
 */
export function variableDeZona(
  codigo: CodigoZona,
  estados: ReadonlyMap<CodigoZona, EstadoZona>,
  cargando: boolean,
): VariableColor | null {
  const estado = estados.get(codigo)
  if (estado === undefined) return null
  return PRESENTACION_ESTADO_ZONA[cargando ? 'sin-fotos' : estado].variableColor
}

type EstiloCalculado = Pick<CSSStyleDeclaration, 'getPropertyValue'>

/** Current values of the given tokens on `<html>`; a token without a value is left out. */
export function leerColores(
  variables: readonly VariableColor[],
  estilo: EstiloCalculado = window.getComputedStyle(document.documentElement),
): ReadonlyMap<VariableColor, string> {
  const colores = new Map<VariableColor, string>()
  for (const variable of variables) {
    const valor = estilo.getPropertyValue(variable).trim()
    if (valor) colores.set(variable, valor)
  }
  return colores
}

function canales(hex: string): number[] | null {
  const coincidencia = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!coincidencia) return null
  const digitos = coincidencia[1].length === 3 ? [...coincidencia[1]].map((d) => d + d).join('') : coincidencia[1]
  return [0, 2, 4].map((i) => parseInt(digitos.slice(i, i + 2), 16))
}

/** `a` mixed with `t` of `b`, channel by channel in sRGB; null unless both are hex colours. */
export function mezclarColores(a: string, b: string, t: number): string | null {
  const desde = canales(a)
  const hasta = canales(b)
  if (!desde || !hasta) return null
  return `#${desde.map((c, i) => Math.round(c + (hasta[i] - c) * t).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Calls `alCambiar` whenever the theme may have changed: the `class` or `data-theme` of `<html>`,
 * or the system colour scheme. Returns the function that stops observing.
 */
export function observarTema(alCambiar: () => void): () => void {
  const observador = new MutationObserver(() => alCambiar())
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  const esquema = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
  esquema?.addEventListener('change', alCambiar)
  return () => {
    observador.disconnect()
    esquema?.removeEventListener('change', alCambiar)
  }
}

function mismosColores(a: ReadonlyMap<VariableColor, string>, b: ReadonlyMap<VariableColor, string>): boolean {
  return a.size === b.size && [...a].every(([variable, valor]) => b.get(variable) === valor)
}

/** The values of `VARIABLES_COLOR` for the current theme, read again on every theme change. */
export function useColoresTema(): ReadonlyMap<VariableColor, string> {
  const [colores, setColores] = useState(() => leerColores(VARIABLES_COLOR))

  useEffect(() => {
    const actualizar = () =>
      setColores((previos) => {
        const nuevos = leerColores(VARIABLES_COLOR)
        return mismosColores(previos, nuevos) ? previos : nuevos
      })
    // The theme may have switched between the first render and this subscription.
    actualizar()
    return observarTema(actualizar)
  }, [])

  return colores
}

/**
 * Border drawn around every hull zone, so neighbouring zones in the same state stay apart:
 * the zone colour taken halfway to the theme ink (darker in light mode, lighter in dark mode).
 */
export function colorDivisor(colorZona: string, tinta: string): string {
  return mezclarColores(colorZona, tinta, 0.5) ?? tinta
}

