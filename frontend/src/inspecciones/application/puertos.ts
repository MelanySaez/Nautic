import type {
  EventoInspeccion,
  Foto,
  Inspeccion,
  InspeccionDetalle,
  NuevaInspeccion,
  SeccionCasco,
} from '../domain/inspeccion'

export interface ResultadoAnalisis {
  iniciadas: number
  omitidasPorLimite: number
}

export interface InspeccionesRepository {
  listar(): Promise<Inspeccion[]>
  obtener(id: number): Promise<InspeccionDetalle>
  crear(datos: NuevaInspeccion): Promise<Inspeccion>
  eliminar(id: number): Promise<void>
  listarSecciones(): Promise<SeccionCasco[]>
  subirFoto(inspeccionId: number, seccionId: number, imagen: File): Promise<Foto>
  analizar(inspeccionId: number): Promise<ResultadoAnalisis>
  reintentarFoto(fotoId: number): Promise<Foto>
  eliminarFoto(fotoId: number): Promise<void>
}

/** Live updates for one inspection. Returns a function that stops the subscription. */
export interface EventosInspeccion {
  suscribir(inspeccionId: number, alRecibir: (evento: EventoInspeccion) => void): () => void
}
