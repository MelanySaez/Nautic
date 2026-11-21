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
import { MarcoCuenta } from './MarcoCuenta'
import { mensajesDe } from './mensajes'
import { useSesion } from './sesion'

export function LoginPage() {
  const { cuentas } = useDependencias()
  const { usuario, iniciar } = useSesion()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      iniciar(await cuentas.iniciarSesion(email, password))
    } catch (e) {
      setError(mensajeDe(e))
      setCampos(e instanceof ApiError ? e.campos : undefined)
      setEnviando(false)
    }
  }

  return (
    <MarcoCuenta titulo="Iniciar sesión">
      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
        {error && <MensajeError mensaje={error} />}
        <Campo etiqueta="Email" error={mensajesDe(campos, 'email')}>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={CLASES_CONTROL}
          />
        </Campo>
        <Campo etiqueta="Contraseña" error={mensajesDe(campos, 'password')}>
          <InputContrasena
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Campo>
        <Boton type="submit" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Iniciar sesión'}
        </Boton>
        <p className="text-center text-sm text-ink-muted">
          ¿No tienes cuenta?{' '}
          <Enlace to="/registro" className="font-semibold text-accent-ink hover:underline">
            Crear cuenta
          </Enlace>
        </p>
      </form>
    </MarcoCuenta>
  )
}
