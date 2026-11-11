import { ApiClient, type Fetcher } from '../../shared/http/apiClient'
import type {
  Buque,
  BuqueConInspecciones,
  BuqueDetalle,
  BuquesRepository,
  CambiosBuque,
  NuevoBuque,
} from '../domain/buque'
import {
  aBuque,
  aBuqueConInspecciones,
  aBuqueDetalle,
  aCambiosBuqueDto,
  aNuevoBuqueDto,
  type BuqueConInspeccionesDto,
  type BuqueDetalleDto,
  type BuqueResumenDto,
  type ListaBuquesDto,
} from './dtos'

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
    return this.recorrer('', aBuque)
  }

  async listarConInspecciones(): Promise<BuqueConInspecciones[]> {
    return this.recorrer<BuqueConInspeccionesDto, BuqueConInspecciones>('con_inspecciones=1&', aBuqueConInspecciones)
  }

  private async recorrer<D extends BuqueResumenDto, T>(filtro: string, mapear: (dto: D) => T): Promise<T[]> {
    const buques: T[] = []
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const lista = await this.api.get<ListaBuquesDto<D>>(
        `/api/buques/?${filtro}offset=${buques.length}&limit=${TAMANO_PAGINA}`,
      )
      buques.push(...lista.resultados.map(mapear))
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

  async actualizar(id: number, cambios: CambiosBuque): Promise<BuqueDetalle> {
    return aBuqueDetalle(await this.api.patch<BuqueDetalleDto>(`/api/buques/${id}/`, aCambiosBuqueDto(cambios)))
  }
}
