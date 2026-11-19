import { Boton, EnlaceBoton } from '../../../shared/ui/Boton'
import { Icon } from '../../../shared/ui/Icon'
import { PRESENTACION_ESTADO_ZONA } from './estadosZona'
import type { ZonaListada } from './ListaZonasCasco'

// Same "stamp" shape as the status badges of `Insignias.tsx`.
const INSIGNIA =
  'inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider uppercase'

/**
 * The selected zone: its state and counts in the latest inspection, plus its two actions:
 * start a new inspection on it, or list the existing inspections with photos of it.
 */
export function PanelZona({
  zona,
  buqueId,
  alVerInspecciones,
}: {
  zona: ZonaListada | null
  buqueId: number
  alVerInspecciones: (seccionId: number) => void
}) {
  return (
    <section aria-label="Zona seleccionada" className="rounded-lg border border-line bg-surface p-4">
      {zona ? (
        <ZonaElegida zona={zona} buqueId={buqueId} alVerInspecciones={alVerInspecciones} />
      ) : (
        <p className="text-sm text-ink-muted">Pasa el cursor por el casco para ver cada sección y haz clic para elegirla.</p>
      )}
    </section>
  )
}

function ZonaElegida({
  zona: { seccion, resumen },
  buqueId,
  alVerInspecciones,
}: {
  zona: ZonaListada
  buqueId: number
  alVerInspecciones: (seccionId: number) => void
}) {
  const { texto, insignia } = PRESENTACION_ESTADO_ZONA[resumen.estado]
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

      <div role="group" aria-label="Acciones de la zona" className="flex flex-wrap gap-2">
        <EnlaceBoton to={`/vision?buque=${buqueId}&zona=${seccion.id}`}>
          <Icon name="plus" className="size-4" />
          Nueva inspección en esta sección
        </EnlaceBoton>
        <Boton variante="secundario" onClick={() => alVerInspecciones(seccion.id)}>
          <Icon name="search" className="size-4" />
          Ver inspecciones de esta sección
        </Boton>
      </div>
    </div>
  )
}
