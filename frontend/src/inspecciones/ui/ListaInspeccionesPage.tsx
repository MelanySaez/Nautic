import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router'
import { Enlace } from '../../shared/ui/Enlace'
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
import { transicionNombreBuque } from '../../shared/ui/transiciones'
import { useBusquedaInspecciones } from './useBusquedaInspecciones'

const RETARDO_TEXTO_MS = 300
const CAMPOS_CON_CONTROL = ['q', 'desde', 'hasta', 'severidad_min']

/** Route entry: keys the page by vessel so switching vessels starts from a clean state. */
export function ListaInspeccionesRuta() {
  const { id } = useParams()
  return <ListaInspeccionesPage key={id} buqueId={Number(id)} />
}

/** Inspections of one vessel, with the date, severity and name filters kept in the URL query. */
export function ListaInspeccionesPage({ buqueId }: { buqueId: number }) {
  const { inspecciones: repo, buques } = useDependencias()
  const [parametros, setParametros] = useSearchParams()
  const filtroUrl = useMemo(() => filtroDesdeParametros(parametros), [parametros])
  const filtro = useMemo(() => ({ ...filtroUrl, buqueId }), [filtroUrl, buqueId])
  const { estado, cargarMas, quitar, reintentar } = useBusquedaInspecciones(filtro)
  const cargarBuque = useCallback(() => buques.obtener(buqueId), [buques, buqueId])
  const buque = useRecurso(cargarBuque).estado
  // The vessel list passes the name along so the title is there from the first frame of the transition.
  const desdeLista = useLocation().state as { buqueNombre?: string; volverA?: string } | null
  const nombreBuque = buque.tipo === 'listo' ? buque.datos.nombre : (desdeLista?.buqueNombre ?? 'Embarcación')
  const [texto, setTexto] = useState(parametros.get('q') ?? '')
  // Follow URL changes made elsewhere (nav link, history); our own debounced writes already match.
  const qUrl = parametros.get('q') ?? ''
  const [qVisto, setQVisto] = useState(qUrl)
  if (qUrl !== qVisto) {
    setQVisto(qUrl)
    if (qUrl !== texto.trim()) setTexto(qUrl)
  }
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
    desde: campos?.desde?.[0],
    hasta: campos?.hasta?.[0],
    severidad_min: campos?.severidad_min?.[0],
  }
  // Errors on a field with no control (cursor, limit) would otherwise vanish.
  const errorSinControl =
    estado.tipo === 'error' && !(campos && Object.keys(campos).some((c) => CAMPOS_CON_CONTROL.includes(c)))
  const hayFiltros = Object.keys(filtroUrl).length > 0

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
        <div className="flex min-w-0 items-start gap-3">
          <Enlace
            to={desdeLista?.volverA ?? '/'}
            aria-label="Volver a las embarcaciones"
            className="mt-1 rounded p-1 text-ink-muted hover:text-ink">
            <Icon name="back" className="size-6" />
          </Enlace>
          <div className="min-w-0">
            <p className="label-caps text-ink-dim">Inspecciones</p>
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight md:text-4xl">
              <Icon name="ship" className="size-7 shrink-0 text-ink-dim" />
              <span className="truncate" style={{ viewTransitionName: transicionNombreBuque(buqueId) }}>
                {nombreBuque}
              </span>
            </h1>
          </div>
        </div>
        <EnlaceBoton to="/vision">
          <Icon name="plus" className="size-4" />
          Nueva inspección
        </EnlaceBoton>
      </header>

      <FiltrosInspecciones
        valores={{
          desde: parametros.get('desde') ?? '',
          hasta: parametros.get('hasta') ?? '',
          severidadMin: parametros.get('severidad_min') ?? '',
          texto,
        }}
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
              <p>Este buque todavía no tiene inspecciones.</p>
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
              className="animar-entrada"
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
