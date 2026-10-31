import { ApiClient, type Fetcher } from '../../shared/http/apiClient'
import type { Buque, BuqueDetalle, BuquesRepository, NuevoBuque } from '../domain/buque'
import { aBuque, aBuqueDetalle, aNuevoBuqueDto, type BuqueDetalleDto, type ListaBuquesDto } from './dtos'

// The API caps `limit` at 200.
const TAMANO_PAGINA = 200
// Guards against a server that never reaches `total`.
const MAX_PAGINAS = 100

export class HttpBuquesRepository implements BuquesRepository {
  private readonly api: ApiClient

  constructor(baseUrl: string, fetcher?: Fetcher) {
    this.api = new ApiClient(baseUrl, fetcher)
  }

  async listar(): Promise<Buque[]> {
    // Walks every page so the vessel selector keeps receiving the complete fleet.
    const buques: Buque[] = []
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const lista: ListaBuquesDto = await this.api.get<ListaBuquesDto>(
        `/api/buques/?offset=${buques.length}&limit=${TAMANO_PAGINA}`,
      )
      buques.push(...lista.resultados.map(aBuque))
      if (lista.resultados.length === 0 || buques.length >= lista.total) break
    }
    return buques
  }

  async obtener(id: number): Promise<BuqueDetalle> {
    return aBuqueDetalle(await this.api.get<BuqueDetalleDto>(`/api/buques/${id}/`))
  }

  async crear(datos: NuevoBuque): Promise<BuqueDetalle> {
    return aBuqueDetalle(await this.api.post<BuqueDetalleDto>('/api/buques/', aNuevoBuqueDto(datos)))
  }
}
