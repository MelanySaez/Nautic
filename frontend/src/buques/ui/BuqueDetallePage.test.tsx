import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/http/apiClient'
import { crearDependenciasFalsas, renderizarRutas, unDetalleBuque } from '../../test/dobles'
import { BuqueDetalleRuta } from './BuqueDetallePage'

function renderizar(ruta: string, dependencias = crearDependenciasFalsas().dependencias) {
  const router = renderizarRutas(
    [
      { path: '/buques', element: <p>Listado</p> },
      { path: '/buques/:id', element: <BuqueDetalleRuta /> },
    ],
    dependencias,
    ruta,
  )
  return { router, dependencias }
}

describe('BuqueDetallePage', () => {
  it('renders the technical sheet by group, with units and a dash for unset values', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.obtener.mockResolvedValue(
      unDetalleBuque({
        id: 7,
        nombre: 'ARC Caribe',
        tipo: 'Fragata',
        etapa: 'En construcción',
        descripcion: 'Buque de prueba',
        esloraTotalM: 110.5,
        autonomiaHoras: 120,
      }),
    )

    renderizar('/buques/7', dependencias)

    expect(await screen.findByRole('heading', { name: 'ARC Caribe' })).toBeInTheDocument()
    expect(dependencias.buques.obtener).toHaveBeenCalledWith(7)
    const general = screen.getByRole('region', { name: 'General' })
    expect(general).toHaveTextContent('Fragata')
    expect(general).toHaveTextContent('En construcción')
    expect(general).toHaveTextContent('Buque de prueba')
    const dimensiones = screen.getByRole('region', { name: 'Dimensiones' })
    expect(within(dimensiones).getByText('Eslora total (m)').nextElementSibling).toHaveTextContent('110,5')
    expect(within(dimensiones).getByText('Puntal (m)').nextElementSibling).toHaveTextContent('—')
    const desempeno = screen.getByRole('region', { name: 'Desempeño' })
    expect(within(desempeno).getByText('Autonomía (h)').nextElementSibling).toHaveTextContent('120')
    expect(screen.getByRole('region', { name: 'Capacidades' })).toBeInTheDocument()
  })

  it('shows the backend message when the vessel does not exist and links back to the list', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.obtener.mockRejectedValue(new ApiError(404, 'No encontrado.'))
    const { router } = renderizar('/buques/99', dependencias)

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontrado.')
    await userEvent.click(screen.getByRole('link', { name: 'Volver a buques' }))

    expect(router.state.location.pathname).toBe('/buques')
  })

  it('explains a non-numeric id without calling the port', async () => {
    const { dependencias } = renderizar('/buques/abc')

    expect(await screen.findByRole('alert')).toHaveTextContent('El identificador del buque no es válido.')
    expect(dependencias.buques.obtener).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Volver a buques' })).toBeInTheDocument()
  })
})
