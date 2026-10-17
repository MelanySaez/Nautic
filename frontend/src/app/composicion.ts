import type { BuquesRepository } from '../buques/domain/buque'
import { EnMemoriaBuquesRepository } from '../buques/infrastructure/EnMemoriaBuquesRepository'
import { BUQUES_SEMILLA } from '../buques/infrastructure/semilla'
import type { EventosInspeccion, InspeccionesRepository } from '../inspecciones/application/puertos'
import { HttpInspeccionesRepository } from '../inspecciones/infrastructure/HttpInspeccionesRepository'
import { SseEventosInspeccion } from '../inspecciones/infrastructure/SseEventosInspeccion'
import { API_BASE_URL } from '../shared/http/apiClient'

/** Composition root: the only place that knows which adapter backs each port. */
export interface Dependencias {
  inspecciones: InspeccionesRepository
  eventos: EventosInspeccion
  buques: BuquesRepository
}

export function crearDependencias(): Dependencias {
  return {
    inspecciones: new HttpInspeccionesRepository(API_BASE_URL),
    eventos: new SseEventosInspeccion(API_BASE_URL),
    buques: new EnMemoriaBuquesRepository(BUQUES_SEMILLA),
  }
}
