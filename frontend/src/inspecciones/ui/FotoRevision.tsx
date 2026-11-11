import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import type { FotoRevisable, ValidacionFoto } from '../domain/reporte'
import { InsigniaSeveridad } from './Insignias'

const FORMATO_PCT = new Intl.NumberFormat('es', { style: 'percent', maximumFractionDigits: 0 })

/** One photo of the report: confirm or discard each anomaly and add a note. */
export function FotoRevision({
  foto,
  validacion,
  alAlternar,
  alCambiarNota,
}: {
  foto: FotoRevisable
  validacion: ValidacionFoto
  alAlternar: (clase: string) => void
  alCambiarNota: (nota: string) => void
}) {
  const titulo = `Foto #${foto.fotoId} · ${foto.seccion.codigo} · ${foto.seccion.nombre}`
  return (
    <fieldset className="animar-entrada grid gap-4 rounded-lg border border-line bg-surface p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <legend className="px-1 text-sm font-semibold">{titulo}</legend>
      {foto.imagen ? (
        <img src={foto.imagen} alt={titulo} loading="lazy" className="w-full rounded border border-line object-contain" />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded bg-surface-2 text-sm text-ink-dim">
          Imagen no disponible
        </div>
      )}
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {foto.hallazgos.map((h) => {
            const confirmado = !validacion.descartadas.includes(h.clase)
            return (
              <li key={h.clase}>
                <label className="flex cursor-pointer items-center gap-3 rounded border border-line px-3 py-2 hover:border-accent">
                  <input type="checkbox" checked={confirmado} onChange={() => alAlternar(h.clase)} className="size-4" />
                  <span className={`flex-1 text-sm ${confirmado ? '' : 'text-ink-dim line-through'}`}>
                    {h.etiqueta} ×{h.total}
                    {h.confianzaMaxima !== null && (
                      <span className="text-ink-dim"> · {FORMATO_PCT.format(h.confianzaMaxima)}</span>
                    )}
                  </span>
                  {h.severidad && <InsigniaSeveridad severidad={h.severidad} />}
                </label>
              </li>
            )
          })}
        </ul>
        <p className="text-sm text-ink-dim">Desmarca los hallazgos que sean falsos positivos: no saldrán en el PDF.</p>
        <Campo etiqueta="Nota del inspector">
          <textarea
            value={validacion.nota}
            onChange={(e) => alCambiarNota(e.target.value)}
            rows={2}
            maxLength={2000}
            className={`${CLASES_CONTROL} resize-y`}
          />
        </Campo>
      </div>
    </fieldset>
  )
}
