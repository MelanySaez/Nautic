import { useId } from 'react'
import { Boton, EnlaceBoton } from '../../../shared/ui/Boton'
import { Icon } from '../../../shared/ui/Icon'
import { PRESENTACION_ESTADO_ZONA } from './estadosZona'
import type { ZonaListada } from './ListaZonasCasco'

// Same "stamp" shape as the status badges of `Insignias.tsx`.
const INSIGNIA =
  'inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider uppercase'

/**
 * The selected zone: its state and counts in the selected inspection, plus the ways to act on
 * it. Without an inspection only a new one can be started.
 */
export function PanelZona({
  zona,
  buqueId,
  inspeccionId,
  puedeEditar,
}: {
  zona: ZonaListada | null
  buqueId: number
  inspeccionId: number | null
  /** The user may upload photos to the selected inspection (`misPermisos.subirFotos`). */
  puedeEditar: boolean
}) {
  const idMotivo = useId()

  return (
    <section aria-label="Zona seleccionada" className="rounded-lg border border-line bg-surface p-4">
      {zona ? (
        <ZonaElegida
          zona={zona}
          buqueId={buqueId}
          inspeccionId={inspeccionId}
          puedeEditar={puedeEditar}
          idMotivo={idMotivo}
        />
      ) : (
        <p className="text-sm text-ink-muted">Selecciona una zona del casco o de la lista para ver su estado.</p>
      )}
    </section>
  )
}

function ZonaElegida({
  zona: { seccion, resumen },
  buqueId,
  inspeccionId,
  puedeEditar,
  idMotivo,
}: {
  zona: ZonaListada
  buqueId: number
  inspeccionId: number | null
  puedeEditar: boolean
  idMotivo: string
}) {
  const { texto, insignia } = PRESENTACION_ESTADO_ZONA[resumen.estado]
  const conZona = `zona=${seccion.id}`
  const conteos: Array<[string, number]> = [
    ['Fotos', resumen.fotos],
    ['Analizadas', resumen.analizadas],
    ['Hallazgos', resumen.hallazgos],
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-caps text-ink-dim">{seccion.codigo}</p>
          <h2 className="text-xl font-semibold">{seccion.nombre}</h2>
          {seccion.descripcion && <p className="text-sm text-ink-muted">{seccion.descripcion}</p>}
        </div>
        <span className={`${INSIGNIA} ${insignia}`}>{texto}</span>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {conteos.map(([termino, valor]) => (
          <div key={termino} className="rounded border border-line bg-surface-2 px-3 py-2">
            <dt className="label-caps text-ink-dim">{termino}</dt>
            <dd className="font-mono text-lg font-semibold">{valor}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-2">
        {inspeccionId !== null && (
          <>
            <EnlaceBoton to={`/inspecciones/${inspeccionId}/resultados?${conZona}`} variante="secundario">
              <Icon name="results" className="size-4" />
              Consultar
            </EnlaceBoton>
            {puedeEditar ? (
              <EnlaceBoton to={`/vision/${inspeccionId}?${conZona}`} variante="secundario">
                <Icon name="edit" className="size-4" />
                Editar
              </EnlaceBoton>
            ) : (
              <Boton variante="secundario" disabled aria-describedby={idMotivo}>
                <Icon name="edit" className="size-4" />
                Editar
              </Boton>
            )}
          </>
        )}
        <EnlaceBoton to={`/vision?buque=${buqueId}&${conZona}`}>
          <Icon name="plus" className="size-4" />
          Nueva inspección
        </EnlaceBoton>
      </div>
      {inspeccionId !== null && !puedeEditar && (
        <p id={idMotivo} className="text-xs text-ink-muted">
          No tienes permiso para subir fotos en esta inspección.
        </p>
      )}
    </div>
  )
}
