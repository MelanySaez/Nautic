import type { EstadoFoto, Severidad } from '../domain/inspeccion'

// Status badges are "stamps": rectangular, 2px radius, tinted background with dark text.
const BASE = 'inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider uppercase'

const SEVERIDAD: Record<Severidad, { texto: string; clases: string }> = {
  critical: { texto: 'Crítica', clases: 'bg-critical-bg text-critical' },
  high: { texto: 'Alta', clases: 'bg-high-bg text-high' },
  medium: { texto: 'Media', clases: 'bg-medium-bg text-medium' },
  low: { texto: 'Baja', clases: 'bg-low-bg text-low' },
}

const ESTADO: Record<EstadoFoto, { texto: string; clases: string }> = {
  pendiente: { texto: 'Pendiente', clases: 'bg-surface-2 text-ink-muted' },
  en_proceso: { texto: 'Analizando', clases: 'bg-info-bg text-info' },
  completada: { texto: 'Completada', clases: 'bg-low-bg text-low' },
  error: { texto: 'Error', clases: 'bg-critical-bg text-critical' },
}

export function InsigniaSeveridad({ severidad }: { severidad: Severidad }) {
  const { texto, clases } = SEVERIDAD[severidad]
  return <span className={`${BASE} ${clases}`}>{texto}</span>
}

export function InsigniaEstado({ estado }: { estado: EstadoFoto }) {
  const { texto, clases } = ESTADO[estado]
  return <span className={`${BASE} ${clases}`}>{texto}</span>
}
