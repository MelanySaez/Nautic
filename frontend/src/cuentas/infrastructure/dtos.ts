import type { DatosRegistro, Usuario } from '../domain/usuario'

/** Body of `GET /api/auth/yo/`, login and registration. */
export interface UsuarioDto {
  id: number
  email: string
  nombre: string
  cargo: string
  es_admin: boolean
}

export function aUsuario(dto: UsuarioDto): Usuario {
  return { id: dto.id, email: dto.email, nombre: dto.nombre, cargo: dto.cargo ?? '', esAdmin: dto.es_admin }
}

export function aRegistroDto(datos: DatosRegistro) {
  return { email: datos.email.trim(), password: datos.password, nombre: datos.nombre.trim(), cargo: datos.cargo?.trim() ?? '' }
}
