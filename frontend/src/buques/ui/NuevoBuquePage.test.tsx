import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/http/apiClient'
import { crearDependenciasFalsas, renderizarRutas, unDetalleBuque } from '../../test/dobles'
import type { BuqueDetalle } from '../domain/buque'
import { NuevoBuquePage } from './NuevoBuquePage'

function renderizar(dependencias = crearDependenciasFalsas().dependencias) {
  const router = renderizarRutas(
    [
      { path: '/buques', element: <p>Listado</p> },
      { path: '/buques/nuevo', element: <NuevoBuquePage /> },
      { path: '/buques/:id', element: <p>Ficha</p> },
    ],
    dependencias,
    '/buques/nuevo',
  )
  return { router, dependencias }
}

async function rellenarRequeridos() {
  await userEvent.type(screen.getByLabelText('Nombre'), '  ARC Caribe ')
  await userEvent.type(screen.getByLabelText('Tipo'), 'Fragata')
}

describe('NuevoBuquePage', () => {
  it('creates the vessel with trimmed values, only the filled fields, and opens its sheet', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.crear.mockResolvedValue(unDetalleBuque({ id: 9 }))
    const { router } = renderizar(dependencias)

    await rellenarRequeridos()
    await userEvent.type(screen.getByLabelText('Etapa'), 'En construcción')
    await userEvent.type(screen.getByLabelText('Eslora total (m)'), '110.5')
    await userEvent.type(screen.getByLabelText('Autonomía (h)'), '120')
    await userEvent.click(screen.getByRole('button', { name: 'Crear buque' }))

    expect(dependencias.buques.crear).toHaveBeenCalledWith({
      nombre: 'ARC Caribe',
      tipo: 'Fragata',
      etapa: 'En construcción',
      esloraTotalM: 110.5,
      autonomiaHoras: 120,
    })
    expect(router.state.location.pathname).toBe('/buques/9')
  })

  it('requires name and type before calling the port', async () => {
    const { dependencias } = renderizar()

    await userEvent.click(screen.getByRole('button', { name: 'Crear buque' }))

    expect(screen.getAllByText('Este campo es requerido.')).toHaveLength(2)
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true')
    expect(dependencias.buques.crear).not.toHaveBeenCalled()
  })

  it('shows each server error under its field and lists the unmapped ones in the alert', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.crear.mockRejectedValue(
      new ApiError(400, 'Datos inválidos.', {
        nombre: ['Asegúrese de que este valor tenga como máximo 255 caracteres.'],
        puntal_m: ['No puede ser negativo.'],
        campo_raro: ['Campo desconocido o no editable.'],
      }),
    )
    renderizar(dependencias)
    await rellenarRequeridos()

    await userEvent.click(screen.getByRole('button', { name: 'Crear buque' }))

    expect(await screen.findByText('No puede ser negativo.')).toBeInTheDocument()
    expect(screen.getByLabelText('Puntal (m)')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Asegúrese de que este valor tenga como máximo 255 caracteres.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('campo_raro: Campo desconocido o no editable.')
    expect(screen.getByRole('button', { name: 'Crear buque' })).toBeEnabled()
  })

  it('shows a generic error in the alert', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.crear.mockRejectedValue(new Error('No se pudo conectar con el servidor.'))
    renderizar(dependencias)
    await rellenarRequeridos()

    await userEvent.click(screen.getByRole('button', { name: 'Crear buque' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor.')
  })

  it('disables the submit button while the request is in flight', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.crear.mockReturnValue(new Promise<BuqueDetalle>(() => {}))
    renderizar(dependencias)
    await rellenarRequeridos()

    await userEvent.click(screen.getByRole('button', { name: 'Crear buque' }))

    expect(screen.getByRole('button', { name: 'Creando…' })).toBeDisabled()
  })
})
