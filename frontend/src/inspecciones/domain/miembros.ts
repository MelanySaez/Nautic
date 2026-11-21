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

export type NuevoMiembro = Invitado & { rol: RolPlantilla }

export const MENSAJE_ELIGE_PERSONA = 'Elige a alguien de la lista o escribe su email completo.'

/** The invitee of a person field: the picked user, else the typed email; null when it is neither. */
export function invitadoDe(texto: string, persona: PersonaSugerida | null): Invitado | null {
  if (persona) return { usuarioId: persona.id }
  const email = texto.trim()
  return email.includes('@') ? { email } : null
}

/** A role resets the permissions to its template; `permisos` then overrides single ones. */
export interface CambiosMiembro {
  rol?: RolPlantilla
  permisos?: Partial<PermisosMiembro>
}
