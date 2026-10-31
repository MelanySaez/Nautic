import type { Buque } from '../domain/buque'

const FECHA = '2026-01-01T00:00:00'
const RESUMEN = { etapa: 'Activo', imagen: null, createdAt: FECHA, updatedAt: FECHA }

/**
 * Development seed for the in-memory vessel adapter.
 * The ids MUST match rows of the backend `buques` table: creating an inspection sends
 * `buque_id`, and the API answers 404 for an unknown vessel.
 */
export const BUQUES_SEMILLA: readonly Buque[] = [
  { id: 1, nombre: 'Buque 1', tipo: 'Patrullero', ...RESUMEN },
  { id: 2, nombre: 'Buque 2', tipo: 'Corbeta', ...RESUMEN },
]
