import type { Buque, BuqueDetalle, BuquesRepository, NuevoBuque } from '../domain/buque'

/**
 * Temporary adapter: the backend has no vessel endpoints yet. Replace it with an HTTP
 * adapter implementing `BuquesRepository` once `/api/buques/` exists.
 */
export class EnMemoriaBuquesRepository implements BuquesRepository {
  private readonly buques: readonly Buque[]

  constructor(buques: readonly Buque[]) {
    this.buques = buques
  }

  async listar(): Promise<Buque[]> {
    return [...this.buques].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }

  async obtener(): Promise<BuqueDetalle> {
    throw new Error('The in-memory vessel adapter has no technical sheets.')
  }

  async crear(_datos: NuevoBuque): Promise<BuqueDetalle> {
    throw new Error('The in-memory vessel adapter cannot create vessels.')
  }
}
