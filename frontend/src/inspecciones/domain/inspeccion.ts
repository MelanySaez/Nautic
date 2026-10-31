export type EstadoFoto = 'pendiente' | 'en_proceso' | 'completada' | 'error'

export type Severidad = 'critical' | 'high' | 'medium' | 'low'

export interface SeccionCasco {
  id: number
  codigo: string
  nombre: string
  descripcion: string
  orden: number
}

/** One entry per detected class, as aggregated by the vision worker. */
export interface Deteccion {
  clase: string
  cantidad: number
  confianzaMaxima: number
}

export interface Foto {
  id: number
  seccion: SeccionCasco
  imagenOriginal: string | null
  imagenAnotada: string | null
  detecciones: Deteccion[]
  tiempoInferenciaMs: number | null
  severidad: Severidad | null
  estado: EstadoFoto
  errorDetalle: string | null
  /** Catalog id of the model that analyzed (or will analyze) the photo; null when none was chosen yet. */
  modelo: string | null
  modeloVersion: string | null
  taxonomiaVersion: string | null
  fechaCreacion: string
}

export interface Inspeccion {
  id: number
  buqueId: number
  buqueNombre: string
  descripcion: string
  tomadoPor: string
  fechaCreacion: string
  fechaModificacion: string
  totalFotos: number
}

export interface InspeccionDetalle extends Inspeccion {
  fotos: Foto[]
}

export interface NuevaInspeccion {
  buqueId: number
  /** Optional: when blank the backend generates one. */
  nombre?: string
  tomadoPor: string
  descripcion: string
}

/** Partial photo state pushed by the server while a photo is analyzed. */
export interface ActualizacionFoto {
  fotoId: number
  estado: EstadoFoto
  severidad: Severidad | null
  detecciones: Deteccion[]
  tiempoInferenciaMs: number | null
  imagenAnotada: string | null
  errorDetalle: string | null
  modelo: string | null
  modeloVersion: string | null
  taxonomiaVersion: string | null
}

export type EventoInspeccion =
  | { tipo: 'foto-creada'; foto: Foto }
  | { tipo: 'foto-actualizada'; actualizacion: ActualizacionFoto }
  | { tipo: 'foto-eliminada'; fotoId: number }
