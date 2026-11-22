import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/http/apiClient'
import { crearDependenciasFalsas, renderizarRutas, unaInspeccion, unBuque } from '../../test/dobles'
import { NuevaInspeccionPage } from './NuevaInspeccionPage'

function renderizar(
  dependencias = crearDependenciasFalsas().dependencias,
  ruta: string | { pathname: string; search?: string; state?: unknown } = '/vision',
) {
  const router = renderizarRutas(
    [
      { path: '/', element: <p>Listado</p> },
      { path: '/inspecciones/buque/:id', element: <p>Inspecciones del buque</p> },
      { path: '/vision', element: <NuevaInspeccionPage /> },
      { path: '/vision/:id', element: <p>Carga de fotos</p> },
    ],
    dependencias,
    ruta,
  )
  return { router, dependencias }
}

describe('NuevaInspeccionPage back link', () => {
  it('goes back to the vessel view it was opened from', async () => {
    const { router } = renderizar(undefined, {
      pathname: '/vision',
      search: '?buque=1&zona=12',
      state: { volverA: '/inspecciones/buque/1?vista=3d&zona=12' },
    })

    const volver = screen.getByRole('link', { name: 'Volver' })
    expect(volver).toHaveAttribute('href', '/inspecciones/buque/1?vista=3d&zona=12')
    await userEvent.click(volver)
    expect(router.state.location.pathname).toBe('/inspecciones/buque/1')
    expect(router.state.location.search).toBe('?vista=3d&zona=12')
  })

  it('goes back to the inspections list when opened without an origin', () => {
    renderizar()

    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/')
  })

  it('ignores an origin outside the inspections pages', () => {
    renderizar(undefined, { pathname: '/vision', state: { volverA: '//otro.sitio/phish' } })

    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/')
  })
})

describe('NuevaInspeccionPage', () => {
  it('offers the fleet vessels to choose from', async () => {
    renderizar()

    const selector = screen.getByLabelText('Buque')
    expect(await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })).toBeInTheDocument()
    expect(selector).toHaveValue('')
  })

  it('has no inspector field: the leader signs and the team is set in "Acceso y equipo"', async () => {
    renderizar()
    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })

    expect(screen.queryByLabelText('Inspector')).not.toBeInTheDocument()
  })

  it('creates the inspection with trimmed values and opens its photo upload', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.crear.mockResolvedValue(unaInspeccion({ id: 42 }))
    const { router } = renderizar(dependencias)
    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })

    await userEvent.selectOptions(screen.getByLabelText('Buque'), '2')
    await userEvent.type(screen.getByLabelText('Nombre (opcional)'), ' Control anual 2026 ')
    await userEvent.type(screen.getByLabelText('Descripción'), ' Control de proa ')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspección' }))

    expect(dependencias.inspecciones.crear).toHaveBeenCalledWith({
      buqueId: 2,
      nombre: 'Control anual 2026',
      descripcion: 'Control de proa',
    })
    expect(router.state.location.pathname).toBe('/vision/42')
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

  it('invites the team with their roles while creating the inspection', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.crear.mockResolvedValue(unaInspeccion({ id: 42 }))
    renderizar(dependencias)
    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })
    await userEvent.selectOptions(screen.getByLabelText('Buque'), '2')

    await userEvent.click(screen.getByRole('button', { name: 'Agregar persona' }))
    await userEvent.type(screen.getByLabelText('Nombre o email de la persona 1'), ' ana@nautic.test ')
    await userEvent.selectOptions(screen.getByLabelText('Rol de la persona 1'), 'revisor')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar persona' }))
    await userEvent.type(screen.getByLabelText('Nombre o email de la persona 2'), 'luis@nautic.test')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar persona' }))
    await userEvent.type(screen.getByLabelText('Nombre o email de la persona 3'), 'sobra@nautic.test')
    await userEvent.click(screen.getByRole('button', { name: 'Quitar persona 3' }))
    await userEvent.click(screen.getByRole('button', { name: 'Agregar persona' }))   // left blank: ignored
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspección' }))

    expect(dependencias.inspecciones.crear).toHaveBeenCalledWith(expect.objectContaining({
      buqueId: 2,
      miembros: [
        { email: 'ana@nautic.test', rol: 'revisor' },
        { email: 'luis@nautic.test', rol: 'colaborador' },
      ],
    }))
  })

  it('invites a person with custom permissions, like when editing the team', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.crear.mockResolvedValue(unaInspeccion({ id: 42 }))
    renderizar(dependencias)
    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })
    await userEvent.selectOptions(screen.getByLabelText('Buque'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar persona' }))
    await userEvent.type(screen.getByLabelText('Nombre o email de la persona 1'), 'ana@nautic.test')
    const permisos = screen.getByRole('group', { name: 'Permisos de la persona 1' })

    // A role shows its permissions; changing one makes the role "Personalizado".
    await userEvent.selectOptions(screen.getByLabelText('Rol de la persona 1'), 'revisor')
    expect(within(permisos).getByRole('checkbox', { name: 'Editar reporte' })).toBeChecked()
    expect(within(permisos).getByRole('checkbox', { name: 'Analizar' })).not.toBeChecked()
    await userEvent.click(within(permisos).getByRole('checkbox', { name: 'Analizar' }))
    expect(screen.getByLabelText('Rol de la persona 1')).toHaveValue('personalizado')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspección' }))

    expect(dependencias.inspecciones.crear).toHaveBeenCalledWith(expect.objectContaining({
      miembros: [{
        email: 'ana@nautic.test',
        rol: 'observador',
        permisos: { subirFotos: false, analizar: true, editarReporte: true, editarInspeccion: false },
      }],
    }))
  })

  it('invites a person picked from the suggestions by id and shows id errors on that row', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.miembros.buscarUsuarios.mockResolvedValue([{ id: 8, nombre: 'Marta Ruiz', cargo: 'Jefa de dique' }])
    dependencias.inspecciones.crear.mockRejectedValue(new ApiError(400, 'Datos inválidos.', {
      'miembros.0.usuario_id': ['Ya es miembro de la inspección.'],
    }))
    renderizar(dependencias)
    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })
    await userEvent.selectOptions(screen.getByLabelText('Buque'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar persona' }))

    await userEvent.type(screen.getByLabelText('Nombre o email de la persona 1'), 'mar')
    await userEvent.click(await screen.findByRole('option', { name: /Marta Ruiz/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspección' }))

    expect(dependencias.miembros.buscarUsuarios).toHaveBeenLastCalledWith('mar')
    expect(dependencias.inspecciones.crear).toHaveBeenCalledWith(expect.objectContaining({
      miembros: [{ usuarioId: 8, rol: 'colaborador' }],
    }))
    expect(await screen.findByText('Ya es miembro de la inspección.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre o email de la persona 1')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows why an invited person was rejected next to that row and creates nothing', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.crear.mockRejectedValue(new ApiError(400, 'Datos inválidos.', {
      'miembros.1.email': ['No hay ninguna cuenta activa con este email.'],
    }))
    const { router } = renderizar(dependencias)
    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })
    await userEvent.selectOptions(screen.getByLabelText('Buque'), '2')
    for (const email of ['ana@nautic.test', 'nadie@nautic.test']) {
      await userEvent.click(screen.getByRole('button', { name: 'Agregar persona' }))
      const filas = screen.getAllByLabelText(/^Nombre o email de la persona/)
      await userEvent.type(filas[filas.length - 1], email)
    }

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspección' }))

    expect(await screen.findByText('No hay ninguna cuenta activa con este email.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre o email de la persona 2')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Nombre o email de la persona 1')).not.toHaveAttribute('aria-invalid')
    expect(router.state.location.pathname).toBe('/vision')
  })

  it('shows a field error that does not belong to any invited row', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.crear.mockRejectedValue(new ApiError(400, 'Datos inválidos.', {}))
    renderizar(dependencias)
    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })
    await userEvent.selectOptions(screen.getByLabelText('Buque'), '2')

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspección' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Datos inválidos.')
  })

  it('maps a server error to the right row when a blank row sits between filled ones', async () => {
    const { dependencias } = crearDependenciasFalsas()
    // The server only received the two filled rows: index 1 is the third row on screen.
    dependencias.inspecciones.crear.mockRejectedValue(new ApiError(400, 'Datos inválidos.', {
      'miembros.1.email': ['Ya es miembro de la inspección.'],
    }))
    renderizar(dependencias)
    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })
    await userEvent.selectOptions(screen.getByLabelText('Buque'), '2')
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole('button', { name: 'Agregar persona' }))
    await userEvent.type(screen.getByLabelText('Nombre o email de la persona 1'), 'ana@nautic.test')
    await userEvent.type(screen.getByLabelText('Nombre o email de la persona 3'), 'luis@nautic.test')

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspección' }))

    expect(await screen.findByText('Ya es miembro de la inspección.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre o email de la persona 3')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Nombre o email de la persona 2')).not.toHaveAttribute('aria-invalid')
    expect(dependencias.inspecciones.crear).toHaveBeenCalledWith(expect.objectContaining({
      miembros: [{ email: 'ana@nautic.test', rol: 'colaborador' }, { email: 'luis@nautic.test', rol: 'colaborador' }],
    }))
  })

  it('creates a private inspection when that option is checked', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.crear.mockResolvedValue(unaInspeccion({ id: 42 }))
    renderizar(dependencias)
    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })
    await userEvent.selectOptions(screen.getByLabelText('Buque'), '2')

    const privada = screen.getByRole('checkbox', { name: 'Inspección privada' })
    expect(privada).not.toBeChecked()
    await userEvent.click(privada)
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspección' }))

    expect(dependencias.inspecciones.crear).toHaveBeenCalledWith(expect.objectContaining({ buqueId: 2, privada: true }))
  })
})

describe('NuevaInspeccionPage deep links', () => {
  it('preselects the vessel given in the URL', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.buques.listar.mockResolvedValue([
      unBuque(),
      unBuque({ id: 7, nombre: 'ARA Libertad', tipo: 'Fragata' }),
    ])
    renderizar(dependencias, '/vision?buque=7')

    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })

    expect(screen.getByLabelText('Buque')).toHaveValue('7')
  })

  it('ignores a vessel of the URL that is not in the fleet', async () => {
    renderizar(undefined, '/vision?buque=99')

    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })

    expect(screen.getByLabelText('Buque')).toHaveValue('')
  })

  it('lets the user choose another vessel than the preselected one', async () => {
    const { dependencias } = crearDependenciasFalsas()
    renderizar(dependencias, '/vision?buque=1')
    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })

    await userEvent.selectOptions(screen.getByLabelText('Buque'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspección' }))

    expect(dependencias.inspecciones.crear).toHaveBeenCalledWith(expect.objectContaining({ buqueId: 2 }))
  })

  it('creates the inspection for the preselected vessel and opens the zone of the URL', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.crear.mockResolvedValue(unaInspeccion({ id: 42 }))
    const { router } = renderizar(dependencias, '/vision?buque=2&zona=3')
    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspección' }))

    expect(dependencias.inspecciones.crear).toHaveBeenCalledWith(expect.objectContaining({ buqueId: 2 }))
    expect(router.state.location.pathname).toBe('/vision/42')
    expect(router.state.location.search).toBe('?zona=3')
  })

  it('opens the photo upload without a zone when the URL zone is not an id', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.crear.mockResolvedValue(unaInspeccion({ id: 42 }))
    const { router } = renderizar(dependencias, '/vision?zona=proa')
    await screen.findByRole('option', { name: 'ARA Libertad · Fragata' })
    await userEvent.selectOptions(screen.getByLabelText('Buque'), '2')

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspección' }))

    expect(router.state.location.pathname).toBe('/vision/42')
    expect(router.state.location.search).toBe('')
  })
})
