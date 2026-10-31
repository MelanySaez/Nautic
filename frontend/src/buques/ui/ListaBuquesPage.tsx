import { useCallback, useMemo, useState } from 'react'
import { useDependencias } from '../../app/useDependencias'
import { useRecurso } from '../../shared/hooks/useRecurso'
import { EnlaceBoton } from '../../shared/ui/Boton'
import { Cargando, MensajeError, Vacio } from '../../shared/ui/Estados'
import { Icon } from '../../shared/ui/Icon'
import { filtrarBuques } from '../domain/reglas'
import { TarjetaBuque } from './TarjetaBuque'

export function ListaBuquesPage() {
  const { buques: repo } = useDependencias()
  const cargar = useCallback(() => repo.listar(), [repo])
  const { estado, reintentar } = useRecurso(cargar)
  const [consulta, setConsulta] = useState('')

  const visibles = useMemo(
    () => (estado.tipo === 'listo' ? filtrarBuques(estado.datos, consulta) : []),
    [estado, consulta],
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Buques</h1>
          <p className="mt-1 text-ink-muted">Flota registrada y su ficha técnica.</p>
        </div>
        <EnlaceBoton to="/buques/nuevo">
          <Icon name="plus" className="size-4" />
          Nuevo buque
        </EnlaceBoton>
      </header>

      <label className="flex items-center gap-3 rounded border border-line-strong bg-surface px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10">
        <Icon name="search" className="size-5 text-ink-dim" />
        <span className="sr-only">Buscar buque</span>
        <input
          type="search"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Buscar por nombre o tipo…"
          className="w-full bg-transparent py-3 outline-none placeholder:text-ink-dim"
        />
      </label>

      {estado.tipo === 'cargando' && <Cargando texto="Cargando buques…" />}
      {estado.tipo === 'error' && <MensajeError mensaje={estado.mensaje} alReintentar={reintentar} />}
      {estado.tipo === 'listo' && estado.datos.length === 0 && (
        <Vacio>
          <p>Todavía no hay buques registrados.</p>
          <EnlaceBoton to="/buques/nuevo" variante="accion">
            Nuevo buque
          </EnlaceBoton>
        </Vacio>
      )}
      {estado.tipo === 'listo' && estado.datos.length > 0 && visibles.length === 0 && (
        <Vacio>
          <p>Ningún buque coincide con "{consulta.trim()}".</p>
        </Vacio>
      )}
      {visibles.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((buque) => (
            <TarjetaBuque key={buque.id} buque={buque} />
          ))}
        </div>
      )}
    </div>
  )
}
