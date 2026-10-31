import { ApiClient, type Fetcher } from '../../shared/http/apiClient'
import type { ModelosIA } from '../application/puertos'
import type { ModeloIA } from '../domain/modelo'
import { aModelo, type ModelosDto } from './dtos'

export class HttpModelosIARepository implements ModelosIA {
  private readonly api: ApiClient

  constructor(baseUrl: string, fetcher?: Fetcher) {
    this.api = new ApiClient(baseUrl, fetcher)
  }

  async listar(): Promise<ModeloIA[]> {
    const { modelos } = await this.api.get<ModelosDto>('/api/vision/modelos/')
    return modelos.map(aModelo)
  }
}
