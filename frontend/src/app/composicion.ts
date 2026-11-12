import type { CuentasRepository } from '../cuentas/domain/usuario'
import { HttpCuentasRepository } from '../cuentas/infrastructure/HttpCuentasRepository'
import type { BuquesRepository } from '../buques/domain/buque'
import { HttpBuquesRepository } from '../buques/infrastructure/HttpBuquesRepository'
import type {
  EventosInspeccion,
  InspeccionesRepository,
  MiembrosInspeccion,
  ModelosIA,
} from '../inspecciones/application/puertos'
import { HttpInspeccionesRepository } from '../inspecciones/infrastructure/HttpInspeccionesRepository'
import { HttpMiembrosRepository } from '../inspecciones/infrastructure/HttpMiembrosRepository'
import { HttpModelosIARepository } from '../inspecciones/infrastructure/HttpModelosIARepository'
import { SseEventosInspeccion } from '../inspecciones/infrastructure/SseEventosInspeccion'
import { API_BASE_URL } from '../shared/http/apiClient'

/** Composition root: the only place that knows which adapter backs each port. */
export interface Dependencias {
  cuentas: CuentasRepository
  inspecciones: InspeccionesRepository
  miembros: MiembrosInspeccion
  eventos: EventosInspeccion
  modelos: ModelosIA
  buques: BuquesRepository
}

export function crearDependencias(): Dependencias {
  return {
    cuentas: new HttpCuentasRepository(API_BASE_URL),
    inspecciones: new HttpInspeccionesRepository(API_BASE_URL),
    miembros: new HttpMiembrosRepository(API_BASE_URL),
    modelos: new HttpModelosIARepository(API_BASE_URL),
    eventos: new SseEventosInspeccion(API_BASE_URL),
    buques: new HttpBuquesRepository(API_BASE_URL),
  }
}
