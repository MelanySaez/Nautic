import { useId, useMemo, useState, type ReactNode } from 'react'
import type { BuqueDetalle } from '../../buques/domain/buque'
import { dimensionesCasco } from '../../buques/domain/casco/dimensiones'
import { CODIGOS_ZONA, ubicarSecciones, type CodigoZona } from '../../buques/domain/casco/zonas'
import { arquetipoDeBuque } from '../../buques/domain/tiposBuque'
import type { EstadoRecurso } from '../../shared/hooks/useRecurso'
import { Boton } from '../../shared/ui/Boton'
import { clasesControlCompacto } from '../../shared/ui/clasesControl'
import { Cargando, MensajeError } from '../../shared/ui/Estados'
import { formatearFecha } from '../../shared/ui/formato'
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
 * Hull of one vessel, each section coloured by the picked inspection (the most recent by default), with the selected
 * zone and its two actions. It lives inside the vessel's inspections page (`?vista=3d`).
 */
export function VistaCascoBuque(props: PropsVistaCascoBuque) {
  // Unfiltered on purpose, apart from the list's own search: the picker offers every inspection
  // of the vessel, whatever filters the list has.
  const { estado, cargarMas, reintentar } = useBusquedaInspecciones({ buqueId: props.buque.id })
  // The inspection the user picked; until then (or if it is gone) the most recent one.
  const [elegidaId, setElegidaId] = useState<number | null>(null)

  if (estado.tipo === 'cargando') return <Cargando texto="Cargando inspecciones…" />
  if (estado.tipo === 'error') return <MensajeError mensaje={estado.mensaje} alReintentar={reintentar} />
  const { resultados } = estado
  const elegida = resultados.find((i) => i.id === elegidaId) ?? resultados[0]
  if (!elegida) return <VistaCasco {...props} selector={null} detalle={null} />

  const selector = (
    <SelectorInspeccion
      inspecciones={resultados}
      elegidaId={elegida.id}
      alElegir={setElegidaId}
      hayMas={estado.hayMas}
      cargandoMas={estado.cargandoMas}
      errorMas={estado.errorMas}
      alCargarMas={cargarMas}
    />
  )
  return <VistaEnVivo {...props} inspeccion={elegida} selector={selector} />
}

/** Picks the inspection that colours the hull; older pages load on demand. */
function SelectorInspeccion({
  inspecciones,
  elegidaId,
  alElegir,
  hayMas,
  cargandoMas,
  errorMas,
  alCargarMas,
}: {
  inspecciones: readonly Inspeccion[]
  elegidaId: number
  alElegir: (id: number) => void
  hayMas: boolean
  cargandoMas: boolean
  errorMas: string | null
  alCargarMas: () => void
}) {
  const id = useId()
  const elegida = inspecciones.find((i) => i.id === elegidaId)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={id} className="text-sm text-ink-muted">
          Colores según la inspección
        </label>
        <select
          id={id}
          value={elegidaId}
          onChange={(e) => alElegir(Number(e.target.value))}
          // Half the strip (full width on phones); a longer name ends in an ellipsis, in full on hover.
          title={elegida?.nombre}
          className={`${clasesControlCompacto} w-full min-w-0 truncate sm:w-1/2`}
        >
          {inspecciones.map((inspeccion, i) => (
            <option key={inspeccion.id} value={inspeccion.id}>
              {`${inspeccion.nombre} · ${formatearFecha(inspeccion.fechaCreacion)}${i === 0 ? ' (más reciente)' : ''}`}
            </option>
          ))}
        </select>
        {hayMas && (
          <Boton variante="secundario" onClick={alCargarMas} disabled={cargandoMas}>
            {cargandoMas ? 'Cargando…' : 'Cargar más inspecciones'}
          </Boton>
        )}
      </div>
      {errorMas && <MensajeError mensaje={errorMas} />}
    </div>
  )
}

const CARGANDO = { tipo: 'cargando' } as const

/** The detail of `inspeccionId` once it has arrived; another inspection's result still counts as loading. */
function detalleVigente(estado: EstadoRecurso<DatosInspeccion>, inspeccionId: number): EstadoRecurso<InspeccionDetalle> {
  if (estado.tipo !== 'listo') return estado
  const { detalle } = estado.datos
  return detalle.id === inspeccionId ? { tipo: 'listo', datos: detalle } : CARGANDO
}

/** Keeps the picked inspection live, so zone colours follow photos analyzed meanwhile. */
function VistaEnVivo({
  inspeccion,
  ...props
}: PropsVistaCascoBuque & { inspeccion: Inspeccion; selector: ReactNode }) {
  const { estado, reintentar } = useInspeccionEnVivo(inspeccion.id)
  // The hook keeps the previous result until the next one arrives: only trust a fresh one.
  const [visto, setVisto] = useState({ estado, id: inspeccion.id })
  if (visto.estado !== estado || visto.id !== inspeccion.id) setVisto({ estado, id: inspeccion.id })
  const detalle = visto.id === inspeccion.id ? detalleVigente(estado, inspeccion.id) : CARGANDO

  return (
    <VistaCasco
      {...props}
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
  selector,
  detalle,
  reintentarDetalle,
}: PropsVistaCascoBuque & {
  /** null when the vessel has no inspection: every zone is then `sin-fotos`. */
  selector: ReactNode | null
  detalle: EstadoRecurso<InspeccionDetalle> | null
  reintentarDetalle?: () => void
}) {
  const fotos = detalle?.tipo === 'listo' ? detalle.datos.fotos : SIN_FOTOS
  const { enCasco, sinUbicar } = useMemo(() => zonasDelBuque(buque.secciones, fotos), [buque.secciones, fotos])
  // The vessel's type shapes the hull; free text from before the catalogue gets the generic warship.
  const arquetipo = arquetipoDeBuque(buque.tipo)
  const dimensiones = useMemo(() => dimensionesCasco(buque, arquetipo), [buque, arquetipo])
  const lienzo = useMemo(() => {
    const estados = new Map<CodigoZona, EstadoZona>()
    const fotosPorZona = new Map<CodigoZona, number>()
    const nombresZona = new Map<CodigoZona, string>()
    for (const [codigo, { seccion, resumen }] of enCasco) {
      estados.set(codigo, resumen.estado)
      fotosPorZona.set(codigo, resumen.fotos)
      nombresZona.set(codigo, seccion.nombre)
    }
    return { estados, fotosPorZona, nombresZona }
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
      {selector ?? <p className="text-sm text-ink-muted">Este buque aún no tiene inspecciones.</p>}

      {/* The hull is the page: full width, with the selected zone and its actions under it. */}
      <div className="flex flex-col gap-3">
        <div className="relative flex aspect-video max-h-[72vh] w-full items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2">
          <EscenaCasco {...propsLienzo} />
        </div>
        <LeyendaZonas />
      </div>

      {detalle?.tipo === 'cargando' && <Cargando texto="Cargando inspección…" />}
      {detalle?.tipo === 'error' && <MensajeError mensaje={detalle.mensaje} alReintentar={reintentarDetalle} />}
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
