import { useCallback, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { useDependencias } from '../../app/useDependencias'
import { useRecurso } from '../../shared/hooks/useRecurso'
import { ApiError } from '../../shared/http/apiClient'
import { AnclaBoton, Boton } from '../../shared/ui/Boton'
import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import { Enlace } from '../../shared/ui/Enlace'
import { Cargando, MensajeError, Vacio } from '../../shared/ui/Estados'
import { Icon } from '../../shared/ui/Icon'
import { Tarjeta } from '../../shared/ui/Tarjeta'
import { mensajeDe } from '../../shared/ui/formato'
import {
  cambiosDeReporte,
  edicionDesde,
  type BorradorReporte,
  type EdicionReporte,
  type TextosReporte,
} from '../domain/reporte'
import { FotoRevision } from './FotoRevision'

/** Wire (snake_case) name of each text -> form key, to place server field errors. */
const CLAVE_POR_CAMPO_API: Record<string, keyof TextosReporte> = {
  conclusion: 'conclusion',
  observaciones: 'observaciones',
  recomendaciones: 'recomendaciones',
  inspector_nombre: 'inspectorNombre',
  inspector_cargo: 'inspectorCargo',
}

/** Route entry: keys the page by id so switching inspections starts from a clean state. */
export function ReporteRuta() {
  const { id } = useParams()
  return <ReportePage key={id} inspeccionId={Number(id)} />
}

export function ReportePage({ inspeccionId }: { inspeccionId: number }) {
  const { inspecciones } = useDependencias()
  const cargar = useCallback(() => inspecciones.obtenerReporte(inspeccionId), [inspecciones, inspeccionId])
  const { estado, reintentar } = useRecurso(cargar)

  if (estado.tipo === 'cargando') return <Cargando texto="Cargando reporte…" />
  if (estado.tipo === 'error') {
    return (
      <Marco inspeccionId={inspeccionId}>
        <MensajeError mensaje={estado.mensaje} alReintentar={reintentar} />
      </Marco>
    )
  }
  return <Editor inspeccionId={inspeccionId} inicial={estado.datos} />
}

function Marco({ inspeccionId, children }: { inspeccionId: number; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex items-center gap-3">
        <Enlace
          to={`/inspecciones/${inspeccionId}/resultados`}
          aria-label="Volver a resultados"
          className="rounded p-1 text-ink-muted hover:text-ink"
        >
          <Icon name="back" className="size-6" />
        </Enlace>
        <div className="min-w-0 flex-1">
          <p className="label-caps text-ink-dim">INS-{String(inspeccionId).padStart(4, '0')}</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Reporte de inspección</h1>
        </div>
      </header>
      {children}
    </div>
  )
}

function Editor({ inspeccionId, inicial }: { inspeccionId: number; inicial: BorradorReporte }) {
  const { inspecciones } = useDependencias()
  const [guardado, setGuardado] = useState(inicial)
  const [edicion, setEdicion] = useState<EdicionReporte>(() => edicionDesde(inicial))
  const [errores, setErrores] = useState<Partial<Record<keyof TextosReporte, string>>>({})
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cambios = cambiosDeReporte(guardado, edicion)
  const hayCambios = Object.keys(cambios).length > 0

  function cambiarTexto(clave: keyof TextosReporte, valor: string) {
    setEdicion((actual) => ({ ...actual, textos: { ...actual.textos, [clave]: valor } }))
    setErrores(({ [clave]: _resuelto, ...resto }) => resto)
  }

  function cambiarFoto(fotoId: number, cambio: (descartadas: string[], nota: string) => Partial<{ descartadas: string[]; nota: string }>) {
    setEdicion((actual) => ({
      ...actual,
      fotos: actual.fotos.map((f) => (f.fotoId === fotoId ? { ...f, ...cambio(f.descartadas, f.nota) } : f)),
    }))
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!hayCambios) return
    setErrorEnvio(null)
    setGuardando(true)
    try {
      const actualizado = await inspecciones.guardarReporte(inspeccionId, cambios)
      setGuardado(actualizado)
      setEdicion(edicionDesde(actualizado))
      setErrores({})
    } catch (error) {
      if (error instanceof ApiError && error.campos) {
        const delFormulario: Partial<Record<keyof TextosReporte, string>> = {}
        const otros: string[] = []
        for (const [campo, mensajes] of Object.entries(error.campos)) {
          const clave = CLAVE_POR_CAMPO_API[campo]
          if (clave) delFormulario[clave] = mensajes.join(' ')
          else otros.push(...mensajes)
        }
        setErrores(delFormulario)
        setErrorEnvio(otros.length > 0 ? [error.message, ...otros].join(' · ') : null)
      } else {
        setErrorEnvio(mensajeDe(error))
      }
    } finally {
      setGuardando(false)
    }
  }

  const area = (clave: 'conclusion' | 'observaciones' | 'recomendaciones', etiqueta: string, ayuda?: string) => (
    <Campo etiqueta={etiqueta} error={errores[clave]} ayuda={ayuda}>
      <textarea
        value={edicion.textos[clave]}
        onChange={(e) => cambiarTexto(clave, e.target.value)}
        rows={4}
        maxLength={5000}
        className={`${CLASES_CONTROL} resize-y`}
      />
    </Campo>
  )

  return (
    <Marco inspeccionId={inspeccionId}>
      <form onSubmit={guardar} noValidate className="animar-entrada flex flex-col gap-6">
        <Tarjeta titulo="Inspector">
          <div className="grid gap-5 sm:grid-cols-2">
            {(
              [
                ['inspectorNombre', 'Nombre del inspector'],
                ['inspectorCargo', 'Cargo'],
              ] as const
            ).map(([clave, etiqueta]) => (
              <Campo key={clave} etiqueta={etiqueta} error={errores[clave]}>
                <input
                  value={edicion.textos[clave]}
                  onChange={(e) => cambiarTexto(clave, e.target.value)}
                  maxLength={255}
                  className={CLASES_CONTROL}
                />
              </Campo>
            ))}
          </div>
        </Tarjeta>

        <Tarjeta titulo="Conclusiones">
          <div className="flex flex-col gap-5">
            {area('conclusion', 'Conclusión', 'Aparece en el resumen ejecutivo, al inicio del PDF.')}
            {area('observaciones', 'Observaciones')}
            {area('recomendaciones', 'Recomendaciones')}
          </div>
        </Tarjeta>

        <section className="flex flex-col gap-3">
          <h2 className="label-caps text-ink-muted">Validación de hallazgos</h2>
          {guardado.fotos.length === 0 ? (
            <Vacio>No hay fotos con anomalías para revisar.</Vacio>
          ) : (
            guardado.fotos.map((foto) => {
              const validacion = edicion.fotos.find((f) => f.fotoId === foto.fotoId)!
              return (
                <FotoRevision
                  key={foto.fotoId}
                  foto={foto}
                  validacion={validacion}
                  alAlternar={(clase) =>
                    cambiarFoto(foto.fotoId, (descartadas) => ({
                      descartadas: descartadas.includes(clase)
                        ? descartadas.filter((c) => c !== clase)
                        : [...descartadas, clase],
                    }))
                  }
                  alCambiarNota={(nota) => cambiarFoto(foto.fotoId, () => ({ nota }))}
                />
              )
            })
          )}
        </section>

        {errorEnvio && <MensajeError mensaje={errorEnvio} />}

        <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row-reverse sm:items-center">
          <Boton type="submit" disabled={!hayCambios || guardando} className="sm:min-w-40">
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
          {hayCambios ? (
            <>
              <Boton variante="secundario" disabled>
                <Icon name="upload" className="size-4 rotate-180" />
                Descargar PDF
              </Boton>
              <p className="text-sm text-ink-dim sm:mr-auto">Guarda los cambios para incluirlos en el PDF.</p>
            </>
          ) : (
            <AnclaBoton variante="secundario" href={inspecciones.urlReporte(inspeccionId)} download>
              <Icon name="upload" className="size-4 rotate-180" />
              Descargar PDF
            </AnclaBoton>
          )}
        </div>
      </form>
    </Marco>
  )
}
