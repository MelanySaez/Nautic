import { resolverUrlMedia } from '../../shared/http/apiClient'
import type { EventosInspeccion } from '../application/puertos'
import type { EventoInspeccion } from '../domain/inspeccion'
import { aActualizacionFoto, aFoto, type FotoActualizadaDto, type FotoDto } from './dtos'

/** The subset of `EventSource` this adapter relies on (lets tests inject a fake). */
export interface FuenteEventos {
  addEventListener(tipo: string, oyente: (evento: MessageEvent) => void): void
  close(): void
}

export type CrearFuente = (url: string) => FuenteEventos

/**
 * Subscribes to the backend SSE stream of an inspection. `EventSource` reconnects on its
 * own (the server suggests `retry: 5000`), so there is no polling fallback here.
 */
export class SseEventosInspeccion implements EventosInspeccion {
  private readonly baseUrl: string
  private readonly crearFuente: CrearFuente

  constructor(baseUrl: string, crearFuente: CrearFuente = (url) => new EventSource(url)) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.crearFuente = crearFuente
  }

  suscribir(inspeccionId: number, alRecibir: (evento: EventoInspeccion) => void): () => void {
    const fuente = this.crearFuente(`${this.baseUrl}/api/vision/inspecciones/${inspeccionId}/stream/`)
    const resolverMedia = (ruta: string | null) => resolverUrlMedia(ruta, this.baseUrl || window.location.origin)

    const escuchar = <T>(tipo: string, mapear: (datos: T) => EventoInspeccion) => {
      fuente.addEventListener(tipo, (evento) => {
        let datos: T
        try {
          datos = JSON.parse(evento.data as string) as T
        } catch {
          console.warn(`Evento SSE "${tipo}" con datos inválidos; se ignora.`)
          return
        }
        alRecibir(mapear(datos))
      })
    }

    escuchar<{ foto: FotoDto }>('foto-created', (d) => ({ tipo: 'foto-creada', foto: aFoto(d.foto) }))
    escuchar<FotoActualizadaDto>('foto-updated', (d) => ({
      tipo: 'foto-actualizada',
      actualizacion: aActualizacionFoto(d, resolverMedia),
    }))
    escuchar<{ foto_id: number }>('foto-deleted', (d) => ({ tipo: 'foto-eliminada', fotoId: d.foto_id }))

    return () => fuente.close()
  }
}
