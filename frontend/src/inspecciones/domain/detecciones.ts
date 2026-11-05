import type { Severidad, TipoClase } from './inspeccion'

/** Uncompressed COCO RLE: run lengths over the mask read column by column, starting with a run of zeros. */
export interface MascaraRle {
  alto: number
  ancho: number
  conteos: number[]
}

/** One detected instance of the last analysis, in pixels of the original image. */
export interface Instancia {
  clase: string
  etiqueta: string
  tipo: TipoClase | null
  severidad: Severidad | null
  /** `#rrggbb` the vision library uses for the class on the annotated image; null when unknown. */
  color: string | null
  confianza: number
  caja: { x1: number; y1: number; x2: number; y2: number }
  /** null for models that only produce boxes. */
  mascara: MascaraRle | null
}

export interface DetallePorInstancia {
  ancho: number
  alto: number
  instancias: Instancia[]
}

/** Row-major `alto x ancho` array with 1 where the mask is set. Throws when the counts do not cover the mask. */
export function decodificarRle({ alto, ancho, conteos }: MascaraRle): Uint8Array {
  const total = alto * ancho
  if (conteos.reduce((suma, n) => suma + n, 0) !== total) {
    throw new Error('La máscara no coincide con su tamaño.')
  }
  const mascara = new Uint8Array(total)
  let posicion = 0
  conteos.forEach((largo, indice) => {
    if (indice % 2 === 1) {
      for (let k = posicion; k < posicion + largo; k++) {
        // k walks the mask column by column: column k / alto, row k % alto.
        mascara[(k % alto) * ancho + Math.floor(k / alto)] = 1
      }
    }
    posicion += largo
  })
  return mascara
}
