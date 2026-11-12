import { createContext, useContext } from 'react'
import type { Usuario } from '../domain/usuario'

export interface Sesion {
  /** null when nobody is logged in. */
  usuario: Usuario | null
  /** Stores the user a login or registration just authenticated. */
  iniciar(usuario: Usuario): void
  cerrarSesion(): Promise<void>
}

export const SesionContext = createContext<Sesion | null>(null)

export function useSesion(): Sesion {
  const sesion = useContext(SesionContext)
  if (!sesion) throw new Error('useSesion must be used inside <SesionProvider>.')
  return sesion
}

/** The logged-in user, or null (also outside the session provider). */
export function useUsuarioActual(): Usuario | null {
  return useContext(SesionContext)?.usuario ?? null
}
