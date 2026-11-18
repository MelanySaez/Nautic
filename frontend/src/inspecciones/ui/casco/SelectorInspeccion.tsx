import { useId } from 'react'
import { Boton } from '../../../shared/ui/Boton'
import { CLASES_CONTROL } from '../../../shared/ui/clasesControl'
import { formatearFecha } from '../../../shared/ui/formato'
import type { Inspeccion } from '../../domain/inspeccion'

/**
 * Picks the inspection the hull shows, newest first, paging with "Cargar más". A selected
 * inspection that is not among the options yet is still shown, by its identifier.
 */
export function SelectorInspeccion({
  opciones,
  seleccionadaId,
  hayMas,
  cargandoMas,
  alElegir,
  alCargarMas,
}: {
  opciones: readonly Inspeccion[]
  seleccionadaId: number | null
  hayMas: boolean
  cargandoMas: boolean
  alElegir: (inspeccionId: number) => void
  alCargarMas: () => void
}) {
  const id = useId()

  if (opciones.length === 0 && seleccionadaId === null) {
    return <p className="text-sm text-ink-muted">Este buque aún no tiene inspecciones.</p>
  }

  const listada = opciones.some((inspeccion) => inspeccion.id === seleccionadaId)

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-xl">
        <label htmlFor={id} className="label-caps text-ink-muted">
          Inspección
        </label>
        <select
          id={id}
          value={seleccionadaId ?? ''}
          onChange={(e) => alElegir(Number(e.target.value))}
          className={CLASES_CONTROL}
        >
          {opciones.map((inspeccion) => (
            <option key={inspeccion.id} value={inspeccion.id}>
              {`${inspeccion.nombre} · ${formatearFecha(inspeccion.fechaCreacion)}`}
            </option>
          ))}
          {seleccionadaId !== null && !listada && (
            <option value={seleccionadaId}>{`INS-${String(seleccionadaId).padStart(4, '0')}`}</option>
          )}
        </select>
      </div>
      {hayMas && (
        <Boton variante="secundario" onClick={alCargarMas} disabled={cargandoMas}>
          {cargandoMas ? 'Cargando…' : 'Cargar más'}
        </Boton>
      )}
    </div>
  )
}
