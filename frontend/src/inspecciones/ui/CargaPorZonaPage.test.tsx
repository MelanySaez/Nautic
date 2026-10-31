import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  crearDependenciasFalsas,
  renderizarRutas,
  SECCION_QUILLA,
  unaFoto,
  unDetalle,
  unModelo,
} from '../../test/dobles'
import { ApiError } from '../../shared/http/apiClient'
import { CargaPorZonaRuta } from './CargaPorZonaPage'

const MODELOS = [
  unModelo(),
  unModelo({ id: 'rtdetr', label: 'RT-DETR', descripcion: 'Detector basado en transformers.', porDefecto: false }),
  unModelo({ id: 'maskrcnn', label: 'Mask R-CNN', porDefecto: false, disponible: false }),
]

const SECCION_PROA = { id: 1, codigo: 'FWD-BTM', nombre: 'Fondo - Proa', descripcion: '', orden: 1 }

function preparar() {
  const falsas = crearDependenciasFalsas()
  falsas.dependencias.inspecciones.obtener.mockResolvedValue(unDetalle({ id: 7, buqueId: 4, buqueNombre: 'ARA Libertad' }))
  falsas.dependencias.inspecciones.listarSecciones.mockResolvedValue([SECCION_QUILLA, SECCION_PROA])
  falsas.dependencias.modelos.listar.mockResolvedValue(MODELOS)
  return falsas
}

function renderizar(dependencias = preparar().dependencias) {
  const router = renderizarRutas(
    [
      { path: '/vision/:id', element: <CargaPorZonaRuta /> },
      { path: '/vision/:id/resultados', element: <p>Resultados</p> },
      { path: '/', element: <p>Listado</p> },
    ],
    dependencias,
    '/vision/7',
  )
  return { router, dependencias }
}

function imagen(nombre: string) {
  return new File(['bytes'], nombre, { type: 'image/jpeg' })
}

async function elegirZona(codigo: string) {
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${codigo}`) }))
}

describe('CargaPorZonaPage', () => {
  it('shows the vessel and the hull zones sorted by their order', async () => {
    const { dependencias } = preparar()
    renderizar(dependencias)

    expect(await screen.findByRole('heading', { name: 'ARA Libertad' })).toBeInTheDocument()
    const mapa = screen.getByRole('group', { name: 'Zonas del casco' })
    expect(within(mapa).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringContaining('FWD-BTM'),
      expect.stringContaining('KEEL'),
    ])
    expect(dependencias.inspecciones.listarSecciones).toHaveBeenCalledWith(4)
  })

  it('keeps the upload disabled until a zone is selected', async () => {
    renderizar()
    await screen.findByRole('heading', { name: 'ARA Libertad' })

    expect(screen.getByLabelText('Subir fotos')).toBeDisabled()
    expect(screen.getByText('Selecciona una zona del casco para cargar fotos.')).toBeInTheDocument()

    await elegirZona('KEEL')

    expect(screen.getByRole('button', { name: /^KEEL/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Subir fotos')).toBeEnabled()
    expect(screen.getByRole('region', { name: 'Zona activa' })).toHaveTextContent('Quilla')
  })

  it('uploads every chosen file to the active zone and queues it', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.subirFoto
      .mockResolvedValueOnce(unaFoto({ id: 21 }))
      .mockResolvedValueOnce(unaFoto({ id: 22 }))
    renderizar(dependencias)
    await elegirZona('KEEL')

    await userEvent.upload(screen.getByLabelText('Subir fotos'), [imagen('a.jpg'), imagen('b.jpg')])

    expect(dependencias.inspecciones.subirFoto).toHaveBeenCalledTimes(2)
    expect(dependencias.inspecciones.subirFoto).toHaveBeenCalledWith(7, SECCION_QUILLA.id, expect.any(File))
    const cola = screen.getByRole('list', { name: 'Fotos de la inspección' })
    expect(within(cola).getAllByRole('listitem')).toHaveLength(2)
    expect(cola).toHaveTextContent('Pendiente')
  })

  it('reports a failed upload naming the file', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.subirFoto.mockRejectedValue(new Error('Archivo no es una imagen válida.'))
    renderizar(dependencias)
    await elegirZona('KEEL')

    await userEvent.upload(screen.getByLabelText('Subir fotos'), imagen('roto.jpg'))

    expect(await screen.findByRole('alert')).toHaveTextContent('roto.jpg: Archivo no es una imagen válida.')
  })

  it('applies live updates from the server and stops listening on leave', async () => {
    const { dependencias, emitirEvento, cancelarSuscripcion } = preparar()
    dependencias.inspecciones.obtener.mockResolvedValue(
      unDetalle({ id: 7, buqueNombre: 'ARA Libertad', fotos: [unaFoto({ id: 21 })] }),
    )
    const { router } = renderizar(dependencias)
    await screen.findByRole('heading', { name: 'ARA Libertad' })
    expect(dependencias.eventos.suscribir).toHaveBeenCalledWith(7, expect.any(Function))

    act(() =>
      emitirEvento({
        tipo: 'foto-actualizada',
        actualizacion: {
          fotoId: 21,
          estado: 'completada',
          severidad: 'high',
          detecciones: [],
          tiempoInferenciaMs: 800,
          imagenAnotada: null,
          errorDetalle: null,
          modelo: null,
          modeloVersion: null,
          taxonomiaVersion: null,
        },
      }),
    )
    act(() => emitirEvento({ tipo: 'foto-creada', foto: unaFoto({ id: 22 }) }))

    const cola = screen.getByRole('list', { name: 'Fotos de la inspección' })
    expect(within(cola).getAllByRole('listitem')).toHaveLength(2)
    expect(cola).toHaveTextContent('Completada')
    expect(screen.getByText('1 de 2 analizadas')).toBeInTheDocument()

    await act(() => router.navigate('/'))
    expect(cancelarSuscripcion).toHaveBeenCalled()
  })

  it('does not duplicate a photo announced by the server after the upload response', async () => {
    const { dependencias, emitirEvento } = preparar()
    dependencias.inspecciones.subirFoto.mockResolvedValue(unaFoto({ id: 21 }))
    renderizar(dependencias)
    await elegirZona('KEEL')

    await userEvent.upload(screen.getByLabelText('Subir fotos'), imagen('a.jpg'))
    act(() => emitirEvento({ tipo: 'foto-creada', foto: unaFoto({ id: 21 }) }))

    expect(within(screen.getByRole('list', { name: 'Fotos de la inspección' })).getAllByRole('listitem')).toHaveLength(1)
  })

  it('starts the analysis of pending photos', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.obtener.mockResolvedValue(
      unDetalle({ id: 7, buqueNombre: 'ARA Libertad', fotos: [unaFoto({ id: 21 }), unaFoto({ id: 22 })] }),
    )
    dependencias.inspecciones.analizar.mockResolvedValue({ iniciadas: 1, omitidasPorLimite: 1 })
    renderizar(dependencias)

    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar análisis' }))

    expect(dependencias.inspecciones.analizar).toHaveBeenCalledWith(7, 'yolo-seg')
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Análisis iniciado para 1 foto. 1 en espera por límite de tareas concurrentes.',
    )
  })

  it('preselects the default model, disables the unavailable one and describes the selection', async () => {
    renderizar()

    const selector = await screen.findByLabelText('Modelo de IA')

    await waitFor(() => expect(selector).toHaveValue('yolo-seg'))
    expect(screen.getByRole('option', { name: 'Mask R-CNN (no disponible)' })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'RT-DETR' })).toBeEnabled()
    expect(screen.getByText('Detecta y segmenta daños del casco.')).toBeInTheDocument()

    await userEvent.selectOptions(selector, 'rtdetr')

    expect(screen.getByText('Detector basado en transformers.')).toBeInTheDocument()
  })

  it('analyzes and retries with the model chosen in the selector', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.obtener.mockResolvedValue(
      unDetalle({
        id: 7,
        buqueNombre: 'ARA Libertad',
        fotos: [unaFoto({ id: 21 }), unaFoto({ id: 22, estado: 'error', errorDetalle: 'Fallo' })],
      }),
    )
    dependencias.inspecciones.analizar.mockResolvedValue({ iniciadas: 1, omitidasPorLimite: 0 })
    dependencias.inspecciones.reintentarFoto.mockResolvedValue(unaFoto({ id: 22 }))
    renderizar(dependencias)
    await screen.findByRole('option', { name: 'RT-DETR' })
    await userEvent.selectOptions(screen.getByLabelText('Modelo de IA'), 'rtdetr')

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar análisis' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar análisis' }))

    expect(dependencias.inspecciones.analizar).toHaveBeenCalledWith(7, 'rtdetr')
    expect(dependencias.inspecciones.reintentarFoto).toHaveBeenCalledWith(22, 'rtdetr')
  })

  it('shows the field error when the server rejects the model', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.obtener.mockResolvedValue(
      unDetalle({ id: 7, buqueNombre: 'ARA Libertad', fotos: [unaFoto({ id: 21 })] }),
    )
    dependencias.inspecciones.analizar.mockRejectedValue(
      new ApiError(400, 'Datos inválidos.', { modelo: ['Modelo no disponible en este servidor.'] }),
    )
    renderizar(dependencias)
    await screen.findByLabelText('Modelo de IA')

    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar análisis' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Modelo no disponible en este servidor.')
  })

  it('shows the model and version on the photos that have one', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.obtener.mockResolvedValue(
      unDetalle({
        id: 7,
        buqueNombre: 'ARA Libertad',
        fotos: [unaFoto({ id: 21, estado: 'completada', modelo: 'rtdetr', modeloVersion: '2.0.1' })],
      }),
    )
    renderizar(dependencias)

    const cola = await screen.findByRole('list', { name: 'Fotos de la inspección' })

    expect(cola).toHaveTextContent('RT-DETR v2.0.1')
  })

  it('disables the analysis when nothing is pending', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.obtener.mockResolvedValue(
      unDetalle({ id: 7, buqueNombre: 'ARA Libertad', fotos: [unaFoto({ estado: 'completada' })] }),
    )
    renderizar(dependencias)

    expect(await screen.findByRole('button', { name: 'Iniciar análisis' })).toBeDisabled()
  })

  it('retries a failed photo', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.obtener.mockResolvedValue(
      unDetalle({
        id: 7,
        buqueNombre: 'ARA Libertad',
        fotos: [unaFoto({ id: 21, estado: 'error', errorDetalle: 'Fallo de inferencia' })],
      }),
    )
    dependencias.inspecciones.reintentarFoto.mockResolvedValue(unaFoto({ id: 21, estado: 'pendiente' }))
    renderizar(dependencias)
    const cola = await screen.findByRole('list', { name: 'Fotos de la inspección' })
    expect(cola).toHaveTextContent('Fallo de inferencia')

    await userEvent.click(within(cola).getByRole('button', { name: 'Reintentar análisis' }))

    expect(dependencias.inspecciones.reintentarFoto).toHaveBeenCalledWith(21, 'yolo-seg')
    expect(cola).toHaveTextContent('Pendiente')
  })

  it('deletes a photo after confirmation', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.obtener.mockResolvedValue(
      unDetalle({ id: 7, buqueNombre: 'ARA Libertad', fotos: [unaFoto({ id: 21 })] }),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderizar(dependencias)
    const cola = await screen.findByRole('list', { name: 'Fotos de la inspección' })

    await userEvent.click(within(cola).getByRole('button', { name: 'Eliminar foto' }))

    expect(dependencias.inspecciones.eliminarFoto).toHaveBeenCalledWith(21)
    expect(within(cola).queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('links to the analysis results', async () => {
    const { router } = renderizar()

    await userEvent.click(await screen.findByRole('link', { name: 'Ver resultados' }))

    expect(router.state.location.pathname).toBe('/vision/7/resultados')
  })

  it('shows the loading error and retries on demand', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.obtener
      .mockRejectedValueOnce(new Error('No encontrado.'))
      .mockResolvedValueOnce(unDetalle({ id: 7, buqueId: 4, buqueNombre: 'ARA Libertad' }))
    renderizar(dependencias)

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontrado.')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('heading', { name: 'ARA Libertad' })).toBeInTheDocument()
  })
})
