import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { crearDependenciasFalsas, renderizarRutas, unaInspeccion, unaPagina } from '../../test/dobles'
import { ListaInspeccionesPage } from './ListaInspeccionesPage'

function renderizar(dependencias = crearDependenciasFalsas().dependencias) {
  const router = renderizarRutas(
    [
      { path: '/', element: <ListaInspeccionesPage /> },
      { path: '/vision', element: <p>Formulario nuevo</p> },
      { path: '/vision/:id', element: <p>Carga de fotos</p> },
    ],
    dependencias,
    '/',
  )
  return { router, dependencias }
}

describe('ListaInspeccionesPage', () => {
  it('lists inspections with vessel, inspector, description and photo count', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.buscar.mockResolvedValue(unaPagina([
      unaInspeccion({ id: 1, buqueNombre: 'ARA Almirante Brown', tomadoPor: 'María Pérez', totalFotos: 12 }),
    ]))

    renderizar(dependencias)

    const tarjeta = await screen.findByRole('article', { name: 'ARA Almirante Brown' })
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

  it('filters by vessel or inspector as the user types', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.buscar.mockResolvedValue(unaPagina([
      unaInspeccion({ id: 1, buqueNombre: 'ARA Almirante Brown', tomadoPor: 'María Pérez' }),
      unaInspeccion({ id: 2, buqueNombre: 'ARA Libertad', tomadoPor: 'Juan Gómez' }),
    ]))
    renderizar(dependencias)
    await screen.findByRole('article', { name: 'ARA Libertad' })

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar buque o inspector' }), 'juan')

    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['ARA Libertad'])
  })

  it('tells the user when the search has no matches', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.buscar.mockResolvedValue(unaPagina([unaInspeccion()]))
    renderizar(dependencias)
    await screen.findByRole('article')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar buque o inspector' }), 'zzz')

    expect(screen.getByText('Ninguna inspección coincide con "zzz".')).toBeInTheDocument()
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

  it('opens the photo upload of an inspection', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.buscar.mockResolvedValue(unaPagina([unaInspeccion({ id: 42 })]))
    const { router } = renderizar(dependencias)

    await userEvent.click(await screen.findByRole('link', { name: 'Abrir inspección de ARA Almirante Brown' }))

    expect(router.state.location.pathname).toBe('/vision/42')
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
