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
  usuario: { id: number; nombre: string; email: string; cargo: string }
  rol: RolMiembro
  permisos: PermisosMiembro
  fechaAgregado: string
}

export interface NuevoMiembro {
  email: string
  rol: RolPlantilla
}

/** A role resets the permissions to its template; `permisos` then overrides single ones. */
export interface CambiosMiembro {
  rol?: RolPlantilla
  permisos?: Partial<PermisosMiembro>
}
