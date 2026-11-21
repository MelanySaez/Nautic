import { useState, type ReactNode } from 'react'
import { useLocation, useParams } from 'react-router'
import { Enlace } from '../../shared/ui/Enlace'
import { useDependencias } from '../../app/useDependencias'
import { ApiError } from '../../shared/http/apiClient'
import { Boton, EnlaceBoton } from '../../shared/ui/Boton'
import { Cargando, MensajeError, Vacio } from '../../shared/ui/Estados'
import { Icon } from '../../shared/ui/Icon'
import { Modal } from '../../shared/ui/Modal'
import { clasesControlCompacto } from '../../shared/ui/clasesControl'
import { mensajeDe } from '../../shared/ui/formato'
import { resumirProgreso, severidadMaxima, tieneAnomalias } from '../domain/reglas'
import type { InspeccionDetalle } from '../domain/inspeccion'
import { EquipoInspeccion } from './EquipoInspeccion'
import { FormularioNombre } from './FormularioNombre'
import { InsigniaPrivada, InsigniaSeveridad } from './Insignias'
import { useIdEnUrl } from './parametrosUrl'
import { TarjetaResultado } from './TarjetaResultado'
import { useModelos } from './useModelos'
import { useInspeccionEnVivo, type DatosInspeccion } from './useInspeccionEnVivo'

/** Route entry: keys the page by id so switching inspections starts from a clean state. */
export function ResultadosRuta() {
  const { id } = useParams()
  return <ResultadosPage key={id} inspeccionId={Number(id)} />
}

export function ResultadosPage({ inspeccionId }: { inspeccionId: number }) {
  const { estado, reintentar, actualizarDetalle } = useInspeccionEnVivo(inspeccionId)

  if (estado.tipo === 'cargando') return <Cargando texto="Cargando resultados…" />
  if (estado.tipo === 'error') return <MensajeError mensaje={estado.mensaje} alReintentar={reintentar} />
  return <Resultados datos={estado.datos} alActualizarDetalle={actualizarDetalle} />
}

function Resultados({
  datos,
  alActualizarDetalle,
}: {
  datos: DatosInspeccion
  alActualizarDetalle: (cambio: Partial<Omit<InspeccionDetalle, 'fotos'>>) => void
}) {
  const { detalle, secciones } = datos
  const { inspecciones } = useDependencias()
  const [zonaUrl, fijarZonaUrl] = useIdEnUrl('zona')
  const [nombre, setNombre] = useState(detalle.nombre)
  const [renombrando, setRenombrando] = useState(false)
  const [guardandoNombre, setGuardandoNombre] = useState(false)
  const [errorNombre, setErrorNombre] = useState<string | null>(null)
  const catalogo = useModelos()
  // A failed catalog only costs the friendly label: photos fall back to the raw model id.
  const modelos = catalogo.tipo === 'listo' ? catalogo.datos : []

  const analizadas = detalle.fotos.filter((f) => f.estado === 'completada')
  const zonasConResultados = secciones
    .filter((s) => analizadas.some((f) => f.seccion.id === s.id))
    .sort((a, b) => a.orden - b.orden)
  // `?zona=<seccionId>` filters only while that zone is one of the options; otherwise every zone shows.
  const zonaId = zonasConResultados.some((s) => s.id === zonaUrl) ? zonaUrl : null
  const visibles = zonaId === null ? analizadas : analizadas.filter((f) => f.seccion.id === zonaId)
  // Folded by default so the team section stays close; a zone in the URL means "show me these photos".
  const progreso = resumirProgreso(detalle.fotos)
  const sinAnalizar = progreso.pendientes + progreso.enProceso
  const maxima = severidadMaxima(analizadas)
  async function guardarNombre(nuevo: string) {
    setErrorNombre(null)
    setGuardandoNombre(true)
    try {
      // The server answers with the stored name, which is the generated one when the input was blank.
      setNombre((await inspecciones.renombrar(detalle.id, nuevo)).nombre)
      setRenombrando(false)
    } catch (error) {
      setErrorNombre(error instanceof ApiError && error.campos?.nombre?.[0] ? error.campos.nombre[0] : mensajeDe(error))
    } finally {
      setGuardandoNombre(false)
    }
  }

  // Back to the list the card was opened from (with its filters), else the vessel's inspections.
  // The upload page is reached through "Editar inspección".
  const estadoUbicacion = useLocation().state as { volverA?: unknown } | null
  const volverA =
    typeof estadoUbicacion?.volverA === 'string' && estadoUbicacion.volverA.startsWith('/inspecciones/')
      ? estadoUbicacion.volverA
      : undefined

  return (
    <div className="animar-entrada flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <Enlace
          to={volverA ?? `/inspecciones/buque/${detalle.buqueId}`}
          aria-label="Volver a las inspecciones"
          className="rounded p-1 text-ink-muted hover:text-ink"
        >
          <Icon name="back" className="size-6" />
        </Enlace>
        <div className="min-w-0 flex-1">
          <p className="label-caps text-ink-dim">Resultados del análisis · INS-{String(detalle.id).padStart(4, '0')}</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{nombre}</h1>
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="truncate">{detalle.buqueNombre}</span>
            {detalle.privada && <InsigniaPrivada />}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {detalle.misPermisos.editarInspeccion && (
            <Boton
              variante="secundario"
              onClick={() => {
                setErrorNombre(null)
                setRenombrando(true)
              }}
            >
              Renombrar inspección
            </Boton>
          )}
          <EnlaceBoton variante="secundario" to={`/inspecciones/${detalle.id}/reporte`}>
            Reporte
          </EnlaceBoton>
          <EnlaceBoton to={`/vision/${detalle.id}`}>Editar inspección</EnlaceBoton>
        </div>
      </header>

      {renombrando && (
        <Modal titulo="Renombrar inspección" alCerrar={() => !guardandoNombre && setRenombrando(false)}>
          <FormularioNombre
            valorInicial={nombre}
            guardando={guardandoNombre}
            error={errorNombre}
            alGuardar={guardarNombre}
            alCancelar={() => setRenombrando(false)}
          />
        </Modal>
      )}

      {/* Team first and folded: the photo results below always stay open. */}
      <EquipoInspeccion detalle={detalle} alCambiarDetalle={alActualizarDetalle} />

      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador etiqueta="Severidad máxima">
          {maxima ? <InsigniaSeveridad severidad={maxima} /> : <span className="text-ink-dim">—</span>}
        </Indicador>
        <Indicador etiqueta="Fotos analizadas">
          {progreso.completadas} de {progreso.total}
        </Indicador>
        <Indicador etiqueta="Con anomalías">{analizadas.filter(tieneAnomalias).length}</Indicador>
        <Indicador etiqueta="Con error">{progreso.errores}</Indicador>
      </section>

      {sinAnalizar > 0 && (
        <Enlace
          to={`/vision/${detalle.id}`}
          className="label-caps self-start rounded border border-info/30 bg-info-bg px-3 py-2 text-info hover:border-accent"
        >
          {sinAnalizar} {sinAnalizar === 1 ? 'foto' : 'fotos'} sin analizar · ir a la carga
        </Enlace>
      )}

      {analizadas.length === 0 ? (
        <Vacio>
          <p>Todavía no hay fotos analizadas.</p>
        </Vacio>
      ) : (
        <section aria-labelledby="titulo-resultados-foto" className="rounded-lg border border-line bg-surface">
          <h2 id="titulo-resultados-foto" className="label-caps px-4 py-3 text-ink-muted">
            Resultados por foto ({analizadas.length})
          </h2>
          <div className="flex flex-col gap-4 border-t border-line p-4">
            <label className="flex items-center gap-3 self-start">
              <span className="label-caps text-ink-muted">Zona</span>
              <select
                value={zonaId ?? ''}
                onChange={(e) => fijarZonaUrl(e.target.value ? Number(e.target.value) : null)}
                className={clasesControlCompacto}
              >
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
                <TarjetaResultado
                  key={foto.id}
                  foto={foto}
                  modelos={modelos}
                  alCargarDetecciones={(id) => inspecciones.obtenerDetecciones(id)}
                />
              ))}
            </div>
          </div>
        </section>
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
