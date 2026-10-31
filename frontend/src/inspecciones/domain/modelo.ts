/** One AI model of the backend catalog, with its availability on this server. */
export interface ModeloIA {
  id: string
  label: string
  descripcion: string
  arquitectura: string
  version: string
  produceMascaras: boolean
  confianzaPorDefecto: number
  /** The model the server uses when a request does not choose one. */
  porDefecto: boolean
  /** False when its weights or Python dependencies are missing on the server. */
  disponible: boolean
}

/**
 * Model to preselect: the server default when usable, otherwise the first usable one.
 * Null when the catalog has no usable model, so the UI never offers an option the API would reject.
 */
export function modeloInicial(modelos: ModeloIA[]): ModeloIA | null {
  return modelos.find((m) => m.porDefecto && m.disponible) ?? modelos.find((m) => m.disponible) ?? null
}

/** "Label vX.Y.Z" for a photo's model; falls back to the raw id when the catalog does not list it. */
export function etiquetaModelo(modeloId: string | null, version: string | null, catalogo: ModeloIA[]): string | null {
  if (!modeloId) return null
  const etiqueta = catalogo.find((m) => m.id === modeloId)?.label ?? modeloId
  return version ? `${etiqueta} v${version}` : etiqueta
}
