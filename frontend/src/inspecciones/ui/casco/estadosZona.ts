import type { EstadoZona } from '../../domain/resumenZonas'

/** How one zone state is shown: in the list, the legend, the panel badge and the 3D canvas. */
export interface PresentacionEstadoZona {
  texto: string
  /** Badge classes: tinted background with readable text. */
  insignia: string
  /** Solid fill class for colour swatches. */
  muestra: string
  /**
   * CSS custom property holding the zone colour for the current theme, read by the WebGL canvas
   * with `getComputedStyle(document.documentElement)`. These are the raw `--c-*` tokens of
   * `index.css`: the `--color-*` names are `@theme inline`, so Tailwind does not emit them.
   */
  variableColor: `--c-${string}`
}

/** Every zone state, from the worst finding to no photos at all: the legend order. */
export const ESTADOS_ZONA: readonly EstadoZona[] = [
  'critical',
  'high',
  'medium',
  'low',
  'sin-clasificar',
  'sin-hallazgos',
  'sin-analizar',
  'sin-fotos',
]

// The four severity labels and badge colours are the ones of `InsigniaSeveridad`.
export const PRESENTACION_ESTADO_ZONA: Record<EstadoZona, PresentacionEstadoZona> = {
  critical: { texto: 'Crítica', insignia: 'bg-critical-bg text-critical', muestra: 'bg-critical', variableColor: '--c-critical' },
  high: { texto: 'Alta', insignia: 'bg-high-bg text-high', muestra: 'bg-high', variableColor: '--c-high' },
  medium: { texto: 'Media', insignia: 'bg-medium-bg text-medium', muestra: 'bg-medium', variableColor: '--c-medium' },
  low: { texto: 'Baja', insignia: 'bg-low-bg text-low', muestra: 'bg-low', variableColor: '--c-low' },
  'sin-clasificar': {
    texto: 'Hallazgo sin clasificar',
    insignia: 'bg-surface-2 text-zona-sin-clasificar',
    muestra: 'bg-zona-sin-clasificar',
    variableColor: '--c-zona-sin-clasificar',
  },
  'sin-hallazgos': {
    texto: 'Sin hallazgos',
    insignia: 'bg-surface-2 text-zona-sin-hallazgos',
    muestra: 'bg-zona-sin-hallazgos',
    variableColor: '--c-zona-sin-hallazgos',
  },
  'sin-analizar': {
    texto: 'Sin analizar',
    insignia: 'bg-surface-2 text-zona-sin-analizar',
    muestra: 'bg-zona-sin-analizar',
    variableColor: '--c-zona-sin-analizar',
  },
  'sin-fotos': {
    texto: 'Sin fotos',
    insignia: 'bg-surface-2 text-ink-muted',
    muestra: 'bg-zona-sin-fotos',
    variableColor: '--c-zona-sin-fotos',
  },
}
