import type { SeccionCasco } from '../domain/inspeccion'

/** Schematic hull map: one toggle per hull section, with how many photos it holds. */
export function MapaZonas({
  secciones,
  seleccionadaId,
  fotosPorSeccion,
  alSeleccionar,
}: {
  secciones: SeccionCasco[]
  seleccionadaId: number | null
  fotosPorSeccion: Map<number, number>
  alSeleccionar: (seccion: SeccionCasco) => void
}) {
  const ordenadas = [...secciones].sort((a, b) => a.orden - b.orden)

  return (
    <div role="group" aria-label="Zonas del casco" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {ordenadas.map((seccion) => {
        const activa = seccion.id === seleccionadaId
        const cantidad = fotosPorSeccion.get(seccion.id) ?? 0
        return (
          <button
            key={seccion.id}
            type="button"
            aria-pressed={activa}
            title={seccion.nombre}
            onClick={() => alSeleccionar(seccion)}
            className={`flex flex-col items-center gap-0.5 rounded border px-2 py-2.5 font-mono text-xs transition-colors ${
              activa
                ? 'border-accent bg-info-bg font-semibold text-info ring-2 ring-accent/20'
                : 'border-line-strong bg-surface-2 text-ink-muted hover:border-accent hover:text-ink'
            }`}
          >
            {seccion.codigo}
            <span className="text-[10px] text-ink-dim">{cantidad > 0 ? `${cantidad} ${cantidad === 1 ? 'foto' : 'fotos'}` : '—'}</span>
          </button>
        )
      })}
    </div>
  )
}
