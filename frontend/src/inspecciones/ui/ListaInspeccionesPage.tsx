import { useCallback, useMemo, useState } from 'react'
import { useDependencias } from '../../app/useDependencias'
import { useRecurso } from '../../shared/hooks/useRecurso'
import { EnlaceBoton } from '../../shared/ui/Boton'
import { Cargando, MensajeError, Vacio } from '../../shared/ui/Estados'
import { Icon } from '../../shared/ui/Icon'
import { mensajeDe } from '../../shared/ui/formato'
import type { Inspeccion } from '../domain/inspeccion'
import { filtrarInspecciones } from '../domain/reglas'
import { TarjetaInspeccion } from './TarjetaInspeccion'

export function ListaInspeccionesPage() {
  const { inspecciones: repo } = useDependencias()
  const cargar = useCallback(() => repo.listar(), [repo])
  const { estado, reintentar, actualizar } = useRecurso(cargar)
  const [consulta, setConsulta] = useState('')
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  const visibles = useMemo(
    () => (estado.tipo === 'listo' ? filtrarInspecciones(estado.datos, consulta) : []),
    [estado, consulta],
  )

  async function eliminar(inspeccion: Inspeccion) {
    const confirmado = window.confirm(
      `¿Eliminar la inspección de ${inspeccion.buqueNombre}? Se borrarán también sus fotos.`,
    )
    if (!confirmado) return
    setErrorAccion(null)
    setEliminandoId(inspeccion.id)
    try {
      await repo.eliminar(inspeccion.id)
      actualizar((lista) => lista.filter((i) => i.id !== inspeccion.id))
    } catch (error) {
      setErrorAccion(mensajeDe(error))
    } finally {
      setEliminandoId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Inspecciones</h1>
          <p className="mt-1 text-ink-muted">Sesiones de inspección de casco por buque.</p>
        </div>
        <EnlaceBoton to="/vision">
          <Icon name="plus" className="size-4" />
          Nueva inspección
        </EnlaceBoton>
      </header>

      <label className="flex items-center gap-3 rounded border border-line-strong bg-surface px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10">
        <Icon name="search" className="size-5 text-ink-dim" />
        <span className="sr-only">Buscar buque o inspector</span>
        <input
          type="search"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Buscar buque o inspector…"
          className="w-full bg-transparent py-3 outline-none placeholder:text-ink-dim"
        />
      </label>

      {errorAccion && <MensajeError mensaje={errorAccion} />}

      {estado.tipo === 'cargando' && <Cargando texto="Cargando inspecciones…" />}
      {estado.tipo === 'error' && <MensajeError mensaje={estado.mensaje} alReintentar={reintentar} />}
      {estado.tipo === 'listo' && estado.datos.length === 0 && (
        <Vacio>
          <p>Todavía no hay inspecciones.</p>
          <EnlaceBoton to="/vision" variante="accion">
            Nueva inspección
          </EnlaceBoton>
        </Vacio>
      )}
      {estado.tipo === 'listo' && estado.datos.length > 0 && visibles.length === 0 && (
        <Vacio>
          <p>Ninguna inspección coincide con "{consulta.trim()}".</p>
        </Vacio>
      )}
      {visibles.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((inspeccion) => (
            <TarjetaInspeccion
              key={inspeccion.id}
              inspeccion={inspeccion}
              eliminando={eliminandoId === inspeccion.id}
              alEliminar={() => eliminar(inspeccion)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
