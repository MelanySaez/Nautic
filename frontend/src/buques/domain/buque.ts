export interface Buque {
  id: number
  nombre: string
  tipo: string
}

export interface BuquesRepository {
  listar(): Promise<Buque[]>
}
