import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useDependencias } from '../../app/useDependencias'
import { useRecurso } from '../../shared/hooks/useRecurso'
import { Boton, EnlaceBoton } from '../../shared/ui/Boton'
import { Cargando, MensajeError, Vacio } from '../../shared/ui/Estados'
import { Icon } from '../../shared/ui/Icon'
import { mensajeDe } from '../../shared/ui/formato'
import type { Inspeccion } from '../domain/inspeccion'
import { FiltrosInspecciones, type CampoFiltro } from './FiltrosInspecciones'
import { filtroDesdeParametros, MIN_CARACTERES_BUSQUEDA } from './filtroUrl'
import { TarjetaInspeccion } from './TarjetaInspeccion'
import { useBusquedaInspecciones } from './useBusquedaInspecciones'

const RETARDO_TEXTO_MS = 300
const CAMPOS_CON_CONTROL = ['q', 'buque', 'buque_id', 'desde', 'hasta', 'severidad_min']

export function ListaInspeccionesPage() {
  const { inspecciones: repo, buques } = useDependencias()
  const [parametros, setParametros] = useSearchParams()
  const filtro = useMemo(() => filtroDesdeParametros(parametros), [parametros])
  const { estado, cargarMas, quitar, reintentar } = useBusquedaInspecciones(filtro)
  const cargarBuques = useCallback(() => buques.listar(), [buques])
  const catalogo = useRecurso(cargarBuques).estado
  const [texto, setTexto] = useState(parametros.get('q') ?? '')
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  // The debounce timer fires later than the render that created it, so it reads the latest setter.
  const ultimoSetParametros = useRef(setParametros)
  useEffect(() => {
    ultimoSetParametros.current = setParametros
  })
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(temporizador.current), [])

  function fijarParametro(nombre: string, valor: string) {
    ultimoSetParametros.current(
      (previos) => {
        const siguientes = new URLSearchParams(previos)
        if (valor) siguientes.set(nombre, valor)
        else siguientes.delete(nombre)
        return siguientes
      },
      { replace: true },
    )
  }

  function escribir(nuevo: string) {
    setTexto(nuevo)
    clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => {
      const limpio = nuevo.trim()
      fijarParametro('q', limpio.length >= MIN_CARACTERES_BUSQUEDA ? limpio : '')
    }, RETARDO_TEXTO_MS)
  }

  function limpiar() {
    clearTimeout(temporizador.current)
    setTexto('')
    setParametros({}, { replace: true })
  }

  const campos = estado.tipo === 'error' ? estado.campos : undefined
  const errores: Partial<Record<CampoFiltro | 'q', string>> = {
    q: campos?.q?.[0],
    buque: (campos?.buque ?? campos?.buque_id)?.[0],
    desde: campos?.desde?.[0],
    hasta: campos?.hasta?.[0],
    severidad_min: campos?.severidad_min?.[0],
  }
  // Errors on a field with no control (cursor, limit) would otherwise vanish.
  const errorSinControl =
    estado.tipo === 'error' && !(campos && Object.keys(campos).some((c) => CAMPOS_CON_CONTROL.includes(c)))
  const hayFiltros = Object.keys(filtro).length > 0

  async function eliminar(inspeccion: Inspeccion) {
    const confirmado = window.confirm(
      `¿Eliminar la inspección de ${inspeccion.buqueNombre}? Se borrarán también sus fotos.`,
    )
    if (!confirmado) return
    setErrorAccion(null)
    setEliminandoId(inspeccion.id)
    try {
      await repo.eliminar(inspeccion.id)
      quitar(inspeccion.id)
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

      <FiltrosInspecciones
        valores={{
          buque: parametros.get('buque') ?? '',
          desde: parametros.get('desde') ?? '',
          hasta: parametros.get('hasta') ?? '',
          severidadMin: parametros.get('severidad_min') ?? '',
          texto,
        }}
        buques={catalogo.tipo === 'listo' ? catalogo.datos : []}
        errores={errores}
        hayFiltros={hayFiltros || texto.trim().length > 0}
        alCambiar={(campo, valor) => fijarParametro(campo, valor)}
        alEscribir={escribir}
        alLimpiar={limpiar}
      />
      {errorAccion && <MensajeError mensaje={errorAccion} />}
      {estado.tipo === 'cargando' && <Cargando texto="Cargando inspecciones…" />}
      {errorSinControl && estado.tipo === 'error' && <MensajeError mensaje={estado.mensaje} alReintentar={reintentar} />}
      {estado.tipo === 'listo' && estado.resultados.length === 0 && (
        <Vacio>
          {hayFiltros ? (
            <p>Ninguna inspección coincide con los filtros.</p>
          ) : (
            <>
              <p>Todavía no hay inspecciones.</p>
              <EnlaceBoton to="/vision" variante="accion">
                Nueva inspección
              </EnlaceBoton>
            </>
          )}
        </Vacio>
      )}
      {estado.tipo === 'listo' && estado.resultados.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {estado.resultados.map((inspeccion) => (
            <TarjetaInspeccion
              key={inspeccion.id}
              inspeccion={inspeccion}
              eliminando={eliminandoId === inspeccion.id}
              alEliminar={() => eliminar(inspeccion)}
            />
          ))}
        </div>
      )}
      {estado.tipo === 'listo' && estado.errorMas && <MensajeError mensaje={estado.errorMas} />}
      {estado.tipo === 'listo' && estado.hayMas && (
        <Boton variante="secundario" onClick={cargarMas} disabled={estado.cargandoMas} className="self-center">
          {estado.cargandoMas ? 'Cargando…' : 'Cargar más'}
        </Boton>
      )}
    </div>
  )
}
