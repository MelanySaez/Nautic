import { useCallback, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router'
import { useDependencias } from '../../app/useDependencias'
import type { BuqueDetalle } from '../../buques/domain/buque'
import { BUQUE_DE_GUERRA } from '../../buques/domain/casco/arquetipo'
import { dimensionesCasco } from '../../buques/domain/casco/dimensiones'
import { CODIGOS_ZONA, ubicarSecciones, type CodigoZona } from '../../buques/domain/casco/zonas'
import { useRecurso, type EstadoRecurso } from '../../shared/hooks/useRecurso'
import { Enlace } from '../../shared/ui/Enlace'
import { Cargando, MensajeError } from '../../shared/ui/Estados'
import { Icon } from '../../shared/ui/Icon'
import { Tarjeta } from '../../shared/ui/Tarjeta'
import { transicionNombreBuque } from '../../shared/ui/transiciones'
import type { Foto, Inspeccion, InspeccionDetalle, SeccionCasco } from '../domain/inspeccion'
import { resumirZonas, type EstadoZona } from '../domain/resumenZonas'
import { EscenaCasco } from './casco/EscenaCasco'
import { LeyendaZonas } from './casco/LeyendaZonas'
import type { PropsLienzoCasco } from './casco/lienzoCasco'
import { ListaZonasCasco, type ZonaListada } from './casco/ListaZonasCasco'
import { PanelZona } from './casco/PanelZona'
import { SelectorInspeccion } from './casco/SelectorInspeccion'
import { useIdEnUrl } from './parametrosUrl'
import { useBusquedaInspecciones } from './useBusquedaInspecciones'
import { useInspeccionEnVivo, type DatosInspeccion } from './useInspeccionEnVivo'

/** Route entry: keys the page by vessel so switching vessels starts from a clean state. */
export function CascoBuqueRuta() {
  const { id } = useParams()
  return <CascoBuquePage key={id} buqueId={Number(id)} />
}

/** What the inspections search offers to the selector. */
interface OpcionesInspeccion {
  resultados: readonly Inspeccion[]
  hayMas: boolean
  cargandoMas: boolean
  errorMas: string | null
  /** The search failed; the inspection of the URL can still be shown. */
  error: string | null
  alCargarMas: () => void
  alReintentar: () => void
}

interface PropsVista {
  buque: BuqueDetalle
  opciones: OpcionesInspeccion
  zonaId: number | null
  alElegirInspeccion: (inspeccionId: number) => void
  alElegirZona: (seccionId: number | null) => void
}

/**
 * Hull view of one vessel: each section coloured by the selected inspection (`?inspeccion`, the
 * most recent by default), with the selected zone (`?zona=<seccionId>`) and its actions.
 */
export function CascoBuquePage({ buqueId }: { buqueId: number }) {
  const { buques } = useDependencias()
  const cargarBuque = useCallback(() => buques.obtener(buqueId), [buques, buqueId])
  const { estado: buque, reintentar: reintentarBuque } = useRecurso(cargarBuque)
  const filtro = useMemo(() => ({ buqueId }), [buqueId])
  const busqueda = useBusquedaInspecciones(filtro)
  const [inspeccionUrl, fijarInspeccion] = useIdEnUrl('inspeccion')
  const [zonaId, fijarZona] = useIdEnUrl('zona')
  // The inspections page passes the name along so the title is there from the first frame of the transition.
  const desde = useLocation().state as { buqueNombre?: string; volverA?: string } | null
  const nombreConocido = buque.tipo === 'listo' ? buque.datos.nombre : desde?.buqueNombre
  const nombreBuque = nombreConocido ?? 'Embarcación'

  const { estado } = busqueda
  const inspeccionId = inspeccionUrl ?? (estado.tipo === 'listo' ? (estado.resultados[0]?.id ?? null) : null)
  const opciones: OpcionesInspeccion = {
    resultados: estado.tipo === 'listo' ? estado.resultados : [],
    hayMas: estado.tipo === 'listo' && estado.hayMas,
    cargandoMas: estado.tipo === 'listo' && estado.cargandoMas,
    errorMas: estado.tipo === 'listo' ? estado.errorMas : null,
    error: estado.tipo === 'error' ? estado.mensaje : null,
    alCargarMas: busqueda.cargarMas,
    alReintentar: busqueda.reintentar,
  }

  function contenido(datos: BuqueDetalle) {
    const props: PropsVista = {
      buque: datos,
      opciones,
      zonaId,
      alElegirInspeccion: fijarInspeccion,
      alElegirZona: fijarZona,
    }
    if (inspeccionId !== null) return <VistaEnVivo {...props} inspeccionId={inspeccionId} />
    if (estado.tipo === 'cargando') return <Cargando texto="Cargando inspecciones…" />
    if (estado.tipo === 'error') return <MensajeError mensaje={estado.mensaje} alReintentar={busqueda.reintentar} />
    return <VistaCasco {...props} inspeccionId={null} detalle={null} />
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex min-w-0 items-start gap-3">
        <Enlace
          to={desde?.volverA ?? `/inspecciones/buque/${buqueId}`}
          state={{ buqueNombre: nombreConocido }}
          aria-label="Volver a las inspecciones del buque"
          className="mt-1 rounded p-1 text-ink-muted hover:text-ink"
        >
          <Icon name="back" className="size-6" />
        </Enlace>
        <div className="min-w-0">
          <p className="label-caps text-ink-dim">Vista 3D</p>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight md:text-4xl">
            <Icon name="ship" className="size-7 shrink-0 text-ink-dim" />
            <span className="truncate" style={{ viewTransitionName: transicionNombreBuque(buqueId) }}>
              {nombreBuque}
            </span>
          </h1>
        </div>
      </header>

      {buque.tipo === 'cargando' && <Cargando texto="Cargando buque…" />}
      {buque.tipo === 'error' && <MensajeError mensaje={buque.mensaje} alReintentar={reintentarBuque} />}
      {buque.tipo === 'listo' && contenido(buque.datos)}
    </div>
  )
}

const CARGANDO = { tipo: 'cargando' } as const

/**
 * What can be shown of the selected inspection. A result for another inspection than the
 * selected one counts as still loading, and an inspection of another vessel is refused.
 */
function detalleVigente(
  estado: EstadoRecurso<DatosInspeccion>,
  estadoDe: number,
  inspeccionId: number,
  buqueId: number,
): EstadoRecurso<InspeccionDetalle> {
  if (estado.tipo === 'cargando' || estadoDe !== inspeccionId) return CARGANDO
  if (estado.tipo === 'error') return estado
  const { detalle } = estado.datos
  if (detalle.id !== inspeccionId) return CARGANDO
  if (detalle.buqueId !== buqueId) return { tipo: 'error', mensaje: 'La inspección elegida no es de este buque.' }
  return { tipo: 'listo', datos: detalle }
}

/**
 * Keeps the selected inspection live. It is not keyed by inspection on purpose: the view stays
 * mounted when another one is chosen, so the selector keeps its focus and the 3D scene its
 * context. The hook keeps the previous result until the next one arrives, hence `detalleVigente`.
 */
function VistaEnVivo({ inspeccionId, ...props }: PropsVista & { inspeccionId: number }) {
  const { estado, reintentar } = useInspeccionEnVivo(inspeccionId)
  // Each new state belongs to the inspection selected when it arrived: older requests are dropped.
  const [visto, setVisto] = useState({ estado, inspeccionId })
  if (visto.estado !== estado) setVisto({ estado, inspeccionId })
  const detalle = detalleVigente(estado, visto.inspeccionId, inspeccionId, props.buque.id)

  return (
    <VistaCasco
      {...props}
      inspeccionId={inspeccionId}
      detalle={detalle}
      reintentarDetalle={estado.tipo === 'error' ? reintentar : undefined}
    />
  )
}

const SIN_FOTOS: readonly Foto[] = []

/** The vessel sections with their summary: placed on the hull (standard order) or apart. */
function zonasDelBuque(secciones: readonly SeccionCasco[], fotos: readonly Foto[]) {
  const resumenes = resumirZonas(fotos, secciones)
  const listar = (seccion: SeccionCasco): ZonaListada[] => {
    const resumen = resumenes.get(seccion.id)
    return resumen ? [{ seccion, resumen }] : []
  }
  const { ubicadas, sinUbicar } = ubicarSecciones(secciones)
  const enCasco = new Map<CodigoZona, ZonaListada>()
  for (const codigo of CODIGOS_ZONA) {
    const seccion = ubicadas.get(codigo)
    const [zona] = seccion ? listar(seccion) : []
    if (zona) enCasco.set(codigo, zona)
  }
  return { enCasco, sinUbicar: sinUbicar.flatMap(listar) }
}

function VistaCasco({
  buque,
  opciones,
  zonaId,
  alElegirInspeccion,
  alElegirZona,
  inspeccionId,
  detalle,
  reintentarDetalle,
}: PropsVista & {
  inspeccionId: number | null
  /** null when the vessel has no inspection: every zone is then `sin-fotos`. */
  detalle: EstadoRecurso<InspeccionDetalle> | null
  reintentarDetalle?: () => void
}) {
  const inspeccion = detalle?.tipo === 'listo' ? detalle.datos : null
  const fotos = inspeccion?.fotos ?? SIN_FOTOS
  const { enCasco, sinUbicar } = useMemo(() => zonasDelBuque(buque.secciones, fotos), [buque.secciones, fotos])
  const dimensiones = useMemo(() => dimensionesCasco(buque, BUQUE_DE_GUERRA), [buque])
  const lienzo = useMemo(() => {
    const estados = new Map<CodigoZona, EstadoZona>()
    const fotosPorZona = new Map<CodigoZona, number>()
    for (const [codigo, { resumen }] of enCasco) {
      estados.set(codigo, resumen.estado)
      fotosPorZona.set(codigo, resumen.fotos)
    }
    return { estados, fotosPorZona }
  }, [enCasco])

  const ubicadas = [...enCasco.values()]
  const seleccionada = [...ubicadas, ...sinUbicar].find((zona) => zona.seccion.id === zonaId) ?? null
  // Zones are toggles: selecting the selected one clears it.
  const alternar = (seccionId: number) => alElegirZona(seccionId === seleccionada?.seccion.id ? null : seccionId)
  const codigoSeleccionado = [...enCasco].find(([, zona]) => zona === seleccionada)?.[0] ?? null

  const propsLienzo: PropsLienzoCasco = {
    nombreBuque: buque.nombre,
    dimensiones,
    arquetipo: BUQUE_DE_GUERRA,
    estados: lienzo.estados,
    fotosPorZona: lienzo.fotosPorZona,
    cargando: detalle?.tipo === 'cargando',
    seleccionada: codigoSeleccionado,
    onSeleccionar: (codigo) => {
      const zona = codigo === null ? undefined : enCasco.get(codigo)
      if (zona) alternar(zona.seccion.id)
      else alElegirZona(null)
    },
  }

  // An inspection of the URL that is not in the loaded pages is still offered once it loads.
  const opcionesSelector =
    inspeccion && !opciones.resultados.some((i) => i.id === inspeccion.id)
      ? [...opciones.resultados, inspeccion]
      : opciones.resultados
  const listo = detalle === null || detalle.tipo === 'listo'

  return (
    <div className="animar-entrada flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {opciones.error && <MensajeError mensaje={opciones.error} alReintentar={opciones.alReintentar} />}
        <SelectorInspeccion
          opciones={opcionesSelector}
          seleccionadaId={inspeccionId}
          hayMas={opciones.hayMas}
          cargandoMas={opciones.cargandoMas}
          alElegir={alElegirInspeccion}
          alCargarMas={opciones.alCargarMas}
        />
        {opciones.errorMas && <MensajeError mensaje={opciones.errorMas} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Tarjeta titulo="Casco">
            <div className="flex flex-col gap-4">
              <div className="flex aspect-video items-center justify-center overflow-hidden rounded border border-line bg-surface-2 p-4">
                <EscenaCasco {...propsLienzo} />
              </div>
              <LeyendaZonas />
            </div>
          </Tarjeta>
          {listo && (
            <PanelZona
              zona={seleccionada}
              buqueId={buque.id}
              inspeccionId={inspeccionId}
              puedeEditar={inspeccion?.misPermisos.subirFotos ?? false}
            />
          )}
        </div>

        <Tarjeta
          titulo="Secciones del casco"
          accion={<span className="label-caps text-accent-ink">{buque.secciones.length} secciones</span>}
        >
          {detalle?.tipo === 'cargando' && <Cargando texto="Cargando inspección…" />}
          {detalle?.tipo === 'error' && <MensajeError mensaje={detalle.mensaje} alReintentar={reintentarDetalle} />}
          {listo && (
            <ListaZonasCasco ubicadas={ubicadas} sinUbicar={sinUbicar} seleccionadaId={seleccionada?.seccion.id ?? null} alSeleccionar={alternar} />
          )}
        </Tarjeta>
      </div>
    </div>
  )
}
