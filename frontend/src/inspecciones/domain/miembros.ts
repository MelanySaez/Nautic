/** `personalizado` means the permissions no longer match a template. */
export type RolMiembro = 'colaborador' | 'revisor' | 'observador' | 'personalizado'

/** Roles the leader can pick: each one sets a fixed group of permissions. */
export type RolPlantilla = Exclude<RolMiembro, 'personalizado'>

export const ROLES_PLANTILLA: { rol: RolPlantilla; etiqueta: string }[] = [
  { rol: 'colaborador', etiqueta: 'Colaborador' },
  { rol: 'revisor', etiqueta: 'Revisor' },
  { rol: 'observador', etiqueta: 'Observador' },
]

export const ETIQUETA_ROL: Record<RolMiembro, string> = {
  colaborador: 'Colaborador',
  revisor: 'Revisor',
  observador: 'Observador',
  personalizado: 'Personalizado',
}

export interface PermisosMiembro {
  subirFotos: boolean
  analizar: boolean
  editarReporte: boolean
  editarInspeccion: boolean
}

export const PERMISOS_MIEMBRO: { clave: keyof PermisosMiembro; etiqueta: string }[] = [
  { clave: 'subirFotos', etiqueta: 'Subir fotos' },
  { clave: 'analizar', etiqueta: 'Analizar' },
  { clave: 'editarReporte', etiqueta: 'Editar reporte' },
  { clave: 'editarInspeccion', etiqueta: 'Editar inspección' },
]

export interface Miembro {
  id: number
  usuario: { id: number; nombre: string; cargo: string }
  rol: RolMiembro
  permisos: PermisosMiembro
  fechaAgregado: string
}

/** A registered user suggested while typing who to invite: name and cargo only, never the email. */
export interface PersonaSugerida {
  id: number
  nombre: string
  cargo: string
}

/** Who is invited: an email typed by hand, or a user picked from the suggestions. */
export type Invitado = { email: string } | { usuarioId: number }

/** `permisos`, when sent, overrides the role template one by one (a custom role). */
export type NuevoMiembro = Invitado & { rol: RolPlantilla; permisos?: PermisosMiembro }

export const MENSAJE_ELIGE_PERSONA = 'Elige a alguien de la lista o escribe su email completo.'

/** The invitee of a person field: the picked user, else the typed email; null when it is neither. */
export function invitadoDe(texto: string, persona: PersonaSugerida | null): Invitado | null {
  if (persona) return { usuarioId: persona.id }
  const email = texto.trim()
  return email.includes('@') ? { email } : null
}

/** Permissions of each role template; mirrors `InspeccionMiembro.ROLES` in the backend. */
export const PERMISOS_ROL: Record<RolPlantilla, PermisosMiembro> = {
  colaborador: { subirFotos: true, analizar: true, editarReporte: true, editarInspeccion: true },
  revisor: { subirFotos: false, analizar: false, editarReporte: true, editarInspeccion: false },
  observador: { subirFotos: false, analizar: false, editarReporte: false, editarInspeccion: false },
}

/** The role a set of permissions means, as the backend derives it: a template or `personalizado`. */
export function rolDe(permisos: PermisosMiembro): RolMiembro {
  const coincide = (Object.keys(PERMISOS_ROL) as RolPlantilla[]).find((rol) =>
    PERMISOS_MIEMBRO.every(({ clave }) => PERMISOS_ROL[rol][clave] === permisos[clave]),
  )
  return coincide ?? 'personalizado'
}

/**
 * What to send to turn `actuales` into `nuevos`: the role alone when they match a template,
 * else only the permissions that change. Null when nothing changes.
 */
export function cambiosEntre(actuales: PermisosMiembro, nuevos: PermisosMiembro): CambiosMiembro | null {
  const cambiados = PERMISOS_MIEMBRO.filter(({ clave }) => actuales[clave] !== nuevos[clave])
  if (cambiados.length === 0) return null
  const rol = rolDe(nuevos)
  if (rol !== 'personalizado') return { rol }
  return { permisos: Object.fromEntries(cambiados.map(({ clave }) => [clave, nuevos[clave]])) }
}

/**
 * How to invite someone with these permissions: the role alone when they match a template,
 * else the empty template plus every permission (the backend then derives `personalizado`).
 */
export function rolParaInvitar(permisos: PermisosMiembro): Pick<NuevoMiembro, 'rol' | 'permisos'> {
  const rol = rolDe(permisos)
  return rol === 'personalizado' ? { rol: 'observador', permisos } : { rol }
}

/** A role resets the permissions to its template; `permisos` then overrides single ones. */
export interface CambiosMiembro {
  rol?: RolPlantilla
  permisos?: Partial<PermisosMiembro>
}
