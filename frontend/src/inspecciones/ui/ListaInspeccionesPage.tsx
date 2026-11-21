import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { admiteVista3d } from '../../buques/domain/casco/zonas'
import { useLocation, useParams, useSearchParams } from 'react-router'
import { Enlace } from '../../shared/ui/Enlace'
import { useDependencias } from '../../app/useDependencias'
import { useUsuarioActual } from '../../cuentas/ui/sesion'
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
import { conParametro, idDeParametro } from './parametrosUrl'
import { VistaCascoBuque } from './VistaCascoBuque'

const RETARDO_TEXTO_MS = 300
const CAMPOS_CON_CONTROL = ['q', 'desde', 'hasta', 'severidad_min', 'relacion']
const VISTA_3D = '3d'

/** Route entry: keys the page by vessel so switching vessels starts from a clean state. */
export function ListaInspeccionesRuta() {
  const { id } = useParams()
  return <ListaInspeccionesPage key={id} buqueId={Number(id)} />
}

/**
 * Inspections of one vessel, with the date, severity, name and hull section filters kept in the
 * URL query, or (`?vista=3d`) its hull in 3D with the selected zone (`?zona=<seccionId>`).
 */
export function ListaInspeccionesPage({ buqueId }: { buqueId: number }) {
  const { inspecciones: repo, buques } = useDependencias()
  const usuario = useUsuarioActual()
  const [parametros, setParametros] = useSearchParams()
  const filtroUrl = useMemo(() => filtroDesdeParametros(parametros), [parametros])
  const pide3d = parametros.get('vista') === VISTA_3D
  const zonaId = idDeParametro(parametros, 'zona')
  const cargarBuque = useCallback(() => buques.obtener(buqueId), [buques, buqueId])
  const { estado: buque, reintentar: reintentarBuque } = useRecurso(cargarBuque)
  // Vessels declared with their own sections have no 3D hull; until the vessel loads, assume it has.
  const disponible3d = buque.tipo !== 'listo' || admiteVista3d(buque.datos.secciones)
  const en3d = pide3d && disponible3d
  const idNo3d = useId()
  // The list is not on screen in 3D: its (filtered) search waits until it is shown again.
  const { estado, cargarMas, quitar, reintentar } = useBusquedaInspecciones(
    { ...filtroUrl, buqueId },
    { activa: !en3d },
  )
  // The vessel list passes the name along so the title is there from the first frame of the transition.
  const ubicacion = useLocation()
  const desdeLista = ubicacion.state as { buqueNombre?: string; volverA?: string } | null
  const nombreConocido = buque.tipo === 'listo' ? buque.datos.nombre : desdeLista?.buqueNombre
  const nombreBuque = nombreConocido ?? 'Embarcación'
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

  function mostrar3d(activar: boolean) {
    setParametros((previos) => conParametro(conParametro(previos, 'zona', null), 'vista', activar ? VISTA_3D : null))
  }

  function elegirZona(seccionId: number | null) {
    setParametros((previos) => conParametro(previos, 'zona', seccionId), { replace: true })
  }

  function verInspeccionesDeSeccion(seccionId: number) {
    setParametros((previos) => {
      const siguientes = conParametro(conParametro(previos, 'vista', null), 'zona', null)
      return conParametro(siguientes, 'seccion', seccionId)
    })
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
    relacion: campos?.relacion?.[0],
  }
  // Errors on a field with no control (cursor, limit) would otherwise vanish.
  const errorSinControl =
    estado.tipo === 'error' && !(campos && Object.keys(campos).some((c) => CAMPOS_CON_CONTROL.includes(c)))
  const hayFiltros = Object.keys(filtroUrl).length > 0
  const seccionFiltrada =
    filtroUrl.seccionId === undefined
      ? null
      : ((buque.tipo === 'listo' ? buque.datos.secciones.find((s) => s.id === filtroUrl.seccionId) : undefined) ?? null)

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
        <div className="flex flex-wrap gap-3">
          <div role="group" aria-label="Vista" className="flex rounded border border-line p-0.5">
            {[
              { etiqueta: 'Lista', vista3d: false, icono: 'results' as const },
              { etiqueta: 'Vista 3D', vista3d: true, icono: 'ship' as const },
            ].map(({ etiqueta, vista3d, icono }) => {
              const activa = vista3d === en3d
              return (
                <button
                  key={etiqueta}
                  type="button"
                  aria-pressed={activa}
                  disabled={vista3d && !disponible3d}
                  aria-describedby={vista3d && !disponible3d ? idNo3d : undefined}
                  onClick={() => !activa && mostrar3d(vista3d)}
                  className={`label-caps flex items-center gap-2 rounded-sm px-3 py-2 ${
                    activa ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink'
                  } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-ink-muted`}
                >
                  <Icon name={icono} className="size-4" />
                  {etiqueta}
                </button>
              )
            })}
          </div>
          {!disponible3d && (
            <p id={idNo3d} className="self-center text-sm text-ink-dim">
              Este buque usa secciones propias: la vista 3D no está disponible.
            </p>
          )}
          <EnlaceBoton to={`/vision?buque=${buqueId}`}>
            <Icon name="plus" className="size-4" />
            Nueva inspección
          </EnlaceBoton>
        </div>
      </header>

      {en3d ? (
        <>
          {buque.tipo === 'cargando' && <Cargando texto="Cargando buque…" />}
          {buque.tipo === 'error' && <MensajeError mensaje={buque.mensaje} alReintentar={reintentarBuque} />}
          {buque.tipo === 'listo' && (
            <VistaCascoBuque
              buque={buque.datos}
              zonaId={zonaId}
              alElegirZona={elegirZona}
              alVerInspecciones={verInspeccionesDeSeccion}
            />
          )}
        </>
      ) : (
        <>
        <FiltrosInspecciones
          valores={{
            desde: parametros.get('desde') ?? '',
            hasta: parametros.get('hasta') ?? '',
            severidadMin: parametros.get('severidad_min') ?? '',
            relacion: parametros.get('relacion') ?? '',
            texto,
          }}
          errores={errores}
          hayFiltros={hayFiltros || texto.trim().length > 0}
          alCambiar={(campo, valor) => fijarParametro(campo, valor)}
          alEscribir={escribir}
          alLimpiar={limpiar}
        />
        {filtroUrl.seccionId !== undefined && (
          <div className="flex flex-wrap items-center gap-3 self-start rounded border border-line bg-surface px-3 py-2 text-sm">
            <span>
              {seccionFiltrada
                ? `Sección: ${seccionFiltrada.codigo} · ${seccionFiltrada.nombre}`
                : `Sección #${filtroUrl.seccionId}`}
            </span>
            <button
              type="button"
              onClick={() => fijarParametro('seccion', '')}
              className="font-semibold text-accent-ink hover:underline"
            >
              Quitar filtro de sección
            </button>
          </div>
        )}
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
                <EnlaceBoton to={`/vision?buque=${buqueId}`} variante="accion">
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
                puedeEliminar={!!usuario && (usuario.esAdmin || inspeccion.lider?.id === usuario.id)}
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
        </>
      )}
    </div>
  )
}
