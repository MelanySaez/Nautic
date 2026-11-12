import { ApiClient, type Fetcher } from '../../shared/http/apiClient'
import type { MiembrosInspeccion } from '../application/puertos'
import type { CambiosMiembro, Miembro, NuevoMiembro } from '../domain/miembros'
import { aCambiosMiembroDto, aMiembro, type MiembroDto } from './dtos'

export class HttpMiembrosRepository implements MiembrosInspeccion {
  private readonly api: ApiClient

  constructor(baseUrl: string, fetcher?: Fetcher) {
    this.api = new ApiClient(baseUrl, fetcher)
  }

  async listar(inspeccionId: number): Promise<Miembro[]> {
    const dtos = await this.api.get<MiembroDto[]>(`/api/vision/inspecciones/${inspeccionId}/miembros/`)
    return dtos.map(aMiembro)
  }

  async invitar(inspeccionId: number, datos: NuevoMiembro): Promise<Miembro> {
    return aMiembro(
      await this.api.post<MiembroDto>(`/api/vision/inspecciones/${inspeccionId}/miembros/`, {
        email: datos.email.trim(),
        rol: datos.rol,
      }),
    )
  }

  async actualizar(inspeccionId: number, miembroId: number, cambios: CambiosMiembro): Promise<Miembro> {
    return aMiembro(
      await this.api.patch<MiembroDto>(
        `/api/vision/inspecciones/${inspeccionId}/miembros/${miembroId}/`,
        aCambiosMiembroDto(cambios),
      ),
    )
  }

  quitar(inspeccionId: number, miembroId: number): Promise<void> {
    return this.api.delete(`/api/vision/inspecciones/${inspeccionId}/miembros/${miembroId}/`)
  }
}
