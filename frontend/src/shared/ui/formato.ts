const FORMATO_FECHA = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' })

export function formatearFecha(iso: string): string {
  const fecha = new Date(iso)
  return Number.isNaN(fecha.getTime()) ? '—' : FORMATO_FECHA.format(fecha)
}

export function mensajeDe(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Ocurrió un error inesperado.'
}

export function porcentaje(valor: number): string {
  return `${Math.round(valor * 100)}%`
}
