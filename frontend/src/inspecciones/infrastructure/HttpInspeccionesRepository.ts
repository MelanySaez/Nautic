import { ApiClient, type Fetcher } from '../../shared/http/apiClient'
import type { InspeccionesRepository, ResultadoAnalisis } from '../application/puertos'
import type {
  FiltroInspecciones,
  Foto,
  Inspeccion,
  InspeccionDetalle,
  NuevaInspeccion,
  PaginaInspecciones,
  SeccionCasco,
} from '../domain/inspeccion'
import {
  aFoto,
  aInspeccion,
  aInspeccionDetalle,
  aPagina,
  aSeccion,
  type FotoDto,
  type InspeccionDetalleDto,
  type InspeccionDto,
  type ListaInspeccionesDto,
  type SeccionDto,
} from './dtos'

// Divisible by the 2- and 3-column card grids; the backend accepts 1-100.
const TAMANO_PAGINA = 24

export class HttpInspeccionesRepository implements InspeccionesRepository {
  private readonly api: ApiClient

  constructor(baseUrl: string, fetcher?: Fetcher) {
    this.api = new ApiClient(baseUrl, fetcher)
  }

  async buscar(filtro: FiltroInspecciones, cursor?: string): Promise<PaginaInspecciones> {
    const consulta = new URLSearchParams()
    if (filtro.buqueId !== undefined) consulta.set('buque', String(filtro.buqueId))
    if (filtro.desde) consulta.set('desde', filtro.desde)
    if (filtro.hasta) consulta.set('hasta', filtro.hasta)
    if (filtro.severidadMin) consulta.set('severidad_min', filtro.severidadMin)
    if (filtro.q?.trim()) consulta.set('q', filtro.q.trim())
    consulta.set('limit', String(TAMANO_PAGINA))
    if (cursor) consulta.set('cursor', cursor)
    return aPagina(await this.api.get<ListaInspeccionesDto>(`/api/vision/inspecciones/?${consulta}`))
  }

  async obtener(id: number): Promise<InspeccionDetalle> {
    return aInspeccionDetalle(await this.api.get<InspeccionDetalleDto>(`/api/vision/inspecciones/${id}/`))
  }

  async crear(datos: NuevaInspeccion): Promise<Inspeccion> {
    const dto = await this.api.post<InspeccionDto>('/api/vision/inspecciones/', {
      buque_id: datos.buqueId,
      // Omitted when blank so the backend generates the default name.
      ...(datos.nombre?.trim() ? { nombre: datos.nombre.trim() } : {}),
      tomado_por: datos.tomadoPor,
      descripcion: datos.descripcion,
    })
    return aInspeccion(dto)
  }

  async renombrar(id: number, nombre: string): Promise<Inspeccion> {
    return aInspeccion(await this.api.patch<InspeccionDto>(`/api/vision/inspecciones/${id}/`, { nombre: nombre.trim() }))
  }

  eliminar(id: number): Promise<void> {
    return this.api.delete(`/api/vision/inspecciones/${id}/`)
  }

  async listarSecciones(buqueId: number): Promise<SeccionCasco[]> {
    const dtos = await this.api.get<SeccionDto[]>(`/api/vision/secciones/?buque=${buqueId}`)
    return dtos.map(aSeccion)
  }

  async subirFoto(inspeccionId: number, seccionId: number, imagen: File): Promise<Foto> {
    const formulario = new FormData()
    formulario.append('imagen', imagen)
    formulario.append('seccion_id', String(seccionId))
    return aFoto(await this.api.post<FotoDto>(`/api/vision/inspecciones/${inspeccionId}/fotos/`, formulario))
  }

  async analizar(inspeccionId: number, modeloId?: string): Promise<ResultadoAnalisis> {
    const dto = await this.api.post<{ iniciadas: number; omitidas_por_limite: number }>(
      `/api/vision/inspecciones/${inspeccionId}/analizar/`,
      modeloId ? { modelo: modeloId } : undefined,
    )
    return { iniciadas: dto.iniciadas, omitidasPorLimite: dto.omitidas_por_limite }
  }

  async reintentarFoto(fotoId: number, modeloId?: string): Promise<Foto> {
    return aFoto(await this.api.post<FotoDto>(`/api/vision/fotos/${fotoId}/`, modeloId ? { modelo: modeloId } : undefined))
  }

  eliminarFoto(fotoId: number): Promise<void> {
    return this.api.delete(`/api/vision/fotos/${fotoId}/`)
  }
}
