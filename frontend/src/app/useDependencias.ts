import { createContext, useContext } from 'react'
import type { Dependencias } from './composicion'

export const DependenciasContext = createContext<Dependencias | null>(null)

export function useDependencias(): Dependencias {
  const dependencias = useContext(DependenciasContext)
  if (!dependencias) throw new Error('useDependencias must be used inside <DependenciasProvider>.')
  return dependencias
}
