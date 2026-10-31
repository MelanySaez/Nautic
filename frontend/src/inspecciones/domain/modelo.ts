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
