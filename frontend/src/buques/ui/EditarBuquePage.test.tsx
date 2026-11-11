import { screen } from '@testing-library/react'
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
  imagen: 'caribe.png',
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
    expect(screen.getByLabelText('Imagen')).toHaveValue('caribe.png')
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
    await userEvent.clear(screen.getByLabelText('Imagen'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(dependencias.buques.actualizar).toHaveBeenCalledWith(7, {
      nombre: 'ARC Pacífico',
      descripcion: '',
      imagen: null,
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

  it('requires name, type and stage before calling the port', async () => {
    const { dependencias } = renderizar()

    await userEvent.clear(await screen.findByLabelText('Nombre'))
    await userEvent.clear(screen.getByLabelText('Tipo'))
    await userEvent.clear(screen.getByLabelText('Etapa'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(screen.getAllByText('Este campo es requerido.')).toHaveLength(3)
    expect(dependencias.buques.actualizar).not.toHaveBeenCalled()
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

    await userEvent.type(await screen.findByLabelText('Tipo'), ' ligera')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
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
