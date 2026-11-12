import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { rutas } from '../../app/router'
import { ApiError } from '../../shared/http/apiClient'
import { crearDependenciasFalsas, renderizarRutas, unUsuario } from '../../test/dobles'

function sinSesion() {
  const falsas = crearDependenciasFalsas()
  falsas.dependencias.cuentas.obtenerActual.mockResolvedValue(null)
  return falsas
}

/** The app bar (pages may render their own <header> too). */
async function cabeceraApp() {
  return (await screen.findAllByRole('banner'))[0]
}

describe('session', () => {
  it('shows a loading state while the session is unknown', () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.cuentas.obtenerActual.mockReturnValue(new Promise(() => {}))

    renderizarRutas(rutas, dependencias, '/buques')

    expect(screen.getByRole('status')).toHaveTextContent('Cargando sesión…')
  })

  it('redirects to the login without a session and returns to the intended page after logging in', async () => {
    const { dependencias } = sinSesion()
    const router = renderizarRutas(rutas, dependencias, '/buques?q=brown')

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')

    await userEvent.type(screen.getByLabelText('Email'), 'maria@nautic.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta123')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/buques'))
    expect(router.state.location.search).toBe('?q=brown')
    expect(dependencias.cuentas.iniciarSesion).toHaveBeenCalledWith('maria@nautic.test', 'secreta123')
  })

  it('shows the user name in the app bar and logs out', async () => {
    const { dependencias } = crearDependenciasFalsas()
    const router = renderizarRutas(rutas, dependencias, '/buques')

    const cabecera = await cabeceraApp()
    expect(within(cabecera).getByText('María Pérez')).toBeInTheDocument()
    await userEvent.click(within(cabecera).getByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(dependencias.cuentas.cerrarSesion).toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('goes to the login when a request answers 401', async () => {
    const { dependencias, expirarSesion } = crearDependenciasFalsas()
    const router = renderizarRutas(rutas, dependencias, '/buques')
    expect(await cabeceraApp()).toBeInTheDocument()

    act(() => expirarSesion())

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('sends a logged-in user away from the login', async () => {
    const { dependencias } = crearDependenciasFalsas()
    const router = renderizarRutas(rutas, dependencias, '/login')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

describe('LoginPage', () => {
  it('shows the general error in an alert', async () => {
    const { dependencias } = sinSesion()
    dependencias.cuentas.iniciarSesion.mockRejectedValue(new ApiError(400, 'Email o contraseña incorrectos.'))
    renderizarRutas(rutas, dependencias, '/login')

    await userEvent.type(await screen.findByLabelText('Email'), 'maria@nautic.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.')
  })

  it('shows field errors under each field', async () => {
    const { dependencias } = sinSesion()
    dependencias.cuentas.iniciarSesion.mockRejectedValue(
      new ApiError(400, 'Datos inválidos.', { email: ['Introduzca un email válido.'], password: ['Este campo es requerido.'] }),
    )
    renderizarRutas(rutas, dependencias, '/login')

    await userEvent.type(await screen.findByLabelText('Email'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByLabelText('Email')).toHaveAccessibleDescription('Introduzca un email válido.')
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription('Este campo es requerido.')
  })

  it('disables the submit button while sending', async () => {
    const { dependencias } = sinSesion()
    dependencias.cuentas.iniciarSesion.mockReturnValue(new Promise(() => {}))
    renderizarRutas(rutas, dependencias, '/login')

    await userEvent.type(await screen.findByLabelText('Email'), 'maria@nautic.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta123')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(screen.getByRole('button', { name: 'Ingresando…' })).toBeDisabled()
  })

  it('links to the registration screen', async () => {
    const { dependencias } = sinSesion()
    const router = renderizarRutas(rutas, dependencias, '/login')

    await userEvent.click(await screen.findByRole('link', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('heading', { name: 'Crear cuenta' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/registro')
  })
})

describe('RegistroPage', () => {
  it('creates the account and enters the app with the new session', async () => {
    const { dependencias } = sinSesion()
    dependencias.cuentas.registrarse.mockResolvedValue(unUsuario({ nombre: 'Ana Ruiz' }))
    const router = renderizarRutas(rutas, dependencias, '/registro')

    await userEvent.type(await screen.findByLabelText('Nombre'), 'Ana Ruiz')
    await userEvent.type(screen.getByLabelText('Email'), 'ana@nautic.test')
    await userEvent.type(screen.getByLabelText('Cargo (opcional)'), 'Inspectora')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta123')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(dependencias.cuentas.registrarse).toHaveBeenCalledWith({
      nombre: 'Ana Ruiz',
      email: 'ana@nautic.test',
      cargo: 'Inspectora',
      password: 'secreta123',
    })
    expect(within(await cabeceraApp()).getByText('Ana Ruiz')).toBeInTheDocument()
  })

  it('shows every password message under the field and the general error in an alert', async () => {
    const { dependencias } = sinSesion()
    dependencias.cuentas.registrarse.mockRejectedValue(
      new ApiError(400, 'Datos inválidos.', {
        email: ['Ya existe una cuenta con ese email.'],
        password: ['La contraseña es demasiado corta.', 'La contraseña es demasiado común.'],
      }),
    )
    renderizarRutas(rutas, dependencias, '/registro')

    await userEvent.type(await screen.findByLabelText('Nombre'), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByLabelText('Email')).toHaveAccessibleDescription('Ya existe una cuenta con ese email.')
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription(
      'La contraseña es demasiado corta. La contraseña es demasiado común.',
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Datos inválidos.')
  })

  it('links back to the login', async () => {
    const { dependencias } = sinSesion()
    const router = renderizarRutas(rutas, dependencias, '/registro')

    await userEvent.click(await screen.findByRole('link', { name: 'Ya tengo cuenta' }))

    expect(router.state.location.pathname).toBe('/login')
  })
})
