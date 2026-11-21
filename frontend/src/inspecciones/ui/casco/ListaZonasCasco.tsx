import { useId } from 'react'
import type { SeccionCasco, ZonaReciente } from '../../domain/inspeccion'
import type { ResumenZona } from '../../domain/resumenZonas'
import { PRESENTACION_ESTADO_ZONA } from './estadosZona'

/** A section of the vessel with what its latest inspection with photos of it says about it. */
export interface ZonaListada {
  seccion: SeccionCasco
  resumen: ResumenZona
  /** The inspection the summary comes from; null when no readable inspection photographed it. */
  inspeccion: ZonaReciente['inspeccion'] | null
}

/**
 * The accessible path to every zone: the sections placed on the hull (standard order) and,
 * apart, the ones that match no standard zone. Each item is a toggle.
 */
export function ListaZonasCasco({
  ubicadas,
  sinUbicar,
  seleccionadaId,
  alSeleccionar,
}: {
  ubicadas: readonly ZonaListada[]
  sinUbicar: readonly ZonaListada[]
  seleccionadaId: number | null
  alSeleccionar: (seccionId: number) => void
}) {
  if (ubicadas.length === 0 && sinUbicar.length === 0) {
    return <p className="text-sm text-ink-muted">Este buque no tiene secciones del casco declaradas.</p>
  }

  return (
    <div className="flex flex-col gap-5">
      {ubicadas.length > 0 ? (
        <GrupoZonas titulo="Zonas del casco" zonas={ubicadas} seleccionadaId={seleccionadaId} alSeleccionar={alSeleccionar} />
      ) : (
        <p className="text-sm text-ink-muted">Ninguna sección de este buque coincide con una zona estándar del casco.</p>
      )}
      {sinUbicar.length > 0 && (
        <GrupoZonas
          titulo="Secciones sin ubicación en el casco"
          zonas={sinUbicar}
          seleccionadaId={seleccionadaId}
          alSeleccionar={alSeleccionar}
        />
      )}
    </div>
  )
}

function GrupoZonas({
  titulo,
  zonas,
  seleccionadaId,
  alSeleccionar,
}: {
  titulo: string
  zonas: readonly ZonaListada[]
  seleccionadaId: number | null
  alSeleccionar: (seccionId: number) => void
}) {
  const idTitulo = useId()

  return (
    <div role="group" aria-labelledby={idTitulo} className="flex flex-col gap-2">
      <h3 id={idTitulo} className="label-caps text-ink-dim">
        {titulo}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {zonas.map(({ seccion, resumen }) => {
          const activa = seccion.id === seleccionadaId
          const { texto, muestra } = PRESENTACION_ESTADO_ZONA[resumen.estado]
          return (
            <li key={seccion.id}>
              <button
                type="button"
                aria-pressed={activa}
                onClick={() => alSeleccionar(seccion.id)}
                className={`flex w-full items-start gap-3 rounded border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  activa ? 'border-accent bg-info-bg ring-2 ring-accent/20' : 'border-line bg-surface hover:border-accent'
                }`}
              >
                <span aria-hidden="true" className={`mt-1 size-3 shrink-0 rounded-sm ${muestra}`} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-ink">
                    <span className="font-mono text-xs font-medium">{seccion.codigo}</span> · {seccion.nombre}
                  </span>{' '}
                  <span className="text-xs text-ink-muted">{texto}</span>
                </span>{' '}
                <span className="shrink-0 font-mono text-xs text-ink-dim">
                  {resumen.fotos} {resumen.fotos === 1 ? 'foto' : 'fotos'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
