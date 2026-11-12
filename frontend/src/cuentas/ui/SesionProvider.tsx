import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useDependencias } from '../../app/useDependencias'
import { Cargando, MensajeError } from '../../shared/ui/Estados'
import { mensajeDe } from '../../shared/ui/formato'
import type { Usuario } from '../domain/usuario'
import { SesionContext, useUsuarioActual, type Sesion } from './sesion'

type EstadoSesion = { tipo: 'cargando' } | { tipo: 'error'; mensaje: string } | { tipo: 'lista'; usuario: Usuario | null }

/** Location state of the login: where to return once authenticated. */
export interface DestinoLogin {
  desde?: string
}

/** Loads the current user once and drops it whenever any request answers 401. */
export function SesionProvider({ children }: { children: ReactNode }) {
  const { cuentas } = useDependencias()
  const [estado, setEstado] = useState<EstadoSesion>({ tipo: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => cuentas.alExpirarSesion(() => setEstado({ tipo: 'lista', usuario: null })), [cuentas])

  useEffect(() => {
    let vigente = true
    cuentas.obtenerActual().then(
      (usuario) => vigente && setEstado({ tipo: 'lista', usuario }),
      (error: unknown) => vigente && setEstado({ tipo: 'error', mensaje: mensajeDe(error) }),
    )
    return () => {
      vigente = false
    }
  }, [cuentas, intento])

  const iniciar = useCallback((usuario: Usuario) => setEstado({ tipo: 'lista', usuario }), [])
  const cerrarSesion = useCallback(async () => {
    try {
      await cuentas.cerrarSesion()
    } finally {
      // Even if the server call failed, the UI must not keep acting as the previous user.
      setEstado({ tipo: 'lista', usuario: null })
    }
  }, [cuentas])

  const usuario = estado.tipo === 'lista' ? estado.usuario : null
  const valor = useMemo<Sesion>(() => ({ usuario, iniciar, cerrarSesion }), [usuario, iniciar, cerrarSesion])

  if (estado.tipo === 'cargando') return <Cargando texto="Cargando sesión…" />
  if (estado.tipo === 'error') {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <MensajeError
          mensaje={estado.mensaje}
          alReintentar={() => {
            setEstado({ tipo: 'cargando' })
            setIntento((n) => n + 1)
          }}
        />
      </div>
    )
  }
  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>
}

/** Root route element: every route below knows the session. */
export function RaizSesion() {
  return (
    <SesionProvider>
      <Outlet />
    </SesionProvider>
  )
}

/** Guards the app routes: without a session, go to the login and come back afterwards. */
export function RequiereSesion() {
  const usuario = useUsuarioActual()
  const { pathname, search, hash } = useLocation()
  if (!usuario) {
    const destino: DestinoLogin = { desde: `${pathname}${search}${hash}` }
    return <Navigate to="/login" replace state={destino} />
  }
  return <Outlet />
}
