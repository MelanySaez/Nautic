import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/http/apiClient'
import { crearDependenciasFalsas, renderizarRutas, unBorradorReporte } from '../../test/dobles'
import type { BorradorReporte } from '../domain/reporte'
import { ReporteRuta } from './ReportePage'

function renderizar(borrador: BorradorReporte = unBorradorReporte()) {
  const falsas = crearDependenciasFalsas()
  falsas.dependencias.inspecciones.obtenerReporte.mockResolvedValue(borrador)
  const router = renderizarRutas(
    [
      { path: '/inspecciones/:id/reporte', element: <ReporteRuta /> },
      { path: '/inspecciones/:id/resultados', element: <p>Resultados</p> },
    ],
    falsas.dependencias,
    '/inspecciones/7/reporte',
  )
  return { ...falsas, router }
}

describe('ReportePage', () => {
  it('shows the saved draft and every finding to review, confirmed unless discarded', async () => {
    const borrador = unBorradorReporte({ conclusion: 'Regular', inspectorNombre: 'Ana Gómez' })
    borrador.fotos[0].hallazgos[1].descartado = true
    borrador.fotos[0].nota = 'Reflejo'
    const { dependencias } = renderizar(borrador)

    expect(await screen.findByLabelText('Conclusión')).toHaveValue('Regular')
    expect(dependencias.inspecciones.obtenerReporte).toHaveBeenCalledWith(7)
    expect(screen.getByLabelText('Nombre del inspector')).toHaveValue('Ana Gómez')
    const foto = screen.getByRole('group', { name: 'Foto #4 · KEEL · Quilla' })
    expect(within(foto).getByRole('checkbox', { name: /Corrosión/ })).toBeChecked()
    expect(within(foto).getByRole('checkbox', { name: /Descascaramiento de pintura/ })).not.toBeChecked()
    expect(within(foto).getByLabelText('Nota del inspector')).toHaveValue('Reflejo')
    expect(screen.getByRole('link', { name: 'Descargar PDF' })).toHaveAttribute('href', '/api/vision/inspecciones/7/reporte/pdf/')
  })

  it('saves only the changed texts and photo reviews, and blocks the download until saved', async () => {
    const { dependencias } = renderizar()
    dependencias.inspecciones.guardarReporte.mockResolvedValue(unBorradorReporte({ conclusion: 'Casco regular' }))

    await userEvent.type(await screen.findByLabelText('Conclusión'), '  Casco regular ')
    const foto = screen.getByRole('group', { name: 'Foto #4 · KEEL · Quilla' })
    await userEvent.click(within(foto).getByRole('checkbox', { name: /Descascaramiento de pintura/ }))
    await userEvent.type(within(foto).getByLabelText('Nota del inspector'), 'Era un reflejo')

    expect(screen.queryByRole('link', { name: 'Descargar PDF' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeDisabled()
    expect(screen.getByText('Guarda los cambios para incluirlos en el PDF.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(dependencias.inspecciones.guardarReporte).toHaveBeenCalledWith(7, {
      conclusion: 'Casco regular',
      fotos: [{ fotoId: 4, descartadas: ['paint_peel'], nota: 'Era un reflejo' }],
    })
    expect(await screen.findByRole('link', { name: 'Descargar PDF' })).toBeInTheDocument()
    expect(screen.getByLabelText('Conclusión')).toHaveValue('Casco regular')
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  it('shows the server field errors and keeps the edits', async () => {
    const { dependencias } = renderizar()
    dependencias.inspecciones.guardarReporte.mockRejectedValue(
      new ApiError(400, 'Datos inválidos.', {
        inspector_nombre: ['Máximo 255 caracteres.'],
        fotos: ['Foto 4: todavía no está analizada.'],
      }),
    )

    await userEvent.type(await screen.findByLabelText('Nombre del inspector'), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Máximo 255 caracteres.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del inspector')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Foto 4: todavía no está analizada.')
    expect(screen.getByLabelText('Nombre del inspector')).toHaveValue('Ana')
  })

  it('explains that there is nothing to review when no photo has anomalies', async () => {
    renderizar(unBorradorReporte({ fotos: [] }))

    expect(await screen.findByText('No hay fotos con anomalías para revisar.')).toBeInTheDocument()
  })

  it('shows the load error', async () => {
    const { dependencias } = crearDependenciasFalsas()
    dependencias.inspecciones.obtenerReporte.mockRejectedValue(new ApiError(404, 'No encontrado.'))
    renderizarRutas([{ path: '/inspecciones/:id/reporte', element: <ReporteRuta /> }], dependencias, '/inspecciones/7/reporte')

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontrado.')
  })
})
