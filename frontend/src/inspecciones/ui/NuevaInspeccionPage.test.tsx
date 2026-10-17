import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { crearDependenciasFalsas, renderizarRutas, unaInspeccion } from '../../test/dobles'
import { NuevaInspeccionPage } from './NuevaInspeccionPage'

function renderizar(dependencias = crearDependenciasFalsas().dependencias) {
  const router = renderizarRutas(
    [
      { path: '/', element: <p>Listado</p> },
      { path: '/inspecciones/nueva', element: <NuevaInspeccionPage /> },
      { path: '/inspecciones/:id/carga', element: <p>Carga de fotos</p> },
    ],
    dependencias,
    '/inspecciones/nueva',
  )
  return { router, dependencias }
}

describe('NuevaInspeccionPage', () => {
  it('offers the fleet vessels to choose from', async () => {
    renderizar()

    const selector = screen.getByLabelText('Buque')
    expect(await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })).toBeInTheDocument()
    expect(selector).toHaveValue('')
  })

  it('creates the inspection with trimmed values and opens its photo upload', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.crear.mockResolvedValue(unaInspeccion({ id: 42 }))
    const { router } = renderizar(dependencias)
    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })

    await userEvent.selectOptions(screen.getByLabelText('Buque'), '2')
    await userEvent.type(screen.getByLabelText('Inspector'), '  Juan Gómez ')
    await userEvent.type(screen.getByLabelText('Descripción'), ' Control de proa ')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspección' }))

    expect(dependencias.inspecciones.crear).toHaveBeenCalledWith({
      buqueId: 2,
      tomadoPor: 'Juan Gómez',
      descripcion: 'Control de proa',
    })
    expect(router.state.location.pathname).toBe('/inspecciones/42/carga')
  })

  it('requires a vessel before submitting', async () => {
    const { dependencias } = renderizar()
    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspección' }))

    expect(screen.getByText('Selecciona un buque.')).toBeInTheDocument()
    expect(screen.getByLabelText('Buque')).toHaveAttribute('aria-invalid', 'true')
    expect(dependencias.inspecciones.crear).not.toHaveBeenCalled()
  })

  it('shows the backend error and lets the user try again', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.crear.mockRejectedValue(new Error('No encontrado.'))
    renderizar(dependencias)
    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })

    await userEvent.selectOptions(screen.getByLabelText('Buque'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspección' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontrado.')
    expect(screen.getByRole('button', { name: 'Iniciar inspección' })).toBeEnabled()
  })

  it('reports when the fleet cannot be loaded', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.listar.mockRejectedValue(new Error('Flota no disponible.'))

    renderizar(dependencias)

    expect(await screen.findByRole('alert')).toHaveTextContent('Flota no disponible.')
  })

  it('goes back to the list on cancel', async () => {
    const { router } = renderizar()

    await userEvent.click(screen.getByRole('link', { name: 'Cancelar' }))

    expect(router.state.location.pathname).toBe('/')
  })
})
