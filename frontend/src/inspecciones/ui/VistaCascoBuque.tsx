import { useMemo, useState } from 'react'
import type { BuqueDetalle } from '../../buques/domain/buque'
import { BUQUE_DE_GUERRA } from '../../buques/domain/casco/arquetipo'
import { dimensionesCasco } from '../../buques/domain/casco/dimensiones'
import { CODIGOS_ZONA, ubicarSecciones, type CodigoZona } from '../../buques/domain/casco/zonas'
import type { EstadoRecurso } from '../../shared/hooks/useRecurso'
import { Cargando, MensajeError } from '../../shared/ui/Estados'
import { Tarjeta } from '../../shared/ui/Tarjeta'
import type { Foto, Inspeccion, InspeccionDetalle, SeccionCasco } from '../domain/inspeccion'
import { resumirZonas, type EstadoZona } from '../domain/resumenZonas'
import { EscenaCasco } from './casco/EscenaCasco'
import { LeyendaZonas } from './casco/LeyendaZonas'
import type { PropsLienzoCasco } from './casco/lienzoCasco'
import { ListaZonasCasco, type ZonaListada } from './casco/ListaZonasCasco'
import { PanelZona } from './casco/PanelZona'
import { useBusquedaInspecciones } from './useBusquedaInspecciones'
import { useInspeccionEnVivo, type DatosInspeccion } from './useInspeccionEnVivo'

export interface PropsVistaCascoBuque {
  buque: BuqueDetalle
  /** Selected section (`?zona=<seccionId>`), or null. */
  zonaId: number | null
  alElegirZona: (seccionId: number | null) => void
  /** Shows the inspections list filtered by this section. */
  alVerInspecciones: (seccionId: number) => void
}

/**
 * Hull of one vessel, each section coloured by the most recent inspection, with the selected
 * zone and its two actions. It lives inside the vessel's inspections page (`?vista=3d`).
 */
export function VistaCascoBuque(props: PropsVistaCascoBuque) {
  // Unfiltered on purpose: the colours always follow the latest inspection of the vessel.
  const filtro = useMemo(() => ({ buqueId: props.buque.id }), [props.buque.id])
  const { estado, reintentar } = useBusquedaInspecciones(filtro)

  if (estado.tipo === 'cargando') return <Cargando texto="Cargando inspecciones…" />
  if (estado.tipo === 'error') return <MensajeError mensaje={estado.mensaje} alReintentar={reintentar} />
  const ultima = estado.resultados[0]
  if (!ultima) return <VistaCasco {...props} ultima={null} detalle={null} />
  return <VistaEnVivo {...props} ultima={ultima} />
}

const CARGANDO = { tipo: 'cargando' } as const

/** The detail of `inspeccionId` once it has arrived; another inspection's result still counts as loading. */
function detalleVigente(estado: EstadoRecurso<DatosInspeccion>, inspeccionId: number): EstadoRecurso<InspeccionDetalle> {
  if (estado.tipo !== 'listo') return estado
  const { detalle } = estado.datos
  return detalle.id === inspeccionId ? { tipo: 'listo', datos: detalle } : CARGANDO
}

/** Keeps the latest inspection live, so zone colours follow photos analyzed meanwhile. */
function VistaEnVivo({ ultima, ...props }: PropsVistaCascoBuque & { ultima: Inspeccion }) {
  const { estado, reintentar } = useInspeccionEnVivo(ultima.id)
  // The hook keeps the previous result until the next one arrives: only trust a fresh one.
  const [visto, setVisto] = useState({ estado, id: ultima.id })
  if (visto.estado !== estado) setVisto({ estado, id: ultima.id })
  const detalle = visto.id === ultima.id ? detalleVigente(estado, ultima.id) : CARGANDO

  return (
    <VistaCasco
      {...props}
      ultima={ultima}
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
  zonaId,
  alElegirZona,
  alVerInspecciones,
  ultima,
  detalle,
  reintentarDetalle,
}: PropsVistaCascoBuque & {
  /** null when the vessel has no inspection: every zone is then `sin-fotos`. */
  ultima: Inspeccion | null
  detalle: EstadoRecurso<InspeccionDetalle> | null
  reintentarDetalle?: () => void
}) {
  const fotos = detalle?.tipo === 'listo' ? detalle.datos.fotos : SIN_FOTOS
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
  const listo = detalle === null || detalle.tipo === 'listo'

  return (
    <div className="animar-entrada flex flex-col gap-6">
      <p className="text-sm text-ink-muted">
        {ultima ? (
          <>
            Colores según la última inspección: <span className="font-semibold text-ink">{ultima.nombre}</span>
          </>
        ) : (
          'Este buque aún no tiene inspecciones.'
        )}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Tarjeta titulo="Casco">
            <div className="flex flex-col gap-4">
              {/* No padding: the 3D canvas fills the frame; the silhouette pads itself. */}
              <div className="flex aspect-video items-center justify-center overflow-hidden rounded border border-line bg-surface-2">
                <EscenaCasco {...propsLienzo} />
              </div>
              <LeyendaZonas />
            </div>
          </Tarjeta>
          {listo && <PanelZona zona={seleccionada} buqueId={buque.id} alVerInspecciones={alVerInspecciones} />}
        </div>

        <Tarjeta
          titulo="Secciones del casco"
          accion={<span className="label-caps text-accent-ink">{buque.secciones.length} secciones</span>}
        >
          {detalle?.tipo === 'cargando' && <Cargando texto="Cargando inspección…" />}
          {detalle?.tipo === 'error' && <MensajeError mensaje={detalle.mensaje} alReintentar={reintentarDetalle} />}
          {listo && (
            <ListaZonasCasco
              ubicadas={ubicadas}
              sinUbicar={sinUbicar}
              seleccionadaId={seleccionada?.seccion.id ?? null}
              alSeleccionar={alternar}
            />
          )}
        </Tarjeta>
      </div>
    </div>
  )
}
