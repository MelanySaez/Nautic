import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDependencias } from '../../app/useDependencias'
import type { BuqueDetalle } from '../../buques/domain/buque'
import { dimensionesCasco } from '../../buques/domain/casco/dimensiones'
import { CODIGOS_ZONA, ubicarSecciones, type CodigoZona } from '../../buques/domain/casco/zonas'
import { arquetipoDeBuque } from '../../buques/domain/tiposBuque'
import { useRecurso, type EstadoRecurso } from '../../shared/hooks/useRecurso'
import { Cargando, MensajeError } from '../../shared/ui/Estados'
import type { Inspeccion, SeccionCasco, ZonaReciente } from '../domain/inspeccion'
import { resumirZonas, type EstadoZona } from '../domain/resumenZonas'
import { EscenaCasco } from './casco/EscenaCasco'
import { LeyendaZonas } from './casco/LeyendaZonas'
import type { PropsLienzoCasco } from './casco/lienzoCasco'
import { ListaZonasCasco, type ZonaListada } from './casco/ListaZonasCasco'
import { PanelZona } from './casco/PanelZona'
import { useBusquedaInspecciones } from './useBusquedaInspecciones'

export interface PropsVistaCascoBuque {
  buque: BuqueDetalle
  /** Selected section (`?zona=<seccionId>`), or null. */
  zonaId: number | null
  alElegirZona: (seccionId: number | null) => void
  /** Shows the inspections list filtered by this section. */
  alVerInspecciones: (seccionId: number) => void
}

/**
 * Hull of one vessel, each section coloured by the most recent inspection that photographed it,
 * with the selected zone and its actions. It lives inside the vessel's inspections page (`?vista=3d`).
 */
export function VistaCascoBuque(props: PropsVistaCascoBuque) {
  // Unfiltered on purpose, apart from the list's own search: live updates follow the latest
  // inspection of the vessel, whatever filters the list has.
  const { estado, reintentar } = useBusquedaInspecciones({ buqueId: props.buque.id })

  if (estado.tipo === 'cargando') return <Cargando texto="Cargando inspecciones…" />
  if (estado.tipo === 'error') return <MensajeError mensaje={estado.mensaje} alReintentar={reintentar} />
  const ultima = estado.resultados[0]
  if (!ultima) return <VistaCasco {...props} ultima={null} zonas={null} />
  return <VistaEnVivo {...props} ultima={ultima} />
}

/**
 * Loads the latest inspection of every zone and loads it again whenever a photo of the vessel's
 * latest inspection is uploaded, analyzed or deleted (server-sent events, no polling).
 */
function useZonasRecientes(buqueId: number, ultimaId: number) {
  const { inspecciones, eventos } = useDependencias()
  const [version, setVersion] = useState(0)
  // A new `version` gives `cargar` a new identity: the resource asks again and keeps showing the
  // previous zones until the answer arrives (older answers are discarded).
  const cargar = useCallback(
    () => inspecciones.zonasRecientes(buqueId),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `version` only forces a reload.
    [inspecciones, buqueId, version],
  )
  const recurso = useRecurso(cargar)
  useEffect(() => eventos.suscribir(ultimaId, () => setVersion((v) => v + 1)), [eventos, ultimaId])
  return recurso
}

function VistaEnVivo({ ultima, ...props }: PropsVistaCascoBuque & { ultima: Inspeccion }) {
  const { estado, reintentar } = useZonasRecientes(props.buque.id, ultima.id)
  return <VistaCasco {...props} ultima={ultima} zonas={estado} reintentarZonas={reintentar} />
}

const SIN_ZONAS: readonly ZonaReciente[] = []

/**
 * The vessel sections, each with the summary of its own latest inspection: placed on the hull
 * (standard order) or apart. Sections without an entry read as `sin-fotos`.
 */
function zonasDelBuque(secciones: readonly SeccionCasco[], recientes: readonly ZonaReciente[]) {
  const porSeccion = new Map(recientes.map((zona) => [zona.seccionId, zona]))
  const listar = (seccion: SeccionCasco): ZonaListada[] => {
    const reciente = porSeccion.get(seccion.id)
    const resumen = resumirZonas(reciente?.fotos ?? [], [seccion]).get(seccion.id)
    return resumen ? [{ seccion, resumen, inspeccion: reciente?.inspeccion ?? null }] : []
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
  zonas,
  reintentarZonas,
}: PropsVistaCascoBuque & {
  /** null when the vessel has no inspection: every zone is then `sin-fotos`. */
  ultima: Inspeccion | null
  zonas: EstadoRecurso<ZonaReciente[]> | null
  reintentarZonas?: () => void
}) {
  const recientes = zonas?.tipo === 'listo' ? zonas.datos : SIN_ZONAS
  const { enCasco, sinUbicar } = useMemo(() => zonasDelBuque(buque.secciones, recientes), [buque.secciones, recientes])
  // The vessel's type shapes the hull; free text from before the catalogue gets the generic warship.
  const arquetipo = arquetipoDeBuque(buque.tipo)
  const dimensiones = useMemo(() => dimensionesCasco(buque, arquetipo), [buque, arquetipo])
  const lienzo = useMemo(() => {
    const estados = new Map<CodigoZona, EstadoZona>()
    const fotosPorZona = new Map<CodigoZona, number>()
    const nombresZona = new Map<CodigoZona, string>()
    const inspeccionesZona = new Map<CodigoZona, string>()
    for (const [codigo, { seccion, resumen, inspeccion }] of enCasco) {
      estados.set(codigo, resumen.estado)
      fotosPorZona.set(codigo, resumen.fotos)
      nombresZona.set(codigo, seccion.nombre)
      if (inspeccion) inspeccionesZona.set(codigo, inspeccion.nombre)
    }
    return { estados, fotosPorZona, nombresZona, inspeccionesZona }
  }, [enCasco])

  const ubicadas = [...enCasco.values()]
  const seleccionada = [...ubicadas, ...sinUbicar].find((zona) => zona.seccion.id === zonaId) ?? null
  // Zones are toggles: selecting the selected one clears it.
  const alternar = (seccionId: number) => alElegirZona(seccionId === seleccionada?.seccion.id ? null : seccionId)
  const codigoSeleccionado = [...enCasco].find(([, zona]) => zona === seleccionada)?.[0] ?? null

  const propsLienzo: PropsLienzoCasco = {
    nombreBuque: buque.nombre,
    dimensiones,
    arquetipo,
    estados: lienzo.estados,
    fotosPorZona: lienzo.fotosPorZona,
    nombresZona: lienzo.nombresZona,
    inspeccionesZona: lienzo.inspeccionesZona,
    cargando: zonas?.tipo === 'cargando',
    seleccionada: codigoSeleccionado,
    onSeleccionar: (codigo) => {
      const zona = codigo === null ? undefined : enCasco.get(codigo)
      if (zona) alternar(zona.seccion.id)
      else alElegirZona(null)
    },
  }
  const listo = zonas === null || zonas.tipo === 'listo'

  return (
    <div className="animar-entrada flex flex-col gap-6">
      <p className="text-sm text-ink-muted">
        {ultima ? 'Cada zona muestra su inspección más reciente con fotos de esa sección.' : 'Este buque aún no tiene inspecciones.'}
      </p>

      {/* The hull is the page: full width, with the selected zone and its actions under it. */}
      <div className="flex flex-col gap-3">
        <div className="relative flex aspect-video max-h-[72vh] w-full items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2">
          <EscenaCasco {...propsLienzo} />
        </div>
        <LeyendaZonas />
      </div>

      {zonas?.tipo === 'cargando' && <Cargando texto="Cargando zonas…" />}
      {zonas?.tipo === 'error' && <MensajeError mensaje={zonas.mensaje} alReintentar={reintentarZonas} />}
      {listo && <PanelZona zona={seleccionada} buqueId={buque.id} alVerInspecciones={alVerInspecciones} />}

      {/* Keyboard and screen reader path to every section, folded so the hull stays the focus. */}
      {listo && (
        <details
          aria-label={`Lista de secciones (${buque.secciones.length})`}
          className="rounded-lg border border-line bg-surface"
        >
          <summary className="label-caps cursor-pointer px-4 py-3 text-ink-muted hover:text-ink">
            Lista de secciones ({buque.secciones.length})
          </summary>
          <div className="border-t border-line p-4">
            <ListaZonasCasco
              ubicadas={ubicadas}
              sinUbicar={sinUbicar}
              seleccionadaId={seleccionada?.seccion.id ?? null}
              alSeleccionar={alternar}
            />
          </div>
        </details>
      )}
    </div>
  )
}
