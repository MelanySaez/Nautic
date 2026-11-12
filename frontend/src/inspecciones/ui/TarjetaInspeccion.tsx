import { Enlace } from '../../shared/ui/Enlace'
import { Icon } from '../../shared/ui/Icon'
import { formatearFecha } from '../../shared/ui/formato'
import type { Inspeccion } from '../domain/inspeccion'
import { InsigniaPrivada, InsigniaSeveridad } from './Insignias'

export function TarjetaInspeccion({
  inspeccion,
  puedeEliminar,
  eliminando,
  alEliminar,
  className = '',
}: {
  inspeccion: Inspeccion
  className?: string
  /** Only the leader (or an admin) may delete it. */
  puedeEliminar: boolean
  eliminando: boolean
  alEliminar: () => void
}) {
  const { id, nombre, severidadMax, descripcion, tomadoPor, fechaCreacion, totalFotos, privada } = inspeccion

  return (
    <article
      aria-label={nombre}
      className={`group relative flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-xl font-semibold tracking-tight">
            <Enlace
              to={`/inspecciones/${id}/resultados`}
              aria-label={`Abrir inspección ${nombre}`}
              className="after:absolute after:inset-0 focus-visible:outline-none"
            >
              {nombre}
            </Enlace>
          </h3>
          <p className="label-caps flex items-center gap-2 text-ink-dim">
            INS-{String(id).padStart(4, '0')}
            {privada && <InsigniaPrivada />}
          </p>
        </div>
        {puedeEliminar && (
          <button
            type="button"
            onClick={alEliminar}
            disabled={eliminando}
            aria-label="Eliminar inspección"
            className="relative z-10 rounded p-2 text-ink-dim hover:bg-critical-bg hover:text-critical disabled:opacity-50"
          >
            <Icon name="trash" />
          </button>
        )}
      </div>

      <p className="line-clamp-2 min-h-10 text-sm text-ink-muted">{descripcion || 'Sin descripción.'}</p>

      <div className="mt-auto flex flex-col gap-3">
        {severidadMax && (
          <div>
            <InsigniaSeveridad severidad={severidadMax} />
          </div>
        )}

        <dl className="grid grid-cols-2 gap-y-2 border-t border-line pt-3 font-mono text-xs text-ink-muted">
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
      </div>
    </article>
  )
}
