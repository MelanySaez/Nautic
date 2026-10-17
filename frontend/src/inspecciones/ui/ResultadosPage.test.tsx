import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Foto } from '../domain/inspeccion'
import { crearDependenciasFalsas, renderizarRutas, SECCION_QUILLA, unaFoto, unDetalle } from '../../test/dobles'
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
    { clase: 'corrosion', cantidad: 2, confianzaMaxima: 0.981 },
    { clase: 'marine_growth', cantidad: 1, confianzaMaxima: 0.85 },
  ],
})

function renderizar(fotos: Foto[]) {
  const falsas = crearDependenciasFalsas()
  falsas.dependencias.inspecciones.obtener.mockResolvedValue(unDetalle({ id: 7, buqueNombre: 'ARA Libertad', fotos }))
  falsas.dependencias.inspecciones.listarSecciones.mockResolvedValue([SECCION_QUILLA, SECCION_PROA])
  const router = renderizarRutas(
    [
      { path: '/inspecciones/:id/resultados', element: <ResultadosRuta /> },
      { path: '/inspecciones/:id/carga', element: <p>Carga de fotos</p> },
    ],
    falsas.dependencias,
    '/inspecciones/7/resultados',
  )
  return { ...falsas, router }
}

describe('ResultadosPage', () => {
  it('shows each analyzed photo with its severity, inference time and detections', async () => {
    renderizar([CORROIDA])

    const resultado = await screen.findByRole('article', { name: 'KEEL · Foto #21' })
    expect(resultado).toHaveTextContent('Crítica')
    expect(resultado).toHaveTextContent('1.23 s')
    const detecciones = within(resultado).getByRole('list', { name: 'Detecciones' })
    expect(within(detecciones).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/corrosion.*×2.*98%/),
      expect.stringMatching(/marine growth.*×1.*85%/),
    ])
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
    expect(router.state.location.pathname).toBe('/inspecciones/7/carga')
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
          detecciones: [{ clase: 'barnacles', cantidad: 3, confianzaMaxima: 0.72 }],
          tiempoInferenciaMs: 500,
          imagenAnotada: 'http://api.test/media/anotadas/25.jpg',
          errorDetalle: null,
        },
      }),
    )

    expect(screen.getByRole('article', { name: 'KEEL · Foto #25' })).toHaveTextContent('Media')
  })
})
