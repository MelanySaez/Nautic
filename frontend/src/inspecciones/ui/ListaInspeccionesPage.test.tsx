import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/http/apiClient'
import { crearDependenciasFalsas, renderizarRutas, unaInspeccion, unaPagina } from '../../test/dobles'
import { ListaInspeccionesPage } from './ListaInspeccionesPage'

function renderizar(dependencias = crearDependenciasFalsas().dependencias, ruta = '/') {
  const router = renderizarRutas(
    [
      { path: '/', element: <ListaInspeccionesPage /> },
      { path: '/vision', element: <p>Formulario nuevo</p> },
      { path: '/vision/:id', element: <p>Carga de fotos</p> },
      { path: '/inspecciones/:id/resultados', element: <p>Resultados</p> },
    ],
    dependencias,
    ruta,
  )
  return { router, dependencias }
}

describe('ListaInspeccionesPage', () => {
  it('lists inspections with name, vessel, maximum severity, inspector, description and photo count', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.buscar.mockResolvedValue(unaPagina([
      unaInspeccion({
        id: 1,
        nombre: 'Control de casco 2026',
        buqueNombre: 'ARA Almirante Brown',
        severidadMax: 'high',
        tomadoPor: 'María Pérez',
        totalFotos: 12,
      }),
    ]))

    renderizar(dependencias)

    const tarjeta = await screen.findByRole('article', { name: 'Control de casco 2026' })
    expect(tarjeta).toHaveTextContent('ARA Almirante Brown')
    expect(tarjeta).toHaveTextContent('Alta')
    expect(tarjeta).toHaveTextContent('María Pérez')
    expect(tarjeta).toHaveTextContent('Control anual de casco')
    expect(tarjeta).toHaveTextContent('12 fotos')
  })

  it('shows "Sin asignar" when the inspector is blank', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.buscar.mockResolvedValue(unaPagina([unaInspeccion({ tomadoPor: '' })]))

    renderizar(dependencias)

    expect(await screen.findByRole('article')).toHaveTextContent('Sin asignar')
  })

  it('sends the filters of the URL to the search', async () => {
    const { dependencias } = crearDependenciasFalsas()
    renderizar(dependencias, '/?buque=2&desde=2026-10-01&hasta=2026-10-31&severidad_min=high&q=casco')

    expect(await screen.findByText('Ninguna inspección coincide con los filtros.')).toBeInTheDocument()
    expect(dependencias.inspecciones.buscar).toHaveBeenCalledWith({
      buqueId: 2,
      desde: '2026-10-01',
      hasta: '2026-10-31',
      severidadMin: 'high',
      q: 'casco',
    })
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-01')
  })

  it('searches by name after a pause, only from two characters, and keeps the text in the URL', async () => {
    const { dependencias } = crearDependenciasFalsas()
    const { router } = renderizar(dependencias)
    await screen.findByText('Todavía no hay inspecciones.')
    const caja = screen.getByRole('searchbox', { name: 'Buscar por nombre' })

    await userEvent.type(caja, 'c')
    await new Promise((resolver) => setTimeout(resolver, 450))
    expect(dependencias.inspecciones.buscar).toHaveBeenCalledTimes(1)

    await userEvent.type(caja, 'asco')
    await waitFor(() => expect(dependencias.inspecciones.buscar).toHaveBeenLastCalledWith({ q: 'casco' }))
    expect(router.state.location.search).toBe('?q=casco')
  })

  it('clears the search box when the URL drops the text, e.g. from the nav link', async () => {
    const { router } = renderizar(crearDependenciasFalsas().dependencias, '/?q=casco')
    const caja = await screen.findByRole('searchbox', { name: 'Buscar por nombre' })
    expect(caja).toHaveValue('casco')

    await router.navigate('/')

    await waitFor(() => expect(caja).toHaveValue(''))
  })

  it('appends the next page with "Cargar más" until the server has no more', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.buscar
      .mockResolvedValueOnce(unaPagina([unaInspeccion({ id: 2, buqueNombre: 'ARA Libertad' })], { siguiente: 'c1', hayMas: true }))
      .mockResolvedValueOnce(unaPagina([unaInspeccion({ id: 1 })]))
    renderizar(dependencias)

    await userEvent.click(await screen.findByRole('button', { name: 'Cargar más' }))

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(dependencias.inspecciones.buscar).toHaveBeenLastCalledWith({}, 'c1')
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument()
  })

  it('shows the server message next to the invalid filter', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.buscar.mockRejectedValue(
      new ApiError(400, 'Datos inválidos.', { desde: ['No puede ser posterior a "hasta".'] }),
    )
    renderizar(dependencias, '/?desde=2026-10-31&hasta=2026-10-01')

    await waitFor(() =>
      expect(screen.getByLabelText('Desde')).toHaveAccessibleDescription('No puede ser posterior a "hasta".'),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an empty state with a call to action when there are no inspections', async () => {
    renderizar()

    expect(await screen.findByText('Todavía no hay inspecciones.')).toBeInTheDocument()
  })

  it('navigates to the new inspection form', async () => {
    const { router } = renderizar()
    await screen.findByText('Todavía no hay inspecciones.')

    await userEvent.click(screen.getAllByRole('link', { name: /Nueva inspección/ })[0])

    expect(router.state.location.pathname).toBe('/vision')
  })

  it('opens the results of an inspection', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.buscar.mockResolvedValue(unaPagina([unaInspeccion({ id: 42, nombre: 'Control anual' })]))
    const { router } = renderizar(dependencias)

    await userEvent.click(await screen.findByRole('link', { name: 'Abrir inspección Control anual' }))

    expect(router.state.location.pathname).toBe('/inspecciones/42/resultados')
  })

  it('deletes an inspection after confirmation', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.buscar.mockResolvedValue(unaPagina([unaInspeccion({ id: 42 })]))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderizar(dependencias)
    const tarjeta = await screen.findByRole('article')

    await userEvent.click(within(tarjeta).getByRole('button', { name: 'Eliminar inspección' }))

    expect(window.confirm).toHaveBeenCalledWith(
      '¿Eliminar la inspección de ARA Almirante Brown? Se borrarán también sus fotos.',
    )
    expect(dependencias.inspecciones.eliminar).toHaveBeenCalledWith(42)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('keeps the inspection when the deletion is not confirmed', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.buscar.mockResolvedValue(unaPagina([unaInspeccion()]))
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderizar(dependencias)

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar inspección' }))

    expect(dependencias.inspecciones.eliminar).not.toHaveBeenCalled()
    expect(screen.getByRole('article')).toBeInTheDocument()
  })

  it('reports a failed deletion and keeps the inspection', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.buscar.mockResolvedValue(unaPagina([unaInspeccion()]))
    dependencias.inspecciones.eliminar.mockRejectedValue(new Error('No encontrado.'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderizar(dependencias)

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar inspección' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontrado.')
    expect(screen.getByRole('article')).toBeInTheDocument()
  })

  it('shows the loading error and retries on demand', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.buscar
      .mockRejectedValueOnce(new Error('No se pudo conectar con el servidor.'))
      .mockResolvedValueOnce(unaPagina([unaInspeccion()]))
    renderizar(dependencias)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor.')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('article')).toBeInTheDocument()
  })
})
