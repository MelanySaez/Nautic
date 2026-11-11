import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useDependencias } from '../../app/useDependencias'
import { useRecurso } from '../../shared/hooks/useRecurso'
import { EnlaceBoton } from '../../shared/ui/Boton'
import { Cargando, MensajeError, Vacio } from '../../shared/ui/Estados'
import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import { Icon } from '../../shared/ui/Icon'

/** Case- and accent-insensitive form of a text, for client-side matching. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/** Inspections history entry point: one row per vessel that has inspections, linking to them. */
export function BuquesConInspeccionesPage() {
  const { buques } = useDependencias()
  const cargar = useCallback(() => buques.listarConInspecciones(), [buques])
  const { estado, reintentar } = useRecurso(cargar)
  const [parametros, setParametros] = useSearchParams()
  const texto = parametros.get('q') ?? ''
  const buscado = normalizar(texto)
  const visibles =
    estado.tipo === 'listo' ? estado.datos.filter((b) => normalizar(b.nombre).includes(buscado)) : []

  function escribir(nuevo: string) {
    setParametros(nuevo ? { q: nuevo } : {}, { replace: true })
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Inspecciones</h1>
          <p className="mt-1 text-ink-muted">Elija una embarcación para ver sus inspecciones de casco.</p>
        </div>
        <EnlaceBoton to="/vision">
          <Icon name="plus" className="size-4" />
          Nueva inspección
        </EnlaceBoton>
      </header>

      {estado.tipo === 'cargando' && <Cargando texto="Cargando embarcaciones…" />}
      {estado.tipo === 'error' && <MensajeError mensaje={estado.mensaje} alReintentar={reintentar} />}
      {estado.tipo === 'listo' && estado.datos.length === 0 && (
        <Vacio>
          <p>Todavía no hay inspecciones.</p>
          <EnlaceBoton to="/vision" variante="accion">
            Nueva inspección
          </EnlaceBoton>
        </Vacio>
      )}
      {estado.tipo === 'listo' && estado.datos.length > 0 && (
        <Campo etiqueta="Buscar embarcación">
          <input
            type="search"
            value={texto}
            maxLength={100}
            onChange={(e) => escribir(e.target.value)}
            placeholder="Nombre de la embarcación…"
            className={CLASES_CONTROL}
          />
        </Campo>
      )}
      {estado.tipo === 'listo' && estado.datos.length > 0 && visibles.length === 0 && (
        <Vacio>
          <p>Ninguna embarcación coincide con «{texto.trim()}».</p>
        </Vacio>
      )}
      {visibles.length > 0 && (
        <ul aria-label="Embarcaciones con inspecciones" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((buque) => (
            <li key={buque.id}>
              <Link
                to={`/inspecciones/buque/${buque.id}`}
                state={{ buqueNombre: buque.nombre, volverA: texto ? `/?q=${encodeURIComponent(texto)}` : '/' }}
                className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded bg-surface-2 text-ink-dim">
                  <Icon name="ship" className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-semibold tracking-tight">{buque.nombre}</span>
                  <span className="label-caps text-ink-dim">
                    {buque.totalInspecciones} {buque.totalInspecciones === 1 ? 'inspección' : 'inspecciones'}
                  </span>
                </span>
                <Icon name="back" className="size-5 shrink-0 rotate-180 text-ink-dim" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
