import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNavegar } from '../hooks/useNavegar'
import { Enlace, EnlaceNav } from './Enlace'

// jsdom has no View Transitions API: a stand-in that runs the DOM update right away.
const iniciarTransicion = vi.fn((actualizar: () => unknown) => {
  void actualizar()
  const hecho = Promise.resolve()
  return { finished: hecho, ready: hecho, updateCallbackDone: hecho, skipTransition: () => {} }
})

function BotonNavegar() {
  const navegar = useNavegar()
  return (
    <button type="button" onClick={() => navegar('/destino')}>
      Navegar
    </button>
  )
}

function renderizar() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <>
            <Enlace to="/destino">Enlace</Enlace>
            <EnlaceNav to="/destino">Pestaña</EnlaceNav>
            <BotonNavegar />
          </>
        ),
      },
      { path: '/destino', element: <p>Destino</p> },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('app navigation with view transitions', () => {
  beforeEach(() => {
    iniciarTransicion.mockClear()
    Object.assign(document, { startViewTransition: iniciarTransicion })
  })

  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition')
  })

  it.each([
    ['a link', () => screen.getByRole('link', { name: 'Enlace' })],
    ['a navigation tab', () => screen.getByRole('link', { name: 'Pestaña' })],
    ['a programmatic navigation', () => screen.getByRole('button', { name: 'Navegar' })],
  ])('animates the route change from %s', async (_caso, elemento) => {
    const router = renderizar()

    await userEvent.click(elemento())

    expect(await screen.findByText('Destino')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/destino')
    expect(iniciarTransicion).toHaveBeenCalled()
  })

  it('lets a single link opt out of the transition', async () => {
    const router = createMemoryRouter(
      [
        { path: '/', element: <Enlace to="/destino" viewTransition={false}>Sin animación</Enlace> },
        { path: '/destino', element: <p>Destino</p> },
      ],
      { initialEntries: ['/'] },
    )
    render(<RouterProvider router={router} />)

    await userEvent.click(screen.getByRole('link', { name: 'Sin animación' }))

    expect(await screen.findByText('Destino')).toBeInTheDocument()
    expect(iniciarTransicion).not.toHaveBeenCalled()
  })
})
