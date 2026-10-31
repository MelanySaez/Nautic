import type { EventoInspeccion, Foto, Severidad } from './inspeccion'

export interface ResumenProgreso {
  total: number
  completadas: number
  errores: number
  enProceso: number
  pendientes: number
  /** Share of photos whose analysis finished (successfully or not), 0-100. */
  porcentaje: number
}

export function resumirProgreso(fotos: Foto[]): ResumenProgreso {
  const contar = (estado: Foto['estado']) => fotos.filter((f) => f.estado === estado).length
  const completadas = contar('completada')
  const errores = contar('error')
  const total = fotos.length
  return {
    total,
    completadas,
    errores,
    enProceso: contar('en_proceso'),
    pendientes: contar('pendiente'),
    porcentaje: total === 0 ? 0 : Math.round(((completadas + errores) / total) * 100),
  }
}

const RANGO_SEVERIDAD: Record<Severidad, number> = { low: 1, medium: 2, high: 3, critical: 4 }

export function severidadMaxima(fotos: Foto[]): Severidad | null {
  let maxima: Severidad | null = null
  for (const { severidad } of fotos) {
    if (severidad && (maxima === null || RANGO_SEVERIDAD[severidad] > RANGO_SEVERIDAD[maxima])) {
      maxima = severidad
    }
  }
  return maxima
}

export function aplicarEvento(fotos: Foto[], evento: EventoInspeccion): Foto[] {
  switch (evento.tipo) {
    case 'foto-creada':
      return fotos.some((f) => f.id === evento.foto.id) ? fotos : [...fotos, evento.foto]
    case 'foto-actualizada': {
      const { fotoId, ...cambios } = evento.actualizacion
      return fotos.map((f) => (f.id === fotoId ? { ...f, ...cambios } : f))
    }
    case 'foto-eliminada':
      return fotos.filter((f) => f.id !== evento.fotoId)
  }
}
