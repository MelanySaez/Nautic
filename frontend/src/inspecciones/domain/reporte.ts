import type { Severidad } from './inspeccion'

/** One anomaly class of a photo, as the inspector reviews it. */
export interface HallazgoRevisable {
  clase: string
  etiqueta: string
  severidad: Severidad | null
  total: number
  confianzaMaxima: number | null
  /** The inspector dismissed it as a false positive: it is left out of the PDF. */
  descartado: boolean
}

/** Analyzed photo with at least one anomaly, with the inspector's review. */
export interface FotoRevisable {
  fotoId: number
  seccion: { codigo: string; nombre: string }
  imagen: string | null
  severidad: Severidad | null
  nota: string
  hallazgos: HallazgoRevisable[]
}

export interface TextosReporte {
  conclusion: string
  observaciones: string
  recomendaciones: string
  inspectorNombre: string
  inspectorCargo: string
}

/** Editable draft of an inspection report; `actualizado` is null until the first save. */
export interface BorradorReporte extends TextosReporte {
  actualizado: string | null
  fotos: FotoRevisable[]
}

/** Review of one photo: `descartadas` replaces the dismissed classes. */
export interface ValidacionFoto {
  fotoId: number
  descartadas: string[]
  nota: string
}

/** Partial update: only the given texts and photos change. */
export type CambiosReporte = Partial<TextosReporte> & { fotos?: ValidacionFoto[] }

const CLAVES_TEXTO: (keyof TextosReporte)[] = [
  'conclusion',
  'observaciones',
  'recomendaciones',
  'inspectorNombre',
  'inspectorCargo',
]

/** Editable state of the draft: trimmed only when saving. */
export interface EdicionReporte {
  textos: TextosReporte
  fotos: ValidacionFoto[]
}

export function edicionDesde(borrador: BorradorReporte): EdicionReporte {
  return {
    textos: Object.fromEntries(CLAVES_TEXTO.map((c) => [c, borrador[c]])) as unknown as TextosReporte,
    fotos: borrador.fotos.map((f) => ({
      fotoId: f.fotoId,
      descartadas: f.hallazgos.filter((h) => h.descartado).map((h) => h.clase),
      nota: f.nota,
    })),
  }
}

function mismasClases(a: string[], b: string[]): boolean {
  const otras = new Set(b)
  return a.length === otras.size && a.every((c) => otras.has(c))
}

/** Only what differs from the saved draft: trimmed texts and the photos whose review changed. */
export function cambiosDeReporte(guardado: BorradorReporte, edicion: EdicionReporte): CambiosReporte {
  const base = edicionDesde(guardado)
  const cambios: CambiosReporte = {}
  for (const clave of CLAVES_TEXTO) {
    const valor = edicion.textos[clave].trim()
    if (valor !== base.textos[clave].trim()) cambios[clave] = valor
  }
  const fotos = edicion.fotos
    .filter((f) => {
      const previa = base.fotos.find((b) => b.fotoId === f.fotoId)
      return !previa || !mismasClases(previa.descartadas, f.descartadas) || previa.nota.trim() !== f.nota.trim()
    })
    .map((f) => ({ ...f, nota: f.nota.trim() }))
  if (fotos.length > 0) cambios.fotos = fotos
  return cambios
}
