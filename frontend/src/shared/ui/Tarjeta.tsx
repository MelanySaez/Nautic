import type { ReactNode } from 'react'

/** "Industrial card": optional caps header separated by a rule, flat surface, 1px border. */
export function Tarjeta({
  titulo,
  accion,
  children,
  className = '',
}: {
  titulo?: ReactNode
  accion?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-lg border border-line bg-surface ${className}`}>
      {titulo && (
        <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
          <h2 className="label-caps text-ink-muted">{titulo}</h2>
          {accion}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}
