import type { DatosTecnicosBuque } from './buque'

export interface CampoTecnico {
  clave: keyof DatosTecnicosBuque
  /** Snake_case name used by the API in `campos` error keys. */
  claveApi: string
  etiqueta: string
  unidad: string
  /** The backend rejects fractions on these fields. */
  entero?: boolean
}

export interface GrupoTecnico {
  titulo: string
  campos: CampoTecnico[]
}

/** Optional measures of the technical sheet, grouped the same way in the form and in the detail. */
export const GRUPOS_TECNICOS: GrupoTecnico[] = [
  {
    titulo: 'Dimensiones',
    campos: [
      { clave: 'esloraTotalM', claveApi: 'eslora_total_m', etiqueta: 'Eslora total', unidad: 'm' },
      { clave: 'mangaMoldeadaM', claveApi: 'manga_moldeada_m', etiqueta: 'Manga moldeada', unidad: 'm' },
      { clave: 'puntalM', claveApi: 'puntal_m', etiqueta: 'Puntal', unidad: 'm' },
      { clave: 'caladoDisenoM', claveApi: 'calado_diseno_m', etiqueta: 'Calado de diseño', unidad: 'm' },
      { clave: 'desplazamientoTon', claveApi: 'desplazamiento_ton', etiqueta: 'Desplazamiento', unidad: 'ton' },
    ],
  },
  {
    titulo: 'Desempeño',
    campos: [
      { clave: 'velMaximaNudos', claveApi: 'vel_maxima_nudos', etiqueta: 'Velocidad máxima', unidad: 'nudos' },
      { clave: 'alcanceNmA12kn', claveApi: 'alcance_nm_a_12kn', etiqueta: 'Alcance a 12 nudos', unidad: 'nm' },
      { clave: 'autonomiaHoras', claveApi: 'autonomia_horas', etiqueta: 'Autonomía', unidad: 'h', entero: true },
      { clave: 'autonomiaDias', claveApi: 'autonomia_dias', etiqueta: 'Autonomía', unidad: 'días', entero: true },
      { clave: 'vidaDisenoAnios', claveApi: 'vida_diseno_anios', etiqueta: 'Vida de diseño', unidad: 'años', entero: true },
      {
        clave: 'horasNavegacionAnio',
        claveApi: 'horas_navegacion_anio',
        etiqueta: 'Horas de navegación al año',
        unidad: 'h',
        entero: true,
      },
    ],
  },
  {
    titulo: 'Capacidades',
    campos: [
      { clave: 'combustibleDiarioM3', claveApi: 'combustible_diario_m3', etiqueta: 'Combustible diario', unidad: 'm³' },
      { clave: 'combustibleDieselM3', claveApi: 'combustible_diesel_m3', etiqueta: 'Combustible diésel', unidad: 'm³' },
      {
        clave: 'combustibleHelicopteroM3',
        claveApi: 'combustible_helicoptero_m3',
        etiqueta: 'Combustible de helicóptero',
        unidad: 'm³',
      },
      { clave: 'gasolinaBotesM3', claveApi: 'gasolina_botes_m3', etiqueta: 'Gasolina para botes', unidad: 'm³' },
      { clave: 'aguaPotableM3', claveApi: 'agua_potable_m3', etiqueta: 'Agua potable', unidad: 'm³' },
      { clave: 'aceiteLubricanteM3', claveApi: 'aceite_lubricante_m3', etiqueta: 'Aceite lubricante', unidad: 'm³' },
      { clave: 'aceiteHidraulicoM3', claveApi: 'aceite_hidraulico_m3', etiqueta: 'Aceite hidráulico', unidad: 'm³' },
    ],
  },
]

export function etiquetaDeCampo(campo: CampoTecnico): string {
  return `${campo.etiqueta} (${campo.unidad})`
}
