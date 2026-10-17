import { useState } from 'react'
import { porcentaje } from '../../shared/ui/formato'
import type { Foto } from '../domain/inspeccion'
import { InsigniaSeveridad } from './Insignias'

function segundos(ms: number | null): string {
  return ms === null ? '—' : `${(ms / 1000).toFixed(2)} s`
}

export function TarjetaResultado({ foto }: { foto: Foto }) {
  const [anotada, setAnotada] = useState(true)
  const titulo = `${foto.seccion.codigo} · Foto #${foto.id}`
  const tieneAnotada = Boolean(foto.imagenAnotada)
  const imagen = tieneAnotada && anotada ? foto.imagenAnotada : foto.imagenOriginal

  return (
    <article aria-label={titulo} className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="label-caps truncate text-ink-muted">{titulo}</h3>
          <p className="text-xs text-ink-dim">{foto.seccion.nombre}</p>
        </div>
        {tieneAnotada && (
          <label className="label-caps flex cursor-pointer items-center gap-2 text-ink-muted">
            Mostrar anotada
            <input
              type="checkbox"
              role="switch"
              checked={anotada}
              onChange={(e) => setAnotada(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="relative h-5 w-9 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
            />
          </label>
        )}
      </header>

      <div className="bg-surface-2">
        {imagen && (
          <img
            src={imagen}
            alt={`${anotada && tieneAnotada ? 'Imagen anotada' : 'Imagen original'} de ${titulo}`}
            loading="lazy"
            className="max-h-[28rem] w-full object-contain"
          />
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-ink-muted">Inferencia: {segundos(foto.tiempoInferenciaMs)}</span>
          {foto.severidad && <InsigniaSeveridad severidad={foto.severidad} />}
        </div>
        {foto.detecciones.length === 0 ? (
          <p className="text-sm text-ink-muted">Sin anomalías detectadas.</p>
        ) : (
          <ul aria-label="Detecciones" className="divide-y divide-line border-t border-line">
            {foto.detecciones.map((d) => (
              <li key={d.clase} className="flex items-baseline justify-between gap-3 py-2">
                <span className="font-semibold capitalize">
                  {d.clase.replace(/_/g, ' ')} <span className="font-mono text-xs font-normal text-ink-dim">×{d.cantidad}</span>
                </span>
                <span className="font-mono text-xs text-ink-muted">
                  Confianza: <strong className="text-ink">{porcentaje(d.confianzaMaxima)}</strong>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}
