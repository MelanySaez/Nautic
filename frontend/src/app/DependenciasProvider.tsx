import type { ReactNode } from 'react'
import type { Dependencias } from './composicion'
import { DependenciasContext } from './useDependencias'

export function DependenciasProvider({ valor, children }: { valor: Dependencias; children: ReactNode }) {
  return <DependenciasContext.Provider value={valor}>{children}</DependenciasContext.Provider>
}
