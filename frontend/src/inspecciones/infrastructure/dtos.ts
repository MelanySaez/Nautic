import type {
  ActualizacionFoto,
  Deteccion,
  EstadoFoto,
  Foto,
  Inspeccion,
  InspeccionDetalle,
  PaginaInspecciones,
  SeccionCasco,
  Severidad,
  TipoClase,
} from '../domain/inspeccion'
import type { BorradorReporte, CambiosReporte, TextosReporte } from '../domain/reporte'
import type { DetallePorInstancia } from '../domain/detecciones'
import type { ModeloIA } from '../domain/modelo'

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
  /** Taxonomy added by the backend at read time; absent on older servers. */
  etiqueta?: string
  tipo?: TipoClase | null
  severidad?: Severidad | null
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
  modelo: string | null
  modelo_version: string | null
  taxonomia_version: string | null
  /** Absent on servers older than the raw detections endpoint. */
  detalle_disponible?: boolean
  fecha_creacion: string
}

export interface InspeccionDto {
  id: number
  buque_id: number
  buque_nombre: string
  nombre: string
  severidad_max: Severidad | null
  descripcion: string
  tomado_por: string
  fecha_creacion: string
  fecha_modificacion: string
  total_fotos: number
}

/** Page of `GET /api/vision/inspecciones/` (cursor pagination, no total). */
export interface ListaInspeccionesDto {
  resultados: InspeccionDto[]
  siguiente: string | null
  hay_mas: boolean
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
  modelo: string | null
  modelo_version: string | null
  taxonomia_version: string | null
  detalle_disponible?: boolean
}

export interface ModeloDto {
  id: string
  label: string
  descripcion: string
  arquitectura: string
  version: string
  produce_mascaras: boolean
  confianza_por_defecto: number
  por_defecto: boolean
  disponible: boolean
}

/** Body of `GET /api/vision/modelos/`. */
export interface ModelosDto {
  modelos: ModeloDto[]
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
  return (dtos ?? []).map((d) => ({
    clase: d.class_name,
    etiqueta: d.etiqueta ?? d.class_name.replace(/_/g, ' '),
    tipo: d.tipo ?? null,
    severidad: d.severidad ?? null,
    cantidad: d.count,
    confianzaMaxima: d.max_confidence,
  }))
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
    modelo: dto.modelo,
    modeloVersion: dto.modelo_version,
    taxonomiaVersion: dto.taxonomia_version,
    detalleDisponible: dto.detalle_disponible ?? false,
    fechaCreacion: dto.fecha_creacion,
  }
}

export function aInspeccion(dto: InspeccionDto): Inspeccion {
  return {
    id: dto.id,
    buqueId: dto.buque_id,
    buqueNombre: dto.buque_nombre,
    nombre: dto.nombre,
    severidadMax: dto.severidad_max,
    descripcion: dto.descripcion,
    tomadoPor: dto.tomado_por,
    fechaCreacion: dto.fecha_creacion,
    fechaModificacion: dto.fecha_modificacion,
    totalFotos: dto.total_fotos,
  }
}

export function aPagina(dto: ListaInspeccionesDto): PaginaInspecciones {
  return { resultados: dto.resultados.map(aInspeccion), siguiente: dto.siguiente, hayMas: dto.hay_mas }
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
    modelo: dto.modelo,
    modeloVersion: dto.modelo_version,
    taxonomiaVersion: dto.taxonomia_version,
    detalleDisponible: dto.detalle_disponible ?? false,
  }
}

export function aModelo(dto: ModeloDto): ModeloIA {
  return {
    id: dto.id,
    label: dto.label,
    descripcion: dto.descripcion,
    arquitectura: dto.arquitectura,
    version: dto.version,
    produceMascaras: dto.produce_mascaras,
    confianzaPorDefecto: dto.confianza_por_defecto,
    porDefecto: dto.por_defecto,
    disponible: dto.disponible,
  }
}

/** Payload of `GET /api/vision/fotos/<id>/detecciones/`: every instance of the last analysis. */
export interface DetallePorInstanciaDto {
  ancho: number
  alto: number
  detecciones: {
    clase: string
    etiqueta: string
    tipo: TipoClase | null
    severidad: Severidad | null
    color: string | null
    confianza: number
    bbox: { x1: number; y1: number; x2: number; y2: number }
    /** COCO RLE: `size` is `[height, width]`. */
    mascara: { size: [number, number]; counts: number[] } | null
  }[]
}

export function aDetallePorInstancia(dto: DetallePorInstanciaDto): DetallePorInstancia {
  return {
    ancho: dto.ancho,
    alto: dto.alto,
    instancias: dto.detecciones.map((d) => ({
      clase: d.clase,
      etiqueta: d.etiqueta,
      tipo: d.tipo,
      severidad: d.severidad,
      color: d.color,
      confianza: d.confianza,
      caja: d.bbox,
      mascara: d.mascara ? { alto: d.mascara.size[0], ancho: d.mascara.size[1], conteos: d.mascara.counts } : null,
    })),
  }
}

export interface HallazgoRevisableDto {
  clase: string
  etiqueta: string
  severidad: Severidad | null
  total: number
  confianza_max: number | null
  descartado: boolean
}

export interface BorradorReporteDto {
  conclusion: string
  observaciones: string
  recomendaciones: string
  inspector_nombre: string
  inspector_cargo: string
  actualizado: string | null
  fotos: {
    foto_id: number
    seccion: { codigo: string; nombre: string }
    imagen: string | null
    severidad: Severidad | null
    nota: string
    hallazgos: HallazgoRevisableDto[]
  }[]
}

export function aBorradorReporte(dto: BorradorReporteDto): BorradorReporte {
  return {
    conclusion: dto.conclusion,
    observaciones: dto.observaciones,
    recomendaciones: dto.recomendaciones,
    inspectorNombre: dto.inspector_nombre,
    inspectorCargo: dto.inspector_cargo,
    actualizado: dto.actualizado,
    fotos: dto.fotos.map((f) => ({
      fotoId: f.foto_id,
      seccion: f.seccion,
      imagen: f.imagen,
      severidad: f.severidad,
      nota: f.nota,
      hallazgos: f.hallazgos.map((h) => ({
        clase: h.clase,
        etiqueta: h.etiqueta,
        severidad: h.severidad,
        total: h.total,
        confianzaMaxima: h.confianza_max,
        descartado: h.descartado,
      })),
    })),
  }
}

const TEXTOS_REPORTE = {
  conclusion: 'conclusion',
  observaciones: 'observaciones',
  recomendaciones: 'recomendaciones',
  inspectorNombre: 'inspector_nombre',
  inspectorCargo: 'inspector_cargo',
} as const satisfies Record<keyof TextosReporte, string>

/** PATCH body: only the given texts and photo reviews, in snake_case. */
export function aCambiosReporteDto(cambios: CambiosReporte): Record<string, unknown> {
  const dto: Record<string, unknown> = {}
  for (const [clave, campo] of Object.entries(TEXTOS_REPORTE)) {
    const valor = cambios[clave as keyof TextosReporte]
    if (valor !== undefined) dto[campo] = valor
  }
  if (cambios.fotos !== undefined) {
    dto.fotos = cambios.fotos.map((f) => ({ foto_id: f.fotoId, descartadas: f.descartadas, nota: f.nota }))
  }
  return dto
}
