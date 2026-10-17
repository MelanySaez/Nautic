import { cloneElement, useId, type ReactElement, type ReactNode } from 'react'

type PropsControl = { id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }

/** Labelled form field; the label is always visible (never placeholder-only). */
export function Campo({
  etiqueta,
  error,
  ayuda,
  children,
}: {
  etiqueta: string
  error?: string | null
  ayuda?: ReactNode
  children: ReactElement<PropsControl>
}) {
  const id = useId()
  const idMensaje = `${id}-mensaje`
  const control = cloneElement(children, {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error || ayuda ? idMensaje : undefined,
  })

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {etiqueta}
      </label>
      {control}
      {error ? (
        <p id={idMensaje} className="text-sm text-critical">
          {error}
        </p>
      ) : (
        ayuda && (
          <p id={idMensaje} className="text-sm text-ink-dim">
            {ayuda}
          </p>
        )
      )}
    </div>
  )
}
