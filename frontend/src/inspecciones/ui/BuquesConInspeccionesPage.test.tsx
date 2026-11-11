import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { crearDependenciasFalsas, renderizarRutas, unBuque } from '../../test/dobles'
import { BuquesConInspeccionesPage } from './BuquesConInspeccionesPage'

function renderizar(dependencias = crearDependenciasFalsas().dependencias, ruta = '/') {
  const router = renderizarRutas(
    [
      { path: '/', element: <BuquesConInspeccionesPage /> },
      { path: '/vision', element: <p>Formulario nuevo</p> },
      { path: '/inspecciones/buque/:id', element: <p>Inspecciones del buque</p> },
    ],
    dependencias,
    ruta,
  )
  return { router, dependencias }
}

describe('BuquesConInspeccionesPage', () => {
  it('lists only the vessels with inspections, with their count, and no inspection cards', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.listarConInspecciones.mockResolvedValue([
      { ...unBuque({ id: 1, nombre: 'ARA Almirante Brown' }), totalInspecciones: 1 },
      { ...unBuque({ id: 2, nombre: 'ARA Libertad' }), totalInspecciones: 3 },
    ])

    renderizar(dependencias)

    const lista = await screen.findByRole('list', { name: 'Embarcaciones con inspecciones' })
    expect(lista).toHaveTextContent('ARA Almirante Brown')
    expect(lista).toHaveTextContent('1 inspección')
    expect(lista).toHaveTextContent('ARA Libertad')
    expect(lista).toHaveTextContent('3 inspecciones')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(dependencias.inspecciones.buscar).not.toHaveBeenCalled()
  })

  it('filters the vessels by name, ignoring case and accents, and keeps the text in the URL', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.listarConInspecciones.mockResolvedValue([
      { ...unBuque({ id: 1, nombre: 'ARA Almirante Brown' }), totalInspecciones: 1 },
      { ...unBuque({ id: 2, nombre: 'ARA Libertad' }), totalInspecciones: 3 },
      { ...unBuque({ id: 3, nombre: 'Velero Río Bravo' }), totalInspecciones: 2 },
    ])
    const { router } = renderizar(dependencias)
    const caja = await screen.findByRole('searchbox', { name: 'Buscar embarcación' })

    await userEvent.type(caja, 'rio')

    const lista = screen.getByRole('list', { name: 'Embarcaciones con inspecciones' })
    expect(within(lista).getAllByRole('link').map((a) => a.textContent)).toEqual([
      expect.stringContaining('Velero Río Bravo'),
    ])
    expect(router.state.location.search).toBe('?q=rio')

    await userEvent.clear(caja)
    await userEvent.type(caja, 'zzz')
    expect(screen.getByText('Ninguna embarcación coincide con «zzz».')).toBeInTheDocument()
  })

  it('restores the vessel search from the URL', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.listarConInspecciones.mockResolvedValue([
      { ...unBuque({ id: 1, nombre: 'ARA Almirante Brown' }), totalInspecciones: 1 },
      { ...unBuque({ id: 2, nombre: 'ARA Libertad' }), totalInspecciones: 3 },
    ])
    renderizar(dependencias, '/?q=libert')

    expect(await screen.findByRole('searchbox', { name: 'Buscar embarcación' })).toHaveValue('libert')
    expect(screen.getAllByRole('link', { name: /^ARA / }).map((a) => a.textContent)).toEqual([
      expect.stringContaining('ARA Libertad'),
    ])
  })

  it('opens the inspections of the chosen vessel', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.listarConInspecciones.mockResolvedValue([
      { ...unBuque({ id: 2, nombre: 'ARA Libertad' }), totalInspecciones: 3 },
    ])
    const { router } = renderizar(dependencias)

    await userEvent.click(await screen.findByRole('link', { name: /ARA Libertad/ }))

    expect(router.state.location.pathname).toBe('/inspecciones/buque/2')
  })

  it('shows an empty state with a call to action when there are no inspections', async () => {
    const { router } = renderizar()

    expect(await screen.findByText('Todavía no hay inspecciones.')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('link', { name: /Nueva inspección/ })[0])

    expect(router.state.location.pathname).toBe('/vision')
  })

  it('shows the loading error and retries on demand', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.listarConInspecciones
      .mockRejectedValueOnce(new Error('No se pudo conectar con el servidor.'))
      .mockResolvedValueOnce([{ ...unBuque({ id: 2, nombre: 'ARA Libertad' }), totalInspecciones: 1 }])
    renderizar(dependencias)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor.')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('link', { name: /ARA Libertad/ })).toBeInTheDocument()
  })
})
