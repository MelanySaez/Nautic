import { Icon } from '../../shared/ui/Icon'
import type { Foto } from '../domain/inspeccion'
import { etiquetaModelo, type ModeloIA } from '../domain/modelo'
import { InsigniaEstado } from './Insignias'

function nombreArchivo(url: string | null): string {
  if (!url) return 'Sin imagen'
  return decodeURIComponent(url.split('/').pop() ?? url)
}

export function ColaFotos({
  fotos,
  modelos,
  ocupadas,
  alReintentar,
  alEliminar,
}: {
  fotos: Foto[]
  modelos: ModeloIA[]
  ocupadas: Set<number>
  alReintentar: (foto: Foto) => void
  alEliminar: (foto: Foto) => void
}) {
  return (
    <ul aria-label="Fotos de la inspección" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {fotos.map((foto) => {
        const ocupada = ocupadas.has(foto.id)
        const imagen = foto.imagenAnotada ?? foto.imagenOriginal
        const modelo = etiquetaModelo(foto.modelo, foto.modeloVersion, modelos)
        return (
          <li key={foto.id} className="flex flex-col overflow-hidden rounded border border-line bg-surface">
            <div className="relative aspect-[4/3] bg-surface-2">
              {imagen ? (
                <img src={imagen} alt={`Foto ${foto.id} de ${foto.seccion.codigo}`} loading="lazy" className="size-full object-cover" />
              ) : (
                <Icon name="photos" className="absolute inset-0 m-auto size-8 text-ink-dim" />
              )}
              {foto.estado === 'en_proceso' && (
                <div className="label-caps absolute inset-0 flex items-center justify-center gap-2 bg-canvas/70 text-info">
                  <Icon name="refresh" className="size-4 animate-spin" />
                  Analizando…
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[11px] text-ink-muted" title={nombreArchivo(foto.imagenOriginal)}>
                  {foto.seccion.codigo} · #{foto.id}
                </span>
                <InsigniaEstado estado={foto.estado} />
              </div>
              {modelo && <p className="truncate font-mono text-[11px] text-ink-dim">{modelo}</p>}
              {foto.estado === 'error' && foto.errorDetalle && (
                <p className="line-clamp-2 text-xs text-critical">{foto.errorDetalle}</p>
              )}
              <div className="flex justify-end gap-1">
                {foto.estado === 'error' && (
                  <button
                    type="button"
                    onClick={() => alReintentar(foto)}
                    disabled={ocupada}
                    aria-label="Reintentar análisis"
                    className="rounded p-1.5 text-ink-dim hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                  >
                    <Icon name="refresh" className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => alEliminar(foto)}
                  disabled={ocupada || foto.estado === 'en_proceso'}
                  aria-label="Eliminar foto"
                  className="rounded p-1.5 text-ink-dim hover:bg-critical-bg hover:text-critical disabled:opacity-50"
                >
                  <Icon name="trash" className="size-4" />
                </button>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
