import type { ReactNode } from 'react'
import { Boton } from './Boton'

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <p role="status" className="label-caps py-10 text-center text-ink-muted">
      {texto}
    </p>
  )
}

export function MensajeError({ mensaje, alReintentar }: { mensaje: string; alReintentar?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded border border-critical/40 bg-critical-bg px-4 py-3 text-sm text-critical"
    >
      <span>{mensaje}</span>
      {alReintentar && (
        <Boton variante="secundario" onClick={alReintentar}>
          Reintentar
        </Boton>
      )}
    </div>
  )
}

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-line-strong px-6 py-12 text-center text-ink-muted">
      {children}
    </div>
  )
}
