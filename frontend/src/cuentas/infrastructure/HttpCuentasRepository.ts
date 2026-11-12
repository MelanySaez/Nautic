import { alNoAutorizado, ApiClient, ApiError, type Fetcher, type LectorCookies } from '../../shared/http/apiClient'
import type { CuentasRepository, DatosRegistro, Usuario } from '../domain/usuario'
import { aRegistroDto, aUsuario, type UsuarioDto } from './dtos'

export class HttpCuentasRepository implements CuentasRepository {
  private readonly api: ApiClient

  constructor(baseUrl: string, fetcher?: Fetcher, leerCookies?: LectorCookies) {
    this.api = new ApiClient(baseUrl, fetcher, leerCookies)
  }

  async obtenerActual(): Promise<Usuario | null> {
    try {
      return aUsuario(await this.api.get<UsuarioDto>('/api/auth/yo/'))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  }

  async iniciarSesion(email: string, password: string): Promise<Usuario> {
    // Without a session there is no CSRF cookie yet, and Django rejects the POST without one.
    await this.api.prepararCsrf()
    return aUsuario(await this.api.post<UsuarioDto>('/api/auth/login/', { email: email.trim(), password }))
  }

  async registrarse(datos: DatosRegistro): Promise<Usuario> {
    await this.api.prepararCsrf()
    return aUsuario(await this.api.post<UsuarioDto>('/api/auth/registro/', aRegistroDto(datos)))
  }

  cerrarSesion(): Promise<void> {
    return this.api.post<void>('/api/auth/logout/')
  }

  alExpirarSesion(oyente: () => void): () => void {
    return alNoAutorizado(oyente)
  }
}
