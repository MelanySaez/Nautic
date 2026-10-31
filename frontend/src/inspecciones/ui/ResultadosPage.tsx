import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Cargando, MensajeError, Vacio } from '../../shared/ui/Estados'
import { Icon } from '../../shared/ui/Icon'
import { clasesControlCompacto } from '../../shared/ui/clasesControl'
import { resumirProgreso, severidadMaxima } from '../domain/reglas'
import { InsigniaSeveridad } from './Insignias'
import { TarjetaResultado } from './TarjetaResultado'
import { useModelos } from './useModelos'
import { useInspeccionEnVivo, type DatosInspeccion } from './useInspeccionEnVivo'

/** Route entry: keys the page by id so switching inspections starts from a clean state. */
export function ResultadosRuta() {
  const { id } = useParams()
  return <ResultadosPage key={id} inspeccionId={Number(id)} />
}

export function ResultadosPage({ inspeccionId }: { inspeccionId: number }) {
  const { estado, reintentar } = useInspeccionEnVivo(inspeccionId)

  if (estado.tipo === 'cargando') return <Cargando texto="Cargando resultados…" />
  if (estado.tipo === 'error') return <MensajeError mensaje={estado.mensaje} alReintentar={reintentar} />
  return <Resultados datos={estado.datos} />
}

function Resultados({ datos }: { datos: DatosInspeccion }) {
  const { detalle, secciones } = datos
  const [zonaId, setZonaId] = useState('')
  const catalogo = useModelos()
  // A failed catalog only costs the friendly label: photos fall back to the raw model id.
  const modelos = catalogo.tipo === 'listo' ? catalogo.datos : []

  const analizadas = detalle.fotos.filter((f) => f.estado === 'completada')
  const visibles = zonaId ? analizadas.filter((f) => String(f.seccion.id) === zonaId) : analizadas
  const progreso = resumirProgreso(detalle.fotos)
  const sinAnalizar = progreso.pendientes + progreso.enProceso
  const maxima = severidadMaxima(analizadas)
  const zonasConResultados = secciones
    .filter((s) => analizadas.some((f) => f.seccion.id === s.id))
    .sort((a, b) => a.orden - b.orden)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          to={`/vision/${detalle.id}`}
          aria-label="Volver a la carga"
          className="rounded p-1 text-ink-muted hover:text-ink"
        >
          <Icon name="back" className="size-6" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="label-caps text-ink-dim">Resultados del análisis · INS-{String(detalle.id).padStart(4, '0')}</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{detalle.buqueNombre}</h1>
        </div>
      </header>

      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador etiqueta="Severidad máxima">
          {maxima ? <InsigniaSeveridad severidad={maxima} /> : <span className="text-ink-dim">—</span>}
        </Indicador>
        <Indicador etiqueta="Fotos analizadas">
          {progreso.completadas} de {progreso.total}
        </Indicador>
        <Indicador etiqueta="Con anomalías">{analizadas.filter((f) => f.detecciones.length > 0).length}</Indicador>
        <Indicador etiqueta="Con error">{progreso.errores}</Indicador>
      </section>

      {sinAnalizar > 0 && (
        <Link
          to={`/vision/${detalle.id}`}
          className="label-caps self-start rounded border border-info/30 bg-info-bg px-3 py-2 text-info hover:border-accent"
        >
          {sinAnalizar} {sinAnalizar === 1 ? 'foto' : 'fotos'} sin analizar · ir a la carga
        </Link>
      )}

      {analizadas.length === 0 ? (
        <Vacio>
          <p>Todavía no hay fotos analizadas.</p>
        </Vacio>
      ) : (
        <>
          <label className="flex items-center gap-3 self-start">
            <span className="label-caps text-ink-muted">Zona</span>
            <select value={zonaId} onChange={(e) => setZonaId(e.target.value)} className={clasesControlCompacto}>
              <option value="">Todas las zonas</option>
              {zonasConResultados.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo} · {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-6 lg:grid-cols-2">
            {visibles.map((foto) => (
              <TarjetaResultado key={foto.id} foto={foto} modelos={modelos} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Indicador({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
      <span className="label-caps text-ink-dim">{etiqueta}</span>
      <span className="text-2xl font-semibold">{children}</span>
    </div>
  )
}
