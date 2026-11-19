import {
  BUQUE_ANFIBIO,
  BUQUE_DE_GUERRA,
  BUQUE_LOGISTICO,
  CORBETA,
  DESTRUCTOR,
  FRAGATA,
  PATRULLERA,
  type Arquetipo,
} from './casco/arquetipo'

/** A vessel type the forms offer. The backend stores its `nombre` as the vessel's `tipo`. */
export interface TipoBuque {
  id: string
  nombre: string
  arquetipo: Arquetipo
}

export const TIPOS_BUQUE: readonly TipoBuque[] = [
  { id: 'fragata', nombre: 'Fragata', arquetipo: FRAGATA },
  { id: 'corbeta', nombre: 'Corbeta', arquetipo: CORBETA },
  { id: 'patrullera', nombre: 'Patrullera', arquetipo: PATRULLERA },
  { id: 'destructor', nombre: 'Destructor', arquetipo: DESTRUCTOR },
  { id: 'buque-anfibio', nombre: 'Buque anfibio', arquetipo: BUQUE_ANFIBIO },
  { id: 'buque-logistico', nombre: 'Buque logístico', arquetipo: BUQUE_LOGISTICO },
]

/** Lower case, without accents or surrounding blanks: how stored types are compared. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()
}

/** The catalogue type of a stored `tipo`, or null for free text from before the catalogue. */
export function tipoBuqueDe(tipo: string): TipoBuque | null {
  const buscado = normalizar(tipo)
  return TIPOS_BUQUE.find((t) => normalizar(t.nombre) === buscado) ?? null
}

/** Hull shape for a stored `tipo`: its type's archetype, or the generic warship. */
export function arquetipoDeBuque(tipo: string): Arquetipo {
  return tipoBuqueDe(tipo)?.arquetipo ?? BUQUE_DE_GUERRA
}
