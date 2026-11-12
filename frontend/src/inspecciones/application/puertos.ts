import type { BorradorReporte, CambiosReporte } from '../domain/reporte'
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
import type { DetallePorInstancia } from '../domain/detecciones'
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
  /** Renames an inspection; a blank name makes the backend regenerate the default one. */
  renombrar(id: number, nombre: string): Promise<Inspeccion>
  eliminar(id: number): Promise<void>
  /** Hull sections declared by one vessel, in display order. */
  listarSecciones(buqueId: number): Promise<SeccionCasco[]>
  subirFoto(inspeccionId: number, seccionId: number, imagen: File): Promise<Foto>
  /** Enqueues the pending photos; without `modeloId` the server uses its default model. */
  analizar(inspeccionId: number, modeloId?: string): Promise<ResultadoAnalisis>
  /** Re-enqueues one photo; without `modeloId` the photo keeps the model it already had. */
  reintentarFoto(fotoId: number, modeloId?: string): Promise<Foto>
  eliminarFoto(fotoId: number): Promise<void>
  /** Boxes and masks of the last analysis of a photo; rejects when the photo has none (`detalleDisponible` false). */
  obtenerDetecciones(fotoId: number): Promise<DetallePorInstancia>
  /** URL of the inspection's PDF report (built from the saved draft), for a plain download link. */
  urlReporte(inspeccionId: number): string
  /** Report draft: inspector texts and the photos whose findings can be confirmed or discarded. */
  obtenerReporte(inspeccionId: number): Promise<BorradorReporte>
  /** Saves only the given texts and photo reviews; returns the updated draft. */
  guardarReporte(inspeccionId: number, cambios: CambiosReporte): Promise<BorradorReporte>
}

/** Catalog of AI models the backend can analyze with. */
export interface ModelosIA {
  listar(): Promise<ModeloIA[]>
}

/** Live updates for one inspection. Returns a function that stops the subscription. */
export interface EventosInspeccion {
  suscribir(inspeccionId: number, alRecibir: (evento: EventoInspeccion) => void): () => void
}
