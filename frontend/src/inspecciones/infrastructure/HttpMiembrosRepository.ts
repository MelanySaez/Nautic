import { ApiClient, type Fetcher } from '../../shared/http/apiClient'
import type { MiembrosInspeccion } from '../application/puertos'
import type { CambiosMiembro, Miembro, NuevoMiembro, PersonaSugerida } from '../domain/miembros'
import { aCambiosMiembroDto, aMiembro, aNuevoMiembroDto, type MiembroDto } from './dtos'

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
      await this.api.post<MiembroDto>(`/api/vision/inspecciones/${inspeccionId}/miembros/`, aNuevoMiembroDto(datos)),
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

  async buscarUsuarios(texto: string): Promise<PersonaSugerida[]> {
    const consulta = new URLSearchParams({ q: texto.trim() })
    // The wire shape is already {id, nombre, cargo}: the server never sends emails here.
    const { resultados } = await this.api.get<{ resultados: PersonaSugerida[] }>(`/api/auth/usuarios/?${consulta}`)
    return resultados.map(({ id, nombre, cargo }) => ({ id, nombre, cargo }))
  }
}
