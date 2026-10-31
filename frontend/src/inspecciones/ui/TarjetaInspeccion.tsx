import { Link } from 'react-router'
import { Icon } from '../../shared/ui/Icon'
import { formatearFecha } from '../../shared/ui/formato'
import type { Inspeccion } from '../domain/inspeccion'
import { InsigniaSeveridad } from './Insignias'

export function TarjetaInspeccion({
  inspeccion,
  eliminando,
  alEliminar,
}: {
  inspeccion: Inspeccion
  eliminando: boolean
  alEliminar: () => void
}) {
  const { id, nombre, buqueNombre, severidadMax, descripcion, tomadoPor, fechaCreacion, totalFotos } = inspeccion

  return (
    <article
      aria-label={nombre}
      className="group relative flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="label-caps text-ink-dim">INS-{String(id).padStart(4, '0')}</p>
            {severidadMax && <InsigniaSeveridad severidad={severidadMax} />}
          </div>
          <h3 className="truncate text-xl font-semibold tracking-tight">
            <Link
              to={`/vision/${id}`}
              aria-label={`Abrir inspección ${nombre}`}
              className="after:absolute after:inset-0 focus-visible:outline-none"
            >
              {nombre}
            </Link>
          </h3>
          <p className="truncate text-sm text-ink-muted">{buqueNombre}</p>
        </div>
        <button
          type="button"
          onClick={alEliminar}
          disabled={eliminando}
          aria-label="Eliminar inspección"
          className="relative z-10 rounded p-2 text-ink-dim hover:bg-critical-bg hover:text-critical disabled:opacity-50"
        >
          <Icon name="trash" />
        </button>
      </div>

      <p className="line-clamp-2 min-h-10 text-sm text-ink-muted">{descripcion || 'Sin descripción.'}</p>

      <dl className="mt-auto grid grid-cols-2 gap-y-2 border-t border-line pt-3 font-mono text-xs text-ink-muted">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Inspector</dt>
          <Icon name="user" className="size-4" />
          <dd className="truncate">{tomadoPor || 'Sin asignar'}</dd>
        </div>
        <div className="flex items-center gap-1.5 justify-self-end">
          <dt className="sr-only">Fecha</dt>
          <Icon name="calendar" className="size-4" />
          <dd>{formatearFecha(fechaCreacion)}</dd>
        </div>
        <div className="col-span-2 flex items-center gap-1.5 text-accent-ink">
          <dt className="sr-only">Fotos</dt>
          <Icon name="photos" className="size-4" />
          <dd>
            {totalFotos} {totalFotos === 1 ? 'foto' : 'fotos'}
          </dd>
        </div>
      </dl>
    </article>
  )
}
