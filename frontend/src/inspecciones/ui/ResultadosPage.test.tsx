import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Foto } from '../domain/inspeccion'
import { ApiError } from '../../shared/http/apiClient'
import { crearDependenciasFalsas, renderizarRutas, SECCION_QUILLA, unaFoto, unaInspeccion, unDetalle, unModelo } from '../../test/dobles'
import { ResultadosRuta } from './ResultadosPage'

const SECCION_PROA = { id: 1, codigo: 'FWD-BTM', nombre: 'Fondo - Proa', descripcion: '', orden: 1 }

const CORROIDA = unaFoto({
  id: 21,
  estado: 'completada',
  severidad: 'critical',
  imagenOriginal: 'http://api.test/media/originales/21.jpg',
  imagenAnotada: 'http://api.test/media/anotadas/21.jpg',
  tiempoInferenciaMs: 1234,
  detecciones: [
    { clase: 'corrosion', etiqueta: 'Corrosión', tipo: 'anomalia', severidad: 'critical', cantidad: 2, confianzaMaxima: 0.981 },
    { clase: 'marine_growth', etiqueta: 'Incrustación marina', tipo: 'anomalia', severidad: 'medium', cantidad: 1, confianzaMaxima: 0.85 },
    { clase: 'ship_hull', etiqueta: 'Casco del buque', tipo: 'componente', severidad: null, cantidad: 1, confianzaMaxima: 0.9 },
  ],
  detalleDisponible: true,
})

const DETALLE_CORROIDA = {
  ancho: 640,
  alto: 480,
  instancias: [
    {
      clase: 'corrosion', etiqueta: 'Corrosión', tipo: 'anomalia' as const, severidad: 'critical' as const, color: '#f58230',
      confianza: 0.98, caja: { x1: 1, y1: 2, x2: 30, y2: 40 }, mascara: { alto: 480, ancho: 640, conteos: [307200] },
    },
    {
      clase: 'ship_hull', etiqueta: 'Casco del buque', tipo: 'componente' as const, severidad: null, color: '#aa6e28',
      confianza: 0.9, caja: { x1: 0, y1: 0, x2: 640, y2: 480 }, mascara: null,
    },
  ],
}

const SOLO_CASCO = unaFoto({
  id: 26,
  estado: 'completada',
  detecciones: [
    { clase: 'ship_hull', etiqueta: 'Casco del buque', tipo: 'componente', severidad: null, cantidad: 1, confianzaMaxima: 0.9 },
  ],
})

function renderizar(fotos: Foto[]) {
  const falsas = crearDependenciasFalsas()
  falsas.dependencias.inspecciones.obtener.mockResolvedValue(unDetalle({ id: 7, buqueNombre: 'ARA Libertad', fotos }))
  falsas.dependencias.inspecciones.listarSecciones.mockResolvedValue([SECCION_QUILLA, SECCION_PROA])
  falsas.dependencias.modelos.listar.mockResolvedValue([unModelo({ id: 'rtdetr', label: 'RT-DETR' })])
  const router = renderizarRutas(
    [
      { path: '/vision/:id/resultados', element: <ResultadosRuta /> },
      { path: '/vision/:id', element: <p>Carga de fotos</p> },
      { path: '/inspecciones/:id/reporte', element: <p>Editor del reporte</p> },
    ],
    falsas.dependencias,
    '/vision/7/resultados',
  )
  return { ...falsas, router }
}

describe('ResultadosPage', () => {
  it('renames the inspection and shows the new name as the title', async () => {
    const { dependencias } = renderizar([CORROIDA])
    dependencias.inspecciones.renombrar.mockResolvedValue(unaInspeccion({ id: 7, nombre: 'Casco proa' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Renombrar inspección' }))
    const campo = screen.getByRole('textbox', { name: 'Nombre' })
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Casco proa')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Casco proa' })).toBeInTheDocument()
    expect(dependencias.inspecciones.renombrar).toHaveBeenCalledWith(7, 'Casco proa')
    expect(screen.queryByRole('textbox', { name: 'Nombre' })).not.toBeInTheDocument()
  })

  it('shows the server message next to the name when the rename is rejected', async () => {
    const { dependencias } = renderizar([CORROIDA])
    dependencias.inspecciones.renombrar.mockRejectedValue(
      new ApiError(400, 'Datos inválidos.', { nombre: ['Debe tener 255 caracteres como máximo.'] }),
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Renombrar inspección' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveAccessibleDescription(
        'Debe tener 255 caracteres como máximo.',
      ),
    )
  })

  it('shows each analyzed photo with its severity, inference time and detections in Spanish', async () => {
    renderizar([CORROIDA])

    const resultado = await screen.findByRole('article', { name: 'KEEL · Foto #21' })
    expect(resultado).toHaveTextContent('1.23 s')
    const anomalias = within(resultado).getByRole('list', { name: 'Anomalías' })
    expect(within(anomalias).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/Corrosión.*×2.*Crítica.*98%/),
      expect.stringMatching(/Incrustación marina.*×1.*Media.*85%/),
    ])
    const componentes = within(resultado).getByRole('list', { name: 'Componentes' })
    expect(within(componentes).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/Casco del buque.*×1.*90%/),
    ])
  })

  it('draws the boxes and masks over the original image and filters them by class', async () => {
    const { dependencias } = renderizar([CORROIDA])
    dependencias.inspecciones.obtenerDetecciones.mockResolvedValue(DETALLE_CORROIDA)
    const resultado = await screen.findByRole('article', { name: 'KEEL · Foto #21' })

    await userEvent.click(within(resultado).getByRole('switch', { name: 'Mostrar contornos' }))

    expect(dependencias.inspecciones.obtenerDetecciones).toHaveBeenCalledWith(21)
    const filtro = await within(resultado).findByRole('group', { name: 'Clases visibles' })
    expect(within(resultado).getByRole('img', { name: /Imagen original/ })).toHaveAttribute(
      'src',
      'http://api.test/media/originales/21.jpg',
    )
    expect(within(resultado).getByRole('switch', { name: 'Mostrar anotada' })).toBeDisabled()
    expect(resultado).toHaveTextContent('Mostrando 2 de 2 detecciones')

    await userEvent.click(within(filtro).getByRole('checkbox', { name: /Corrosión/ }))

    expect(resultado).toHaveTextContent('Mostrando 1 de 2 detecciones')
  })

  it('keeps the overlay off when it is switched off before the detections arrive', async () => {
    const { dependencias } = renderizar([CORROIDA])
    let entregar: (detalle: typeof DETALLE_CORROIDA) => void = () => {}
    dependencias.inspecciones.obtenerDetecciones.mockReturnValue(new Promise((r) => (entregar = r)))
    const resultado = await screen.findByRole('article', { name: 'KEEL · Foto #21' })
    const interruptor = within(resultado).getByRole('switch', { name: 'Mostrar contornos' })

    await userEvent.click(interruptor)
    await userEvent.click(interruptor)
    await act(async () => entregar(DETALLE_CORROIDA))

    expect(interruptor).not.toBeChecked()
    expect(within(resultado).queryByRole('group', { name: 'Clases visibles' })).not.toBeInTheDocument()
  })

  it('reports when the boxes and masks of a photo cannot be loaded', async () => {
    const { dependencias } = renderizar([CORROIDA])
    dependencias.inspecciones.obtenerDetecciones.mockRejectedValue(new Error('La foto no tiene detecciones guardadas.'))
    const resultado = await screen.findByRole('article', { name: 'KEEL · Foto #21' })

    await userEvent.click(within(resultado).getByRole('switch', { name: 'Mostrar contornos' }))

    expect(await within(resultado).findByRole('alert')).toHaveTextContent('La foto no tiene detecciones guardadas.')
  })

  it('does not count a photo with only hull components as one with anomalies', async () => {
    renderizar([CORROIDA, SOLO_CASCO])

    const resultado = await screen.findByRole('article', { name: 'KEEL · Foto #26' })
    expect(resultado).toHaveTextContent('Sin anomalías detectadas.')
    expect(within(resultado).getByRole('list', { name: 'Componentes' })).toHaveTextContent('Casco del buque')
    expect(within(screen.getByRole('region', { name: 'Resumen' })).getByText('Con anomalías').parentElement).toHaveTextContent(
      /Con anomalías\s*1$/,
    )
  })

  it('shows the model and version that analyzed each photo', async () => {
    renderizar([{ ...CORROIDA, modelo: 'rtdetr', modeloVersion: '2.0.1' }])

    const resultado = await screen.findByRole('article', { name: 'KEEL · Foto #21' })

    // The model catalog loads independently of the inspection, so the label arrives later.
    await waitFor(() => expect(resultado).toHaveTextContent('RT-DETR v2.0.1'))
  })

  it('shows the annotated image by default and switches to the original', async () => {
    renderizar([CORROIDA])
    const resultado = await screen.findByRole('article', { name: 'KEEL · Foto #21' })
    const interruptor = within(resultado).getByRole('switch', { name: 'Mostrar anotada' })

    expect(interruptor).toBeChecked()
    expect(within(resultado).getByRole('img')).toHaveAttribute('src', 'http://api.test/media/anotadas/21.jpg')

    await userEvent.click(interruptor)

    expect(interruptor).not.toBeChecked()
    expect(within(resultado).getByRole('img')).toHaveAttribute('src', 'http://api.test/media/originales/21.jpg')
  })

  it('says when an analyzed photo has no anomalies', async () => {
    renderizar([unaFoto({ id: 22, estado: 'completada', severidad: null, detecciones: [] })])

    const resultado = await screen.findByRole('article', { name: 'KEEL · Foto #22' })
    expect(resultado).toHaveTextContent('Sin anomalías detectadas.')
    expect(within(resultado).queryByRole('switch')).not.toBeInTheDocument()
  })

  it('summarizes the inspection and points to the photos still waiting for analysis', async () => {
    const { router } = renderizar([
      CORROIDA,
      unaFoto({ id: 22, estado: 'completada', severidad: 'low' }),
      unaFoto({ id: 23, estado: 'pendiente' }),
    ])

    const resumen = await screen.findByRole('region', { name: 'Resumen' })
    expect(resumen).toHaveTextContent('Crítica')
    expect(resumen).toHaveTextContent('2 de 3')
    expect(screen.queryByRole('article', { name: 'KEEL · Foto #23' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: '1 foto sin analizar · ir a la carga' }))
    expect(router.state.location.pathname).toBe('/vision/7')
  })

  it('goes back to the photo upload to add more photos to the inspection', async () => {
    const { router } = renderizar([CORROIDA])

    await userEvent.click(await screen.findByRole('link', { name: 'Editar inspección' }))

    expect(router.state.location.pathname).toBe('/vision/7')
    expect(screen.getByText('Carga de fotos')).toBeInTheDocument()
  })

  it('renames in a modal dialog in front of the page, keeping the header visible', async () => {
    renderizar([CORROIDA])
    const titulo = await screen.findByRole('heading', { level: 1 })

    await userEvent.click(screen.getByRole('button', { name: 'Renombrar inspección' }))

    const dialogo = screen.getByRole('dialog', { name: 'Renombrar inspección' })
    expect(dialogo).toHaveAttribute('aria-modal', 'true')
    expect(within(dialogo).getByRole('textbox', { name: 'Nombre' })).toHaveValue(titulo.textContent)
    expect(within(dialogo).getByRole('textbox', { name: 'Nombre' })).toHaveFocus()
    expect(titulo).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar inspección' })).toBeInTheDocument()
  })

  it('closes the rename dialog without saving on Cancel or Escape', async () => {
    const { dependencias } = renderizar([CORROIDA])

    await userEvent.click(await screen.findByRole('button', { name: 'Renombrar inspección' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Renombrar inspección' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    expect(dependencias.inspecciones.renombrar).not.toHaveBeenCalled()
  })

  it('filters the results by hull zone', async () => {
    renderizar([CORROIDA, unaFoto({ id: 24, estado: 'completada', seccion: SECCION_PROA })])
    await screen.findByRole('article', { name: 'KEEL · Foto #21' })

    await userEvent.selectOptions(screen.getByLabelText('Zona'), String(SECCION_PROA.id))

    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['FWD-BTM · Foto #24'])
  })

  it('adds a photo as soon as the server reports its analysis finished', async () => {
    const { emitirEvento } = renderizar([unaFoto({ id: 25, estado: 'en_proceso' })])
    expect(await screen.findByText('Todavía no hay fotos analizadas.')).toBeInTheDocument()

    act(() =>
      emitirEvento({
        tipo: 'foto-actualizada',
        actualizacion: {
          fotoId: 25,
          estado: 'completada',
          severidad: 'medium',
          detecciones: [{ clase: 'barnacles', etiqueta: 'barnacles', tipo: null, severidad: null, cantidad: 3, confianzaMaxima: 0.72 }],
          tiempoInferenciaMs: 500,
          imagenAnotada: 'http://api.test/media/anotadas/25.jpg',
          errorDetalle: null,
          modelo: null,
          modeloVersion: null,
          taxonomiaVersion: null,
          detalleDisponible: false,
        },
      }),
    )

    expect(screen.getByRole('article', { name: 'KEEL · Foto #25' })).toHaveTextContent('Media')
  })

  it('links to the report editor of the inspection', async () => {
    const { router } = renderizar([CORROIDA])

    await userEvent.click(await screen.findByRole('link', { name: 'Reporte' }))

    expect(router.state.location.pathname).toBe('/inspecciones/7/reporte')
  })
})
