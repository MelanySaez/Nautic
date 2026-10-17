import { ApiClient, type Fetcher } from '../../shared/http/apiClient'
import type { InspeccionesRepository, ResultadoAnalisis } from '../application/puertos'
import type { Foto, Inspeccion, InspeccionDetalle, NuevaInspeccion, SeccionCasco } from '../domain/inspeccion'
import {
  aFoto,
  aInspeccion,
  aInspeccionDetalle,
  aSeccion,
  type FotoDto,
  type InspeccionDetalleDto,
  type InspeccionDto,
  type SeccionDto,
} from './dtos'

export class HttpInspeccionesRepository implements InspeccionesRepository {
  private readonly api: ApiClient

  constructor(baseUrl: string, fetcher?: Fetcher) {
    this.api = new ApiClient(baseUrl, fetcher)
  }

  async listar(): Promise<Inspeccion[]> {
    const dtos = await this.api.get<InspeccionDto[]>('/api/vision/inspecciones/')
    return dtos.map(aInspeccion)
  }

  async obtener(id: number): Promise<InspeccionDetalle> {
    return aInspeccionDetalle(await this.api.get<InspeccionDetalleDto>(`/api/vision/inspecciones/${id}/`))
  }

  async crear(datos: NuevaInspeccion): Promise<Inspeccion> {
    const dto = await this.api.post<InspeccionDto>('/api/vision/inspecciones/', {
      buque_id: datos.buqueId,
      tomado_por: datos.tomadoPor,
      descripcion: datos.descripcion,
    })
    return aInspeccion(dto)
  }

  eliminar(id: number): Promise<void> {
    return this.api.delete(`/api/vision/inspecciones/${id}/`)
  }

  async listarSecciones(): Promise<SeccionCasco[]> {
    const dtos = await this.api.get<SeccionDto[]>('/api/vision/secciones/')
    return dtos.map(aSeccion)
  }

  async subirFoto(inspeccionId: number, seccionId: number, imagen: File): Promise<Foto> {
    const formulario = new FormData()
    formulario.append('imagen', imagen)
    formulario.append('seccion_id', String(seccionId))
    return aFoto(await this.api.post<FotoDto>(`/api/vision/inspecciones/${inspeccionId}/fotos/`, formulario))
  }

  async analizar(inspeccionId: number): Promise<ResultadoAnalisis> {
    const dto = await this.api.post<{ iniciadas: number; omitidas_por_limite: number }>(
      `/api/vision/inspecciones/${inspeccionId}/analizar/`,
    )
    return { iniciadas: dto.iniciadas, omitidasPorLimite: dto.omitidas_por_limite }
  }

  async reintentarFoto(fotoId: number): Promise<Foto> {
    return aFoto(await this.api.post<FotoDto>(`/api/vision/fotos/${fotoId}/`))
  }

  eliminarFoto(fotoId: number): Promise<void> {
    return this.api.delete(`/api/vision/fotos/${fotoId}/`)
  }
}
