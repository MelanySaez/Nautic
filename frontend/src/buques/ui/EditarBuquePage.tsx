import { useCallback, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { useDependencias } from '../../app/useDependencias'
import { useNavegar } from '../../shared/hooks/useNavegar'
import { useRecurso } from '../../shared/hooks/useRecurso'
import { ApiError } from '../../shared/http/apiClient'
import { Boton, EnlaceBoton } from '../../shared/ui/Boton'
import { Enlace } from '../../shared/ui/Enlace'
import { Cargando, MensajeError } from '../../shared/ui/Estados'
import { Icon } from '../../shared/ui/Icon'
import { mensajeDe } from '../../shared/ui/formato'
import type { BuqueDetalle, CambiosBuque } from '../domain/buque'
import { CamposBuque } from './CamposBuque'
import {
  CAMPOS_TECNICOS,
  repartirErroresDelServidor,
  validar,
  valoresDesde,
  type Errores,
  type Valores,
} from './formularioBuque'

/** Route entry: keys the page by id so switching vessels starts from a clean state. */
export function EditarBuqueRuta() {
  const { id } = useParams()
  const buqueId = id !== undefined && /^\d+$/.test(id) ? Number(id) : null

  if (buqueId === null) {
    return (
      <Marco volverA="/buques">
        <MensajeError mensaje="El identificador del buque no es válido." />
      </Marco>
    )
  }
  return <EditarBuquePage key={buqueId} buqueId={buqueId} />
}

export function EditarBuquePage({ buqueId }: { buqueId: number }) {
  const { buques } = useDependencias()
  const cargar = useCallback(() => buques.obtener(buqueId), [buques, buqueId])
  const { estado, reintentar } = useRecurso(cargar)

  if (estado.tipo === 'cargando') return <Cargando texto="Cargando ficha técnica…" />
  if (estado.tipo === 'error') {
    return (
      <Marco volverA={`/buques/${buqueId}`}>
        <MensajeError mensaje={estado.mensaje} alReintentar={reintentar} />
      </Marco>
    )
  }
  return <FormularioEdicion buque={estado.datos} />
}

function Marco({ volverA, children }: { volverA: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <Enlace to={volverA} className="label-caps inline-flex items-center gap-2 self-start text-ink-muted hover:text-ink">
        <Icon name="back" className="size-4" />
        Volver
      </Enlace>
      {children}
    </div>
  )
}

/**
 * Only the fields whose input text changed: trimmed text, blank image and measures become
 * `null` (cleared), and a blank description is sent as an empty string.
 */
function aCambios(iniciales: Valores, valores: Valores): CambiosBuque {
  const cambios: CambiosBuque = {}
  const cambio = (clave: string) => valores[clave].trim() !== iniciales[clave].trim()
  if (cambio('nombre')) cambios.nombre = valores.nombre.trim()
  if (cambio('tipo')) cambios.tipo = valores.tipo.trim()
  if (cambio('etapa')) cambios.etapa = valores.etapa.trim()
  if (cambio('descripcion')) cambios.descripcion = valores.descripcion.trim()
  if (cambio('imagen')) cambios.imagen = valores.imagen.trim() || null
  for (const campo of CAMPOS_TECNICOS) {
    if (!cambio(campo.clave)) continue
    const texto = valores[campo.clave].trim()
    cambios[campo.clave] = texto ? Number(texto) : null
  }
  return cambios
}

function FormularioEdicion({ buque }: { buque: BuqueDetalle }) {
  const { buques } = useDependencias()
  const navegar = useNavegar()
  const rutaFicha = `/buques/${buque.id}`

  const [iniciales] = useState<Valores>(() => valoresDesde(buque))
  const [valores, setValores] = useState<Valores>(iniciales)
  const [errores, setErrores] = useState<Errores>({})
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  function cambiar(clave: string, valor: string) {
    setValores((actual) => ({ ...actual, [clave]: valor }))
    setErrores(({ [clave]: _resuelto, ...resto }) => resto)
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const invalidos = validar(valores, { etapaRequerida: true })
    setErrores(invalidos)
    if (Object.keys(invalidos).length > 0) return
    const cambios = aCambios(iniciales, valores)
    if (Object.keys(cambios).length === 0) {
      navegar(rutaFicha)
      return
    }
    setErrorEnvio(null)
    setEnviando(true)
    try {
      await buques.actualizar(buque.id, cambios)
      navegar(rutaFicha)
    } catch (error) {
      if (error instanceof ApiError && error.campos) {
        const { delFormulario, sinCampo } = repartirErroresDelServidor(error.campos)
        setErrores(delFormulario)
        setErrorEnvio(sinCampo.length > 0 ? [error.message, ...sinCampo].join(' · ') : null)
      } else {
        setErrorEnvio(mensajeDe(error))
      }
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex items-center gap-3">
        <Enlace to={rutaFicha} aria-label="Volver a la ficha" className="rounded p-1 text-ink-muted hover:text-ink">
          <Icon name="back" className="size-6" />
        </Enlace>
        <div className="min-w-0 flex-1">
          <p className="label-caps text-ink-dim">Editar buque · BUQ-{String(buque.id).padStart(4, '0')}</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{buque.nombre}</h1>
        </div>
      </header>

      <form onSubmit={enviar} noValidate className="animar-entrada flex flex-col gap-6">
        <CamposBuque valores={valores} errores={errores} alCambiar={cambiar} />

        <p className="text-sm text-ink-muted">Las secciones del casco no se pueden editar.</p>

        {errorEnvio && <MensajeError mensaje={errorEnvio} />}

        <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row-reverse">
          <Boton type="submit" disabled={enviando} className="sm:min-w-56">
            {enviando ? 'Guardando…' : 'Guardar cambios'}
          </Boton>
          <EnlaceBoton to={rutaFicha} variante="secundario">
            Cancelar
          </EnlaceBoton>
        </div>
      </form>
    </div>
  )
}
