import { Link } from 'react-router'
import { Icon } from '../../shared/ui/Icon'
import type { Buque } from '../domain/buque'

export function TarjetaBuque({ buque }: { buque: Buque }) {
  const { id, nombre, tipo, etapa } = buque

  return (
    <article
      aria-label={nombre}
      className="group relative flex items-center gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent"
    >
      {/* There is no image serving contract yet, so every vessel shows the same placeholder. */}
      <div className="flex size-14 shrink-0 items-center justify-center rounded bg-surface-2 text-ink-dim">
        <Icon name="ship" className="size-7" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="label-caps text-ink-dim">{tipo}</p>
        <h3 className="truncate text-xl font-semibold tracking-tight">
          <Link
            to={`/buques/${id}`}
            aria-label={`Abrir ficha de ${nombre}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {nombre}
          </Link>
        </h3>
        <span className="mt-1 inline-flex items-center rounded-sm bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider text-ink-muted uppercase">
          {etapa}
        </span>
      </div>
    </article>
  )
}
