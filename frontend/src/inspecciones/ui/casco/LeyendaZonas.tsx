import { ESTADOS_ZONA, PRESENTACION_ESTADO_ZONA } from './estadosZona'

/** Colour key of the hull zones: every state with its swatch. */
export function LeyendaZonas() {
  return (
    <ul aria-label="Leyenda de estados" className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-muted">
      {ESTADOS_ZONA.map((estado) => {
        const { texto, muestra } = PRESENTACION_ESTADO_ZONA[estado]
        return (
          <li key={estado} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-3 shrink-0 rounded-sm ${muestra}`} />
            {texto}
          </li>
        )
      })}
    </ul>
  )
}
