import type {
  ActualizacionFoto,
  Deteccion,
  EstadoFoto,
  Foto,
  Inspeccion,
  InspeccionDetalle,
  SeccionCasco,
  Severidad,
} from '../domain/inspeccion'

// Wire shapes of the Django vision API (snake_case), mapped to the domain at the edge.

export interface SeccionDto {
  id: number
  codigo: string
  nombre: string
  descripcion: string
  orden: number
}

export interface DeteccionDto {
  class_name: string
  count: number
  max_confidence: number
}

export interface FotoDto {
  id: number
  seccion: SeccionDto
  imagen_original: string | null
  imagen_anotada: string | null
  detecciones: DeteccionDto[] | null
  tiempo_inferencia_ms: number | null
  severidad: Severidad | null
  estado: EstadoFoto
  error_detalle: string | null
  fecha_creacion: string
}

export interface InspeccionDto {
  id: number
  buque_id: number
  buque_nombre: string
  descripcion: string
  tomado_por: string
  fecha_creacion: string
  fecha_modificacion: string
  total_fotos: number
}

export interface InspeccionDetalleDto extends InspeccionDto {
  fotos: FotoDto[]
}

/** Payload of the `foto-updated` SSE event published by the Celery worker. */
export interface FotoActualizadaDto {
  foto_id: number
  estado: EstadoFoto
  severidad: Severidad | null
  detecciones: DeteccionDto[] | null
  tiempo_inferencia_ms: number | null
  imagen_anotada: string | null
  error_detalle: string | null
}

export function aSeccion(dto: SeccionDto): SeccionCasco {
  return {
    id: dto.id,
    codigo: dto.codigo,
    nombre: dto.nombre,
    descripcion: dto.descripcion,
    orden: dto.orden,
  }
}

function aDetecciones(dtos: DeteccionDto[] | null): Deteccion[] {
  return (dtos ?? []).map((d) => ({ clase: d.class_name, cantidad: d.count, confianzaMaxima: d.max_confidence }))
}

export function aFoto(dto: FotoDto): Foto {
  return {
    id: dto.id,
    seccion: aSeccion(dto.seccion),
    imagenOriginal: dto.imagen_original,
    imagenAnotada: dto.imagen_anotada,
    detecciones: aDetecciones(dto.detecciones),
    tiempoInferenciaMs: dto.tiempo_inferencia_ms,
    severidad: dto.severidad,
    estado: dto.estado,
    errorDetalle: dto.error_detalle,
    fechaCreacion: dto.fecha_creacion,
  }
}

export function aInspeccion(dto: InspeccionDto): Inspeccion {
  return {
    id: dto.id,
    buqueId: dto.buque_id,
    buqueNombre: dto.buque_nombre,
    descripcion: dto.descripcion,
    tomadoPor: dto.tomado_por,
    fechaCreacion: dto.fecha_creacion,
    fechaModificacion: dto.fecha_modificacion,
    totalFotos: dto.total_fotos,
  }
}

export function aInspeccionDetalle(dto: InspeccionDetalleDto): InspeccionDetalle {
  return { ...aInspeccion(dto), fotos: dto.fotos.map(aFoto) }
}

export function aActualizacionFoto(
  dto: FotoActualizadaDto,
  resolverMedia: (ruta: string | null) => string | null,
): ActualizacionFoto {
  return {
    fotoId: dto.foto_id,
    estado: dto.estado,
    severidad: dto.severidad,
    detecciones: aDetecciones(dto.detecciones),
    tiempoInferenciaMs: dto.tiempo_inferencia_ms,
    imagenAnotada: resolverMedia(dto.imagen_anotada),
    errorDetalle: dto.error_detalle,
  }
}
