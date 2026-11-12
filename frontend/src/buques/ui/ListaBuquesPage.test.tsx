import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { crearDependenciasFalsas, renderizarRutas, unBuque } from '../../test/dobles'
import { ListaBuquesPage } from './ListaBuquesPage'

function renderizar(dependencias = crearDependenciasFalsas().dependencias) {
  const router = renderizarRutas(
    [
      { path: '/buques', element: <ListaBuquesPage /> },
      { path: '/buques/nuevo', element: <p>Formulario nuevo</p> },
      { path: '/buques/:id', element: <p>Ficha</p> },
    ],
    dependencias,
    '/buques',
  )
  return { router, dependencias }
}

describe('ListaBuquesPage', () => {
  it('lists vessels with type and stage, linking to the technical sheet', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.listar.mockResolvedValue([
      unBuque({ id: 7, nombre: 'ARC Caribe', tipo: 'Fragata', etapa: 'En construcción' }),
    ])
    const { router } = renderizar(dependencias)

    const tarjeta = await screen.findByRole('article', { name: 'ARC Caribe' })
    expect(tarjeta).toHaveTextContent('Fragata')
    expect(tarjeta).toHaveTextContent('En construcción')
    await userEvent.click(screen.getByRole('link', { name: 'Abrir ficha de ARC Caribe' }))

    expect(router.state.location.pathname).toBe('/buques/7')
  })

  it('filters by name or type ignoring case and accents', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.listar.mockResolvedValue([
      unBuque({ id: 1, nombre: 'ARA Libertad', tipo: 'Fragata' }),
      unBuque({ id: 2, nombre: 'Lancha', tipo: 'Patrullera' }),
    ])
    renderizar(dependencias)
    await screen.findByRole('article', { name: 'Lancha' })
    const buscador = screen.getByRole('searchbox', { name: 'Buscar buque' })

    await userEvent.type(buscador, 'PATRULL')
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Lancha'])

    await userEvent.clear(buscador)
    await userEvent.type(buscador, 'zzz')
    expect(screen.getByText('Ningún buque coincide con "zzz".')).toBeInTheDocument()
  })

  it('shows an empty state with a call to action and opens the creation form', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.listar.mockResolvedValue([])
    const { router } = renderizar(dependencias)
    await screen.findByText('Todavía no hay buques registrados.')

    await userEvent.click(screen.getAllByRole('link', { name: /Nuevo buque/ })[0])

    expect(router.state.location.pathname).toBe('/buques/nuevo')
  })

  it('shows the loading error and retries on demand', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.listar
      .mockRejectedValueOnce(new Error('No se pudo conectar con el servidor.'))
      .mockResolvedValueOnce([unBuque()])
    renderizar(dependencias)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor.')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('article')).toBeInTheDocument()
  })
})
