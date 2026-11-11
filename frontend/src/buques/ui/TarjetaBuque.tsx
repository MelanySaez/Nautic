import { Enlace } from '../../shared/ui/Enlace'
import { Icon } from '../../shared/ui/Icon'
import { transicionNombreBuque } from '../../shared/ui/transiciones'
import type { Buque } from '../domain/buque'

export function TarjetaBuque({ buque }: { buque: Buque }) {
  const { id, nombre, tipo, etapa } = buque

  return (
    <article
      aria-label={nombre}
      className="animar-entrada group relative flex items-center gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent"
    >
      {/* There is no image serving contract yet, so every vessel shows the same placeholder. */}
      <span className="flex size-12 shrink-0 items-center justify-center rounded bg-surface-2 text-ink-dim">
        <Icon name="ship" className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-lg font-semibold tracking-tight">
          <Enlace
            to={`/buques/${id}`}
            aria-label={`Abrir ficha de ${nombre}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            <span style={{ viewTransitionName: transicionNombreBuque(id) }}>{nombre}</span>
          </Enlace>
        </h3>
        <p className="label-caps truncate text-ink-dim">{tipo}</p>
      </div>
      <span className="shrink-0 rounded-sm bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider text-ink-muted uppercase">
        {etapa}
      </span>
    </article>
  )
}
