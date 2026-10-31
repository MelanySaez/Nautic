import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AppLayout } from './AppLayout'

function renderLayout(ruta = '/') {
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <p>Contenido</p> },
          { path: '/buques', element: <p>Flota</p> },
        ],
      },
    ],
    { initialEntries: [ruta] },
  )
  return render(<RouterProvider router={router} />)
}

describe('AppLayout', () => {
  it('renders the brand, the main navigation and the routed page', () => {
    renderLayout()

    expect(screen.getByText('Nautic')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Principal' })
    expect(nav).toHaveTextContent('Inspecciones')
    expect(nav).toHaveTextContent('Buques')
    expect(screen.getByText('Contenido')).toBeInTheDocument()
  })

  it('marks only the Buques link as current on the vessels section', () => {
    renderLayout('/buques')

    expect(screen.getByRole('link', { name: 'Buques' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Inspecciones' })).not.toHaveAttribute('aria-current')
  })

  it('offers the theme toggle', () => {
    renderLayout()

    expect(screen.getByRole('button', { name: 'Activar modo oscuro' })).toBeInTheDocument()
  })
})
