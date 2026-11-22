import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/http/apiClient'
import { crearDependenciasFalsas, renderizarRutas, unDetalleBuque } from '../../test/dobles'
import type { BuqueDetalle } from '../domain/buque'
import { EditarBuqueRuta } from './EditarBuquePage'

const BUQUE = unDetalleBuque({
  id: 7,
  nombre: 'ARC Caribe',
  tipo: 'Fragata',
  etapa: 'Activo',
  descripcion: 'Buque de prueba',
  imagen: '/media/buques/imagenes/caribe.png',
  esloraTotalM: 110.5,
  puntalM: 8,
})

function renderizar(ruta = '/buques/7/editar', dependencias = conBuque()) {
  const router = renderizarRutas(
    [
      { path: '/buques', element: <p>Listado</p> },
      { path: '/buques/:id', element: <p>Ficha</p> },
      { path: '/buques/:id/editar', element: <EditarBuqueRuta /> },
    ],
    dependencias,
    ruta,
  )
  return { router, dependencias }
}

function conBuque() {
  const { dependencias } = crearDependenciasFalsas()
  dependencias.buques.obtener.mockResolvedValue(BUQUE)
  return dependencias
}

describe('EditarBuquePage', () => {
  it('prefills the form with the current technical sheet', async () => {
    const { dependencias } = renderizar()

    expect(await screen.findByLabelText('Nombre')).toHaveValue('ARC Caribe')
    expect(dependencias.buques.obtener).toHaveBeenCalledWith(7)
    expect(screen.getByLabelText('Tipo')).toHaveValue('Fragata')
    expect(screen.getByLabelText('Descripción')).toHaveValue('Buque de prueba')
    expect(screen.getByRole('img', { name: 'Vista previa de la imagen' })).toHaveAttribute(
      'src',
      '/media/buques/imagenes/caribe.png',
    )
    expect(screen.getByLabelText('Eslora total (m)')).toHaveValue(110.5)
    expect(screen.getByLabelText('Manga moldeada (m)')).toHaveValue(null)
  })

  it('sends only the changed fields, clearing emptied ones, and returns to the sheet', async () => {
    const { router, dependencias } = renderizar()

    const nombre = await screen.findByLabelText('Nombre')
    await userEvent.clear(nombre)
    await userEvent.type(nombre, ' ARC Pacífico ')
    await userEvent.clear(screen.getByLabelText('Puntal (m)'))
    await userEvent.type(screen.getByLabelText('Manga moldeada (m)'), '14')
    await userEvent.clear(screen.getByLabelText('Descripción'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(dependencias.buques.actualizar).toHaveBeenCalledWith(7, {
      nombre: 'ARC Pacífico',
      descripcion: '',
      puntalM: null,
      mangaMoldeadaM: 14,
    })
    expect(router.state.location.pathname).toBe('/buques/7')
  })

  it('goes back to the sheet without calling the port when nothing changed', async () => {
    const { router, dependencias } = renderizar()

    await userEvent.click(await screen.findByRole('button', { name: 'Guardar cambios' }))

    expect(dependencias.buques.actualizar).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/buques/7')
  })

  it('requires a name before calling the port', async () => {
    const { dependencias } = renderizar()

    await userEvent.clear(await screen.findByLabelText('Nombre'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(screen.getAllByText('Este campo es requerido.')).toHaveLength(1)
    expect(dependencias.buques.actualizar).not.toHaveBeenCalled()
  })

  it('changes the stage from its list and sends only that', async () => {
    const dependencias = conBuque()
    renderizar('/buques/7/editar', dependencias)

    const etapa = await screen.findByRole('combobox', { name: 'Etapa' })
    expect(etapa).toHaveValue('Activo')
    await userEvent.selectOptions(etapa, 'En construcción')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(dependencias.buques.actualizar).toHaveBeenCalledWith(7, { etapa: 'En construcción' })
  })

  it('keeps a stage from before the list until another one is chosen', async () => {
    const dependencias = conBuque()
    dependencias.buques.obtener.mockResolvedValue(unDetalleBuque({ ...BUQUE, etapa: 'En reparación' }))
    renderizar('/buques/7/editar', dependencias)

    const etapa = await screen.findByRole('combobox', { name: 'Etapa' })
    expect(etapa).toHaveValue('En reparación')
    expect(within(etapa).getByRole('option', { selected: true })).toHaveTextContent('En reparación (fuera de la lista)')
    await userEvent.type(screen.getByLabelText('Puntal (m)'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(dependencias.buques.actualizar).toHaveBeenCalledWith(7, { puntalM: 81 })
  })

  it('shows each server error under its field', async () => {
    const dependencias = conBuque()
    dependencias.buques.actualizar.mockRejectedValue(
      new ApiError(400, 'Datos inválidos.', { puntal_m: ['No puede ser negativo.'] }),
    )
    renderizar('/buques/7/editar', dependencias)

    await userEvent.type(await screen.findByLabelText('Puntal (m)'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('No puede ser negativo.')).toBeInTheDocument()
    expect(screen.getByLabelText('Puntal (m)')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  })

  it('disables the submit button while saving', async () => {
    const dependencias = conBuque()
    dependencias.buques.actualizar.mockReturnValue(new Promise<BuqueDetalle>(() => {}))
    renderizar('/buques/7/editar', dependencias)

    await userEvent.selectOptions(await screen.findByLabelText('Tipo'), 'Corbeta')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
  })

  it('keeps a type from before the catalogue until another one is chosen', async () => {
    const dependencias = conBuque()
    dependencias.buques.obtener.mockResolvedValue(unDetalleBuque({ ...BUQUE, tipo: 'Remolcador' }))
    renderizar('/buques/7/editar', dependencias)

    const tipo = await screen.findByLabelText('Tipo')
    expect(tipo).toHaveValue('Remolcador')
    expect(within(tipo).getByRole('option', { selected: true })).toHaveTextContent('Remolcador (fuera del catálogo)')
    await userEvent.type(screen.getByLabelText('Puntal (m)'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(dependencias.buques.actualizar).toHaveBeenCalledWith(7, { puntalM: 81 })
  })

  it('replaces a type from before the catalogue with the chosen one', async () => {
    const dependencias = conBuque()
    dependencias.buques.obtener.mockResolvedValue(unDetalleBuque({ ...BUQUE, tipo: 'Remolcador' }))
    renderizar('/buques/7/editar', dependencias)
    const tipo = await screen.findByLabelText('Tipo')

    await userEvent.selectOptions(tipo, 'Patrullera')

    expect(within(tipo).queryByRole('option', { name: /fuera del catálogo/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(dependencias.buques.actualizar).toHaveBeenCalledWith(7, { tipo: 'Patrullera' })
  })

  it('shows a stored type written differently as its catalogue entry, and leaves it alone', async () => {
    const dependencias = conBuque()
    dependencias.buques.obtener.mockResolvedValue(unDetalleBuque({ ...BUQUE, tipo: 'buque logistico' }))
    renderizar('/buques/7/editar', dependencias)

    const tipo = await screen.findByLabelText('Tipo')
    expect(tipo).toHaveValue('Buque logístico')
    expect(within(tipo).queryByRole('option', { name: /fuera del catálogo/ })).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Puntal (m)'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(dependencias.buques.actualizar).toHaveBeenCalledWith(7, { puntalM: 81 })
  })

  it('sends the name of the chosen type', async () => {
    const { dependencias } = renderizar()

    await userEvent.selectOptions(await screen.findByLabelText('Tipo'), 'Patrullera')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(dependencias.buques.actualizar).toHaveBeenCalledWith(7, { tipo: 'Patrullera' })
  })

  it('replaces the image with the chosen file when saving', async () => {
    const { router, dependencias } = renderizar()
    const archivo = new File(['png'], 'nueva.png', { type: 'image/png' })

    await userEvent.upload(await screen.findByLabelText('Imagen'), archivo)
    expect(screen.getByRole('img', { name: 'Vista previa de la imagen' })).toHaveAttribute('src', 'blob:nueva.png')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(dependencias.buques.subirImagen).toHaveBeenCalledWith(7, archivo)
    expect(dependencias.buques.actualizar).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/buques/7')
  })

  it('removes the current image when saving', async () => {
    const { dependencias } = renderizar()

    await userEvent.click(await screen.findByRole('button', { name: 'Quitar imagen' }))
    expect(screen.queryByRole('img', { name: 'Vista previa de la imagen' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(dependencias.buques.quitarImagen).toHaveBeenCalledWith(7)
    expect(dependencias.buques.subirImagen).not.toHaveBeenCalled()
  })

  it('shows a failed image upload under the field and stays on the form', async () => {
    const dependencias = conBuque()
    dependencias.buques.subirImagen.mockRejectedValue(
      new ApiError(400, 'Datos inválidos.', { imagen: ['El archivo no es una imagen válida o está corrupto.'] }),
    )
    const { router } = renderizar('/buques/7/editar', dependencias)
    const selector = await screen.findByLabelText('Imagen')

    await userEvent.upload(selector, new File(['png'], 'rota.png', { type: 'image/png' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('El archivo no es una imagen válida o está corrupto.')).toBeInTheDocument()
    expect(selector).toHaveAttribute('aria-invalid', 'true')
    expect(router.state.location.pathname).toBe('/buques/7/editar')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()

    // The same file can be sent again once the problem is gone.
    dependencias.buques.subirImagen.mockResolvedValue(unDetalleBuque({ id: 7 }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(dependencias.buques.subirImagen).toHaveBeenCalledTimes(2)
    expect(router.state.location.pathname).toBe('/buques/7')
  })

  it('cancels back to the sheet', async () => {
    const { router } = renderizar()

    await userEvent.click(await screen.findByRole('link', { name: 'Cancelar' }))

    expect(router.state.location.pathname).toBe('/buques/7')
  })

  it('shows the load error when the vessel does not exist', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.obtener.mockRejectedValue(new ApiError(404, 'No encontrado.'))
    renderizar('/buques/7/editar', dependencias)

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontrado.')
  })
})
