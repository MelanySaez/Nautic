import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const ENFOCABLES = 'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])'

/**
 * Modal dialog rendered over the page. Focuses its first control on open, closes on Escape
 * or a click on the backdrop, and gives focus back to the element that opened it.
 */
export function Modal({ titulo, alCerrar, children }: { titulo: string; alCerrar: () => void; children: ReactNode }) {
  const tituloId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const cerrar = useRef(alCerrar)
  useEffect(() => {
    cerrar.current = alCerrar
  }, [alCerrar])

  useEffect(() => {
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.querySelector<HTMLElement>(ENFOCABLES)?.focus()

    function alPresionar(e: KeyboardEvent) {
      if (e.key === 'Escape') cerrar.current()
    }
    document.addEventListener('keydown', alPresionar)
    return () => {
      document.removeEventListener('keydown', alPresionar)
      previo?.focus()
    }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar.current()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-line bg-surface p-5 shadow-xl"
      >
        <h2 id={tituloId} className="text-lg font-semibold tracking-tight">
          {titulo}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}
