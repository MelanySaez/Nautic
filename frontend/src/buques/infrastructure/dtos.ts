import type { Buque, BuqueDetalle, NuevoBuque } from '../domain/buque'

export interface BuqueResumenDto {
  id: number
  nombre: string
  tipo: string
  etapa: string
  imagen: string | null
  created_at: string
  updated_at: string
}

export interface BuqueDetalleDto extends BuqueResumenDto {
  descripcion: string
  autonomia_horas: number | null
  vida_diseno_anios: number | null
  horas_navegacion_anio: number | null
  autonomia_dias: number | null
  vel_maxima_nudos: number | null
  alcance_nm_a_12kn: number | null
  eslora_total_m: number | null
  manga_moldeada_m: number | null
  puntal_m: number | null
  calado_diseno_m: number | null
  desplazamiento_ton: number | null
  combustible_diario_m3: number | null
  combustible_diesel_m3: number | null
  combustible_helicoptero_m3: number | null
  gasolina_botes_m3: number | null
  agua_potable_m3: number | null
  aceite_lubricante_m3: number | null
  aceite_hidraulico_m3: number | null
  rondas_config: Record<string, unknown>
  contexto_operacional: Record<string, unknown>
  documentos: unknown[]
  misiones: unknown[]
  grupos_constructivos: unknown[]
}

export interface ListaBuquesDto {
  total: number
  offset: number
  limit: number
  resultados: BuqueResumenDto[]
}

export function aBuque(dto: BuqueResumenDto): Buque {
  return {
    id: dto.id,
    nombre: dto.nombre,
    tipo: dto.tipo,
    etapa: dto.etapa,
    imagen: dto.imagen,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

export function aBuqueDetalle(dto: BuqueDetalleDto): BuqueDetalle {
  return {
    ...aBuque(dto),
    descripcion: dto.descripcion,
    autonomiaHoras: dto.autonomia_horas,
    vidaDisenoAnios: dto.vida_diseno_anios,
    horasNavegacionAnio: dto.horas_navegacion_anio,
    autonomiaDias: dto.autonomia_dias,
    velMaximaNudos: dto.vel_maxima_nudos,
    alcanceNmA12kn: dto.alcance_nm_a_12kn,
    esloraTotalM: dto.eslora_total_m,
    mangaMoldeadaM: dto.manga_moldeada_m,
    puntalM: dto.puntal_m,
    caladoDisenoM: dto.calado_diseno_m,
    desplazamientoTon: dto.desplazamiento_ton,
    combustibleDiarioM3: dto.combustible_diario_m3,
    combustibleDieselM3: dto.combustible_diesel_m3,
    combustibleHelicopteroM3: dto.combustible_helicoptero_m3,
    gasolinaBotesM3: dto.gasolina_botes_m3,
    aguaPotableM3: dto.agua_potable_m3,
    aceiteLubricanteM3: dto.aceite_lubricante_m3,
    aceiteHidraulicoM3: dto.aceite_hidraulico_m3,
    rondasConfig: dto.rondas_config,
    contextoOperacional: dto.contexto_operacional,
    documentos: dto.documentos,
    misiones: dto.misiones,
    gruposConstructivos: dto.grupos_constructivos,
  }
}

/** camelCase domain key -> snake_case wire key, for every optional creation field. */
const CAMPOS_OPCIONALES = {
  descripcion: 'descripcion',
  etapa: 'etapa',
  imagen: 'imagen',
  autonomiaHoras: 'autonomia_horas',
  vidaDisenoAnios: 'vida_diseno_anios',
  horasNavegacionAnio: 'horas_navegacion_anio',
  autonomiaDias: 'autonomia_dias',
  velMaximaNudos: 'vel_maxima_nudos',
  alcanceNmA12kn: 'alcance_nm_a_12kn',
  esloraTotalM: 'eslora_total_m',
  mangaMoldeadaM: 'manga_moldeada_m',
  puntalM: 'puntal_m',
  caladoDisenoM: 'calado_diseno_m',
  desplazamientoTon: 'desplazamiento_ton',
  combustibleDiarioM3: 'combustible_diario_m3',
  combustibleDieselM3: 'combustible_diesel_m3',
  combustibleHelicopteroM3: 'combustible_helicoptero_m3',
  gasolinaBotesM3: 'gasolina_botes_m3',
  aguaPotableM3: 'agua_potable_m3',
  aceiteLubricanteM3: 'aceite_lubricante_m3',
  aceiteHidraulicoM3: 'aceite_hidraulico_m3',
  rondasConfig: 'rondas_config',
  contextoOperacional: 'contexto_operacional',
  documentos: 'documentos',
  misiones: 'misiones',
  gruposConstructivos: 'grupos_constructivos',
} as const satisfies Record<keyof Omit<NuevoBuque, 'nombre' | 'tipo'>, string>

/**
 * Builds the POST body. Undefined optionals are omitted so the backend applies its defaults;
 * blank strings are omitted too (the API rejects a blank `etapa`). `null` is kept: it is a
 * valid explicit value for the nullable measures and for `imagen`.
 */
export function aNuevoBuqueDto(datos: NuevoBuque): Record<string, unknown> {
  const dto: Record<string, unknown> = { nombre: datos.nombre, tipo: datos.tipo }
  for (const [clave, campo] of Object.entries(CAMPOS_OPCIONALES)) {
    const valor = datos[clave as keyof typeof CAMPOS_OPCIONALES]
    if (valor === undefined || valor === '') continue
    dto[campo] = valor
  }
  return dto
}
