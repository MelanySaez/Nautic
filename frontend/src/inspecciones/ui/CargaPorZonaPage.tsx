import { useMemo, useState, type DragEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useDependencias } from '../../app/useDependencias'
import { Boton, EnlaceBoton } from '../../shared/ui/Boton'
import { Cargando, MensajeError, Vacio } from '../../shared/ui/Estados'
import { Icon } from '../../shared/ui/Icon'
import { Tarjeta } from '../../shared/ui/Tarjeta'
import { mensajeDe } from '../../shared/ui/formato'
import type { EventoInspeccion, Foto, SeccionCasco } from '../domain/inspeccion'
import { resumirProgreso } from '../domain/reglas'
import { ColaFotos } from './ColaFotos'
import { MapaZonas } from './MapaZonas'
import { useInspeccionEnVivo, type DatosInspeccion } from './useInspeccionEnVivo'

/** Route entry: keys the page by id so switching inspections starts from a clean state. */
export function CargaPorZonaRuta() {
  const { id } = useParams()
  return <CargaPorZonaPage key={id} inspeccionId={Number(id)} />
}

export function CargaPorZonaPage({ inspeccionId }: { inspeccionId: number }) {
  const { estado, reintentar, aplicar } = useInspeccionEnVivo(inspeccionId)

  if (estado.tipo === 'cargando') return <Cargando texto="Cargando inspección…" />
  if (estado.tipo === 'error') return <MensajeError mensaje={estado.mensaje} alReintentar={reintentar} />
  return <CargaPorZona datos={estado.datos} aplicar={aplicar} />
}

function textoAnalisis(iniciadas: number, omitidas: number): string {
  const base = `Análisis iniciado para ${iniciadas} ${iniciadas === 1 ? 'foto' : 'fotos'}.`
  return omitidas > 0 ? `${base} ${omitidas} en espera por límite de tareas concurrentes.` : base
}

function CargaPorZona({ datos, aplicar }: { datos: DatosInspeccion; aplicar: (evento: EventoInspeccion) => void }) {
  const { inspecciones } = useDependencias()
  const { detalle, secciones } = datos
  const [zona, setZona] = useState<SeccionCasco | null>(null)
  const [subiendo, setSubiendo] = useState(0)
  const [errores, setErrores] = useState<string[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const [analizando, setAnalizando] = useState(false)
  const [ocupadas, setOcupadas] = useState<Set<number>>(new Set())
  const [arrastrando, setArrastrando] = useState(false)

  const progreso = resumirProgreso(detalle.fotos)
  const fotosPorSeccion = useMemo(() => {
    const conteo = new Map<number, number>()
    for (const foto of detalle.fotos) conteo.set(foto.seccion.id, (conteo.get(foto.seccion.id) ?? 0) + 1)
    return conteo
  }, [detalle.fotos])

  async function subir(archivos: File[]) {
    if (!zona || archivos.length === 0) return
    setErrores([])
    setSubiendo((n) => n + archivos.length)
    // Sequential on purpose: the backend rate-limits uploads per minute and per IP.
    for (const archivo of archivos) {
      try {
        aplicar({ tipo: 'foto-creada', foto: await inspecciones.subirFoto(detalle.id, zona.id, archivo) })
      } catch (error) {
        setErrores((previos) => [...previos, `${archivo.name}: ${mensajeDe(error)}`])
      } finally {
        setSubiendo((n) => n - 1)
      }
    }
  }

  function alSoltar(evento: DragEvent) {
    evento.preventDefault()
    setArrastrando(false)
    void subir([...evento.dataTransfer.files].filter((f) => f.type.startsWith('image/')))
  }

  async function analizar() {
    setErrores([])
    setAviso(null)
    setAnalizando(true)
    try {
      const { iniciadas, omitidasPorLimite } = await inspecciones.analizar(detalle.id)
      setAviso(textoAnalisis(iniciadas, omitidasPorLimite))
    } catch (error) {
      setErrores([mensajeDe(error)])
    } finally {
      setAnalizando(false)
    }
  }

  async function conFotoOcupada(foto: Foto, accion: () => Promise<void>) {
    setErrores([])
    setOcupadas((s) => new Set(s).add(foto.id))
    try {
      await accion()
    } catch (error) {
      setErrores([mensajeDe(error)])
    } finally {
      setOcupadas((s) => {
        const copia = new Set(s)
        copia.delete(foto.id)
        return copia
      })
    }
  }

  const reintentarFoto = (foto: Foto) =>
    conFotoOcupada(foto, async () => {
      const f = await inspecciones.reintentarFoto(foto.id)
      aplicar({
        tipo: 'foto-actualizada',
        actualizacion: {
          fotoId: f.id,
          estado: f.estado,
          severidad: f.severidad,
          detecciones: f.detecciones,
          tiempoInferenciaMs: f.tiempoInferenciaMs,
          imagenAnotada: f.imagenAnotada,
          errorDetalle: f.errorDetalle,
        },
      })
    })

  const eliminarFoto = (foto: Foto) => {
    if (!window.confirm(`¿Eliminar la foto #${foto.id} de ${foto.seccion.codigo}?`)) return
    void conFotoOcupada(foto, async () => {
      await inspecciones.eliminarFoto(foto.id)
      aplicar({ tipo: 'foto-eliminada', fotoId: foto.id })
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/" aria-label="Volver al listado" className="rounded p-1 text-ink-muted hover:text-ink">
          <Icon name="back" className="size-6" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="label-caps text-ink-dim">Carga por zona · INS-{String(detalle.id).padStart(4, '0')}</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{detalle.buqueNombre}</h1>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Tarjeta titulo="Mapa del casco" accion={<span className="label-caps text-accent-ink">{secciones.length} zonas</span>}>
          {secciones.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Este buque no tiene secciones del casco declaradas.
            </p>
          ) : (
            <MapaZonas
              secciones={secciones}
              seleccionadaId={zona?.id ?? null}
              fotosPorSeccion={fotosPorSeccion}
              alSeleccionar={setZona}
            />
          )}
        </Tarjeta>

        <div className="flex flex-col gap-4">
          <section aria-label="Zona activa" className="flex items-center gap-4 rounded-lg bg-primary px-5 py-4 text-on-primary">
            <Icon name="pin" className="size-7 shrink-0" />
            {zona ? (
              <div>
                <p className="label-caps opacity-70">Zona activa · {zona.codigo}</p>
                <p className="text-xl font-semibold">{zona.nombre}</p>
              </div>
            ) : (
              <p className="text-sm">Selecciona una zona del casco para cargar fotos.</p>
            )}
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <label
              onDragOver={(e) => {
                e.preventDefault()
                if (zona) setArrastrando(true)
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={alSoltar}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center has-disabled:cursor-not-allowed has-disabled:opacity-50 ${
                arrastrando ? 'border-accent bg-info-bg' : 'border-line-strong hover:border-accent'
              }`}
            >
              <Icon name="upload" className="size-7 text-ink-muted" />
              <span className="font-semibold">Subir fotos</span>
              <span className="text-sm text-ink-muted">Arrastra y suelta o explora</span>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={!zona}
                aria-label="Subir fotos"
                className="sr-only"
                onChange={(e) => {
                  void subir([...(e.target.files ?? [])])
                  e.target.value = ''
                }}
              />
            </label>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg bg-accent-ink px-4 py-6 text-center text-white has-disabled:cursor-not-allowed has-disabled:opacity-50 dark:text-canvas">
              <Icon name="photos" className="size-7" />
              <span className="font-semibold">Tomar foto</span>
              <span className="text-sm opacity-80">Usar la cámara del dispositivo</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={!zona}
                aria-label="Tomar foto"
                className="sr-only"
                onChange={(e) => {
                  void subir([...(e.target.files ?? [])])
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          {subiendo > 0 && (
            <p className="label-caps text-info">
              Subiendo {subiendo} {subiendo === 1 ? 'foto' : 'fotos'}…
            </p>
          )}
        </div>
      </div>

      {errores.length > 0 && <MensajeError mensaje={errores.join(' · ')} />}
      {aviso && (
        <p role="status" className="rounded border border-info/30 bg-info-bg px-4 py-3 text-sm text-info">
          {aviso}
        </p>
      )}

      <Tarjeta
        titulo="Cola de carga y estado"
        accion={
          <span className="label-caps text-ink-muted">
            {progreso.completadas + progreso.errores} de {progreso.total} analizadas
          </span>
        }
      >
        <div className="mb-4 flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Progreso del análisis"
            aria-valuenow={progreso.porcentaje}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progreso.porcentaje}%` }} />
          </div>
          <span className="font-mono text-sm font-semibold text-accent-ink">{progreso.porcentaje}%</span>
        </div>
        {detalle.fotos.length === 0 ? (
          <Vacio>
            <p>Esta inspección todavía no tiene fotos.</p>
          </Vacio>
        ) : (
          <ColaFotos fotos={detalle.fotos} ocupadas={ocupadas} alReintentar={reintentarFoto} alEliminar={eliminarFoto} />
        )}
      </Tarjeta>

      <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-line bg-canvas/95 px-4 py-4 backdrop-blur sm:justify-end">
        <EnlaceBoton to={`/inspecciones/${detalle.id}/resultados`} variante="secundario" className="flex-1 sm:flex-none">
          Ver resultados
        </EnlaceBoton>
        <Boton onClick={analizar} disabled={analizando || progreso.pendientes === 0} className="flex-1 sm:flex-none">
          <Icon name="search" className="size-4" />
          Iniciar análisis
        </Boton>
      </div>
    </div>
  )
}
