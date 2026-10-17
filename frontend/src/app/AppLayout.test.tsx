import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AppLayout } from './AppLayout'

function renderLayout() {
  const router = createMemoryRouter([
    { element: <AppLayout />, children: [{ path: '/', element: <p>Contenido</p> }] },
  ])
  return render(<RouterProvider router={router} />)
}

describe('AppLayout', () => {
  it('renders the brand, the main navigation and the routed page', () => {
    renderLayout()

    expect(screen.getByText('Nautic')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Principal' })
    expect(nav).toHaveTextContent('Inspecciones')
    expect(screen.getByText('Contenido')).toBeInTheDocument()
  })

  it('offers the theme toggle', () => {
    renderLayout()

    expect(screen.getByRole('button', { name: 'Activar modo oscuro' })).toBeInTheDocument()
  })
})
