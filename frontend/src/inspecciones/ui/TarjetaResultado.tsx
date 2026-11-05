import { useMemo, useRef, useState } from 'react'
import { MensajeError } from '../../shared/ui/Estados'
import { mensajeDe, porcentaje } from '../../shared/ui/formato'
import type { DetallePorInstancia } from '../domain/detecciones'
import type { Deteccion, Foto } from '../domain/inspeccion'
import { etiquetaModelo, type ModeloIA } from '../domain/modelo'
import { esAnomalia } from '../domain/reglas'
import { CapaDetecciones } from './CapaDetecciones'
import { InsigniaSeveridad } from './Insignias'

function segundos(ms: number | null): string {
  return ms === null ? '—' : `${(ms / 1000).toFixed(2)} s`
}

function ListaDetecciones({ titulo, detecciones }: { titulo: string; detecciones: Deteccion[] }) {
  return (
    <ul aria-label={titulo} className="divide-y divide-line border-t border-line">
      {detecciones.map((d) => (
        <li key={d.clase} className="flex items-baseline justify-between gap-3 py-2">
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="font-semibold first-letter:uppercase">{d.etiqueta}</span>
            <span className="font-mono text-xs text-ink-dim">×{d.cantidad}</span>
            {d.severidad && <InsigniaSeveridad severidad={d.severidad} />}
          </span>
          <span className="font-mono text-xs text-ink-muted">
            Confianza: <strong className="text-ink">{porcentaje(d.confianzaMaxima)}</strong>
          </span>
        </li>
      ))}
    </ul>
  )
}

type EstadoDetalle =
  | { tipo: 'apagado' }
  | { tipo: 'cargando' }
  | { tipo: 'listo'; detalle: DetallePorInstancia }
  | { tipo: 'error'; mensaje: string }

function Interruptor({ etiqueta, activo, deshabilitado, alCambiar }: {
  etiqueta: string
  activo: boolean
  deshabilitado?: boolean
  alCambiar: (activo: boolean) => void
}) {
  return (
    <label className="label-caps flex cursor-pointer items-center gap-2 text-ink-muted has-disabled:cursor-not-allowed has-disabled:opacity-50">
      {etiqueta}
      <input
        type="checkbox"
        role="switch"
        checked={activo}
        disabled={deshabilitado}
        onChange={(e) => alCambiar(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-5 w-9 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
      />
    </label>
  )
}

function FiltroClases({ detalle, ocultas, alAlternar }: {
  detalle: DetallePorInstancia
  ocultas: Set<string>
  alAlternar: (clase: string) => void
}) {
  const clases = [...new Map(detalle.instancias.map((i) => [i.clase, i])).values()]
  const visibles = detalle.instancias.filter((i) => !ocultas.has(i.clase)).length
  return (
    <fieldset aria-label="Clases visibles" className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {clases.map((c) => (
        <label key={c.clase} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!ocultas.has(c.clase)} onChange={() => alAlternar(c.clase)} />
          <span aria-hidden="true" className="size-3 rounded-sm" style={{ backgroundColor: c.color ?? undefined }} />
          <span className="first-letter:uppercase">{c.etiqueta}</span>
        </label>
      ))}
      <span className="font-mono text-xs text-ink-dim">
        Mostrando {visibles} de {detalle.instancias.length} detecciones
      </span>
    </fieldset>
  )
}

export function TarjetaResultado({ foto, modelos, alCargarDetecciones }: {
  foto: Foto
  modelos: ModeloIA[]
  alCargarDetecciones: (fotoId: number) => Promise<DetallePorInstancia>
}) {
  const [anotada, setAnotada] = useState(true)
  const [contornos, setContornos] = useState<EstadoDetalle>({ tipo: 'apagado' })
  const [ocultas, setOcultas] = useState<Set<string>>(new Set())
  // Bumped on every toggle so a response for an earlier request cannot turn the overlay back on.
  const solicitud = useRef(0)
  const titulo = `${foto.seccion.codigo} · Foto #${foto.id}`
  const tieneAnotada = Boolean(foto.imagenAnotada)
  const modelo = etiquetaModelo(foto.modelo, foto.modeloVersion, modelos)
  const conContornos = contornos.tipo !== 'apagado'
  // The overlay is drawn in the original image's pixel space, so it always sits on the original.
  const verAnotada = tieneAnotada && anotada && !conContornos
  const imagen = verAnotada ? foto.imagenAnotada : foto.imagenOriginal
  const detalle = contornos.tipo === 'listo' ? contornos.detalle : null
  const visibles = useMemo(
    () => (detalle ? detalle.instancias.filter((i) => !ocultas.has(i.clase)) : []),
    [detalle, ocultas],
  )

  async function alternarContornos(activo: boolean) {
    const actual = ++solicitud.current
    if (!activo) {
      setContornos({ tipo: 'apagado' })
      return
    }
    setContornos({ tipo: 'cargando' })
    try {
      const detalle = await alCargarDetecciones(foto.id)
      if (actual === solicitud.current) setContornos({ tipo: 'listo', detalle })
    } catch (error) {
      if (actual === solicitud.current) setContornos({ tipo: 'error', mensaje: mensajeDe(error) })
    }
  }

  function alternarClase(clase: string) {
    setOcultas((previas) => {
      const siguientes = new Set(previas)
      if (siguientes.has(clase)) siguientes.delete(clase)
      else siguientes.add(clase)
      return siguientes
    })
  }
  const anomalias = foto.detecciones.filter(esAnomalia)
  const componentes = foto.detecciones.filter((d) => !esAnomalia(d))

  return (
    <article aria-label={titulo} className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="label-caps truncate text-ink-muted">{titulo}</h3>
          <p className="text-xs text-ink-dim">{foto.seccion.nombre}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {tieneAnotada && (
            <Interruptor etiqueta="Mostrar anotada" activo={verAnotada} deshabilitado={conContornos} alCambiar={setAnotada} />
          )}
          {foto.detalleDisponible && (
            <Interruptor etiqueta="Mostrar contornos" activo={conContornos} alCambiar={alternarContornos} />
          )}
        </div>
      </header>

      <div className="flex justify-center bg-surface-2">
        {imagen && (
          <div className="relative">
            <img
              src={imagen}
              alt={`${verAnotada ? 'Imagen anotada' : 'Imagen original'} de ${titulo}`}
              loading="lazy"
              className="block max-h-[28rem] max-w-full"
            />
            {detalle && <CapaDetecciones detalle={detalle} instancias={visibles} />}
          </div>
        )}
      </div>
      {contornos.tipo === 'cargando' && <p className="px-4 pt-3 text-sm text-ink-muted">Cargando contornos…</p>}
      {contornos.tipo === 'error' && (
        <div className="px-4 pt-3">
          <MensajeError mensaje={contornos.mensaje} />
        </div>
      )}
      {detalle && (
        <div className="border-b border-line px-4 py-3">
          <FiltroClases detalle={detalle} ocultas={ocultas} alAlternar={alternarClase} />
        </div>
      )}

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-ink-muted">
            Inferencia: {segundos(foto.tiempoInferenciaMs)}
            {modelo && ` · Modelo: ${modelo}`}
          </span>
          {foto.severidad && <InsigniaSeveridad severidad={foto.severidad} />}
        </div>
        {anomalias.length === 0 ? (
          <p className="text-sm text-ink-muted">Sin anomalías detectadas.</p>
        ) : (
          <ListaDetecciones titulo="Anomalías" detecciones={anomalias} />
        )}
        {componentes.length > 0 && (
          <div className="flex flex-col gap-1">
            <h4 className="label-caps text-ink-dim">Componentes</h4>
            <ListaDetecciones titulo="Componentes" detecciones={componentes} />
          </div>
        )}
      </div>
    </article>
  )
}
