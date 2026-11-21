import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useDependencias } from '../../app/useDependencias'
import { ApiError, type ErroresDeCampo } from '../../shared/http/apiClient'
import { Boton } from '../../shared/ui/Boton'
import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import { Enlace } from '../../shared/ui/Enlace'
import { MensajeError } from '../../shared/ui/Estados'
import { InputContrasena } from '../../shared/ui/InputContrasena'
import { mensajeDe } from '../../shared/ui/formato'
import type { DatosRegistro } from '../domain/usuario'
import { MarcoCuenta } from './MarcoCuenta'
import { mensajesDe } from './mensajes'
import { useSesion } from './sesion'

const VACIO: Required<DatosRegistro> = { nombre: '', email: '', cargo: '', password: '' }

export function RegistroPage() {
  const { cuentas } = useDependencias()
  const { usuario, iniciar } = useSesion()
  const [datos, setDatos] = useState(VACIO)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campos, setCampos] = useState<ErroresDeCampo | undefined>()

  // Entering the app always opens the main view (the inspections), whatever page was open before.
  if (usuario) return <Navigate to="/" replace />

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setError(null)
    setCampos(undefined)
    setEnviando(true)
    try {
      iniciar(await cuentas.registrarse(datos))
    } catch (e) {
      setError(mensajeDe(e))
      setCampos(e instanceof ApiError ? e.campos : undefined)
      setEnviando(false)
    }
  }

  const campo = (clave: Exclude<keyof DatosRegistro, 'password'>, etiqueta: string, tipo: string, autoComplete: string) => (
    <Campo etiqueta={etiqueta} error={mensajesDe(campos, clave)}>
      <input
        type={tipo}
        autoComplete={autoComplete}
        value={datos[clave]}
        onChange={(e) => setDatos((actual) => ({ ...actual, [clave]: e.target.value }))}
        maxLength={255}
        className={CLASES_CONTROL}
      />
    </Campo>
  )

  return (
    <MarcoCuenta titulo="Crear cuenta">
      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
        {error && <MensajeError mensaje={error} />}
        {campo('nombre', 'Nombre', 'text', 'name')}
        {campo('email', 'Email', 'email', 'email')}
        {campo('cargo', 'Cargo (opcional)', 'text', 'organization-title')}
        <Campo etiqueta="Contraseña" error={mensajesDe(campos, 'password')}>
          <InputContrasena
            autoComplete="new-password"
            value={datos.password}
            onChange={(e) => setDatos((actual) => ({ ...actual, password: e.target.value }))}
          />
        </Campo>
        <Boton type="submit" disabled={enviando}>
          {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
        </Boton>
        <p className="text-center text-sm text-ink-muted">
          <Enlace to="/login" className="font-semibold text-accent-ink hover:underline">
            Ya tengo cuenta
          </Enlace>
        </p>
      </form>
    </MarcoCuenta>
  )
}
