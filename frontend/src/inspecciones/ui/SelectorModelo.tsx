import { clasesControlCompacto } from '../../shared/ui/clasesControl'
import type { ModeloIA } from '../domain/modelo'

/** Presentational model picker: unavailable models are listed but cannot be chosen. */
export function SelectorModelo({
  modelos,
  seleccionadoId,
  cargando,
  error,
  alCambiar,
}: {
  modelos: ModeloIA[]
  seleccionadoId: string | null
  cargando: boolean
  error: string | null
  alCambiar: (modeloId: string) => void
}) {
  const seleccionado = modelos.find((m) => m.id === seleccionadoId) ?? null

  return (
    <div className="flex min-w-0 flex-col gap-1 sm:max-w-md sm:flex-1">
      <label className="flex items-center gap-3">
        <span className="label-caps shrink-0 text-ink-muted">Modelo de IA</span>
        <select
          value={seleccionadoId ?? ''}
          onChange={(e) => alCambiar(e.target.value)}
          disabled={cargando || modelos.length === 0}
          className={`${clasesControlCompacto} min-w-0 flex-1`}
        >
          {cargando && <option value="">Cargando modelos…</option>}
          {!cargando && modelos.length === 0 && <option value="">Modelo por defecto del servidor</option>}
          {modelos.map((m) => (
            <option key={m.id} value={m.id} disabled={!m.disponible}>
              {m.disponible ? m.label : `${m.label} (no disponible)`}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className="text-xs text-critical">{error}</p>
      ) : (
        seleccionado && <p className="text-xs text-ink-muted">{seleccionado.descripcion}</p>
      )}
    </div>
  )
}
