import type {
  EventoInspeccion,
  FiltroInspecciones,
  Foto,
  Inspeccion,
  InspeccionDetalle,
  NuevaInspeccion,
  PaginaInspecciones,
  SeccionCasco,
} from '../domain/inspeccion'
import type { ModeloIA } from '../domain/modelo'

export interface ResultadoAnalisis {
  iniciadas: number
  omitidasPorLimite: number
}

export interface InspeccionesRepository {
  /** One page of the server-side search, newest first; pass the previous page's `siguiente` as `cursor` for the next one. */
  buscar(filtro: FiltroInspecciones, cursor?: string): Promise<PaginaInspecciones>
  obtener(id: number): Promise<InspeccionDetalle>
  crear(datos: NuevaInspeccion): Promise<Inspeccion>
  eliminar(id: number): Promise<void>
  /** Hull sections declared by one vessel, in display order. */
  listarSecciones(buqueId: number): Promise<SeccionCasco[]>
  subirFoto(inspeccionId: number, seccionId: number, imagen: File): Promise<Foto>
  /** Enqueues the pending photos; without `modeloId` the server uses its default model. */
  analizar(inspeccionId: number, modeloId?: string): Promise<ResultadoAnalisis>
  /** Re-enqueues one photo; without `modeloId` the photo keeps the model it already had. */
  reintentarFoto(fotoId: number, modeloId?: string): Promise<Foto>
  eliminarFoto(fotoId: number): Promise<void>
}

/** Catalog of AI models the backend can analyze with. */
export interface ModelosIA {
  listar(): Promise<ModeloIA[]>
}

/** Live updates for one inspection. Returns a function that stops the subscription. */
export interface EventosInspeccion {
  suscribir(inspeccionId: number, alRecibir: (evento: EventoInspeccion) => void): () => void
}
