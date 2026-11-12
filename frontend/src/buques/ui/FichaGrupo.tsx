import { Tarjeta } from '../../shared/ui/Tarjeta'

export interface FilaFicha {
  etiqueta: string
  valor: string | null
}

/** One card of the technical sheet; unset values render as a dash. */
export function FichaGrupo({ titulo, filas }: { titulo: string; filas: FilaFicha[] }) {
  return (
    <div role="region" aria-label={titulo}>
      <Tarjeta titulo={titulo}>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {filas.map(({ etiqueta, valor }) => (
            <div key={etiqueta} className="flex flex-col gap-0.5">
              <dt className="label-caps text-ink-dim">{etiqueta}</dt>
              <dd className="font-mono text-sm">{valor ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </Tarjeta>
    </div>
  )
}
