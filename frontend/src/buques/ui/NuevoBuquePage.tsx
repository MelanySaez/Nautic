import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useDependencias } from '../../app/useDependencias'
import { ApiError } from '../../shared/http/apiClient'
import { Boton, EnlaceBoton } from '../../shared/ui/Boton'
import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import { MensajeError } from '../../shared/ui/Estados'
import { Icon } from '../../shared/ui/Icon'
import { Tarjeta } from '../../shared/ui/Tarjeta'
import { mensajeDe } from '../../shared/ui/formato'
import type { NuevoBuque } from '../domain/buque'
import { GRUPOS_TECNICOS } from '../domain/fichaTecnica'
import { GrupoNumerico } from './GrupoNumerico'

const ETAPAS_SUGERIDAS = ['Activo', 'En construcción']
const REQUERIDO = 'Este campo es requerido.'

const CAMPOS_TECNICOS = GRUPOS_TECNICOS.flatMap((g) => g.campos)
/** Wire (snake_case) name of every form field -> form key. */
const CLAVE_POR_CAMPO_API: Record<string, string> = {
  nombre: 'nombre',
  tipo: 'tipo',
  etapa: 'etapa',
  descripcion: 'descripcion',
  imagen: 'imagen',
  ...Object.fromEntries(CAMPOS_TECNICOS.map((c) => [c.claveApi, c.clave])),
}

const VALORES_INICIALES: Record<string, string> = Object.fromEntries([
  ...['nombre', 'tipo', 'etapa', 'descripcion', 'imagen'].map((k) => [k, '']),
  ...CAMPOS_TECNICOS.map((c) => [c.clave, '']),
])

type Valores = Record<string, string>
type Errores = Record<string, string>

/** Client-side checks that save a round trip; the backend remains the authority. */
function validar(valores: Valores): Errores {
  const errores: Errores = {}
  if (!valores.nombre.trim()) errores.nombre = REQUERIDO
  if (!valores.tipo.trim()) errores.tipo = REQUERIDO
  for (const campo of CAMPOS_TECNICOS) {
    const texto = valores[campo.clave].trim()
    if (!texto) continue
    const numero = Number(texto)
    if (!Number.isFinite(numero)) errores[campo.clave] = 'Debe ser un número.'
    else if (numero < 0) errores[campo.clave] = 'No puede ser negativo.'
    else if (campo.entero && !Number.isInteger(numero)) errores[campo.clave] = 'Debe ser un número entero.'
  }
  return errores
}

/** Builds the creation input: trimmed text, and only the optional fields the user filled. */
function aNuevoBuque(valores: Valores): NuevoBuque {
  const datos: NuevoBuque = { nombre: valores.nombre.trim(), tipo: valores.tipo.trim() }
  if (valores.etapa.trim()) datos.etapa = valores.etapa.trim()
  if (valores.descripcion.trim()) datos.descripcion = valores.descripcion.trim()
  if (valores.imagen.trim()) datos.imagen = valores.imagen.trim()
  for (const campo of CAMPOS_TECNICOS) {
    if (valores[campo.clave].trim()) datos[campo.clave] = Number(valores[campo.clave])
  }
  return datos
}

/** Splits server field errors into those that belong to a form field and the rest. */
function repartirErroresDelServidor(campos: Record<string, string[]>) {
  const delFormulario: Errores = {}
  const sinCampo: string[] = []
  for (const [claveApi, mensajes] of Object.entries(campos)) {
    const clave = CLAVE_POR_CAMPO_API[claveApi]
    if (clave) delFormulario[clave] = mensajes.join(' ')
    else sinCampo.push(`${claveApi}: ${mensajes.join(' ')}`)
  }
  return { delFormulario, sinCampo }
}

export function NuevoBuquePage() {
  const { buques } = useDependencias()
  const navegar = useNavigate()

  const [valores, setValores] = useState<Valores>(VALORES_INICIALES)
  const [errores, setErrores] = useState<Errores>({})
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  function cambiar(clave: string, valor: string) {
    setValores((actual) => ({ ...actual, [clave]: valor }))
    setErrores(({ [clave]: _resuelto, ...resto }) => resto)
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const invalidos = validar(valores)
    setErrores(invalidos)
    if (Object.keys(invalidos).length > 0) return
    setErrorEnvio(null)
    setEnviando(true)
    try {
      const creado = await buques.crear(aNuevoBuque(valores))
      navegar(`/buques/${creado.id}`)
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
        <Link to="/buques" aria-label="Volver al listado" className="rounded p-1 text-ink-muted hover:text-ink">
          <Icon name="back" className="size-6" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold tracking-tight md:text-3xl">Nuevo buque</h1>
      </header>

      <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
        <Tarjeta titulo="Datos generales">
          <div className="flex flex-col gap-5">
            <Campo etiqueta="Nombre" error={errores.nombre}>
              <input
                value={valores.nombre}
                onChange={(e) => cambiar('nombre', e.target.value)}
                maxLength={255}
                className={CLASES_CONTROL}
              />
            </Campo>
            <Campo etiqueta="Tipo" error={errores.tipo}>
              <input
                value={valores.tipo}
                onChange={(e) => cambiar('tipo', e.target.value)}
                maxLength={255}
                placeholder="Fragata, patrullera…"
                className={CLASES_CONTROL}
              />
            </Campo>
            <Campo etiqueta="Etapa" error={errores.etapa} ayuda="Si lo dejas vacío se registra como Activo.">
              <input
                value={valores.etapa}
                onChange={(e) => cambiar('etapa', e.target.value)}
                maxLength={255}
                list="etapas-buque"
                className={CLASES_CONTROL}
              />
            </Campo>
            <datalist id="etapas-buque">
              {ETAPAS_SUGERIDAS.map((etapa) => (
                <option key={etapa} value={etapa} />
              ))}
            </datalist>
            <Campo etiqueta="Descripción" error={errores.descripcion}>
              <textarea
                value={valores.descripcion}
                onChange={(e) => cambiar('descripcion', e.target.value)}
                rows={3}
                className={`${CLASES_CONTROL} resize-y`}
              />
            </Campo>
            <Campo etiqueta="Imagen" error={errores.imagen} ayuda="Nombre o ruta del archivo; todavía no se muestra.">
              <input
                value={valores.imagen}
                onChange={(e) => cambiar('imagen', e.target.value)}
                maxLength={255}
                className={CLASES_CONTROL}
              />
            </Campo>
          </div>
        </Tarjeta>

        <div className="flex flex-col gap-3">
          {GRUPOS_TECNICOS.map((grupo) => (
            <GrupoNumerico key={grupo.titulo} grupo={grupo} valores={valores} errores={errores} alCambiar={cambiar} />
          ))}
        </div>

        {errorEnvio && <MensajeError mensaje={errorEnvio} />}

        <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row-reverse">
          <Boton type="submit" disabled={enviando} className="sm:min-w-56">
            <Icon name="plus" className="size-4" />
            {enviando ? 'Creando…' : 'Crear buque'}
          </Boton>
          <EnlaceBoton to="/buques" variante="secundario">
            Cancelar
          </EnlaceBoton>
        </div>
      </form>
    </div>
  )
}
