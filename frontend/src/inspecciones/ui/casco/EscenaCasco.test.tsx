import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { use } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUQUE_DE_GUERRA } from '../../../buques/domain/casco/arquetipo'
import { dimensionesCasco } from '../../../buques/domain/casco/dimensiones'
import type { CodigoZona } from '../../../buques/domain/casco/zonas'
import type { EstadoZona } from '../../domain/resumenZonas'
import { EscenaCasco } from './EscenaCasco'
import LienzoCasco from './LienzoCasco.tsx'
import type { PropsLienzoCasco } from './lienzoCasco'

/** Controls the canvas double: it waits for `lista` (a canvas still loading) and may throw `fallo`. */
const lienzo = vi.hoisted(() => ({ lista: Promise.resolve() as Promise<unknown>, fallo: null as Error | null }))

// jsdom has no WebGL: the lazy canvas is replaced by a double that records its props.
vi.mock('./LienzoCasco.tsx', () => ({
  default: vi.fn(function LienzoDoble(props: PropsLienzoCasco) {
    use(lienzo.lista)
    if (lienzo.fallo) throw lienzo.fallo
    return (
      <div data-testid="lienzo-3d">
        <button type="button" onClick={() => props.onSeleccionar('KEEL')}>
          Elegir quilla
        </button>
      </div>
    )
  }),
}))

const SILUETA = { name: 'Silueta del casco de ARA Libertad' }

function unasProps(cambios: Partial<PropsLienzoCasco> = {}): PropsLienzoCasco {
  return {
    nombreBuque: 'ARA Libertad',
    dimensiones: dimensionesCasco({ esloraTotalM: 110 }, BUQUE_DE_GUERRA),
    arquetipo: BUQUE_DE_GUERRA,
    estados: new Map<CodigoZona, EstadoZona>([
      ['KEEL', 'critical'],
      ['MID-BTM', 'sin-fotos'],
    ]),
    fotosPorZona: new Map<CodigoZona, number>([
      ['KEEL', 3],
      ['MID-BTM', 0],
    ]),
    cargando: false,
    seleccionada: 'MID-BTM',
    onSeleccionar: vi.fn(),
    ...cambios,
  }
}

/** Mounts the scene and lets the lazy canvas settle, as a browser would before the user looks. */
async function montar(props: PropsLienzoCasco) {
  await act(async () => {
    render(<EscenaCasco {...props} />)
  })
}

/** Makes the browser report WebGL support, as a real one does. */
function conWebgl() {
  vi.stubGlobal('WebGL2RenderingContext', class {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({}) as WebGL2RenderingContext)
}

beforeEach(() => {
  lienzo.lista = Promise.resolve()
  lienzo.fallo = null
  vi.mocked(LienzoCasco).mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EscenaCasco', () => {
  it('keeps the hull silhouette when the browser has no WebGL', async () => {
    await montar(unasProps())

    expect(screen.getByRole('img', SILUETA)).toBeInTheDocument()
    expect(LienzoCasco).not.toHaveBeenCalled()
    expect(screen.queryByTestId('lienzo-3d')).not.toBeInTheDocument()
  })

  it('shows the silhouette while the 3D canvas loads, then the canvas in its place', async () => {
    conWebgl()
    let terminarCarga = () => {}
    lienzo.lista = new Promise<void>((resolver) => {
      terminarCarga = resolver
    })
    await montar(unasProps())

    expect(screen.getByRole('img', SILUETA)).toBeInTheDocument()
    expect(screen.queryByTestId('lienzo-3d')).not.toBeInTheDocument()

    await act(async () => terminarCarga())

    expect(screen.getByTestId('lienzo-3d')).toBeInTheDocument()
    expect(screen.queryByRole('img', SILUETA)).not.toBeInTheDocument()
  })

  it('hands the zone states, photo counts and selection to the canvas', async () => {
    conWebgl()
    const props = unasProps({ cargando: true })
    await montar(props)
    expect(screen.getByTestId('lienzo-3d')).toBeInTheDocument()

    const recibidas = vi.mocked(LienzoCasco).mock.lastCall?.[0]
    expect(recibidas?.nombreBuque).toBe('ARA Libertad')
    expect(recibidas?.dimensiones).toBe(props.dimensiones)
    expect(recibidas?.arquetipo).toBe(BUQUE_DE_GUERRA)
    expect(recibidas?.estados).toBe(props.estados)
    expect(recibidas?.fotosPorZona).toBe(props.fotosPorZona)
    expect(recibidas?.cargando).toBe(true)
    expect(recibidas?.seleccionada).toBe('MID-BTM')
  })

  it('passes a zone picked on the canvas to the page callback', async () => {
    conWebgl()
    const onSeleccionar = vi.fn()
    await montar(unasProps({ onSeleccionar }))

    await userEvent.click(screen.getByRole('button', { name: 'Elegir quilla' }))

    expect(onSeleccionar).toHaveBeenCalledWith('KEEL')
  })

  it('falls back to the silhouette when the canvas fails', async () => {
    conWebgl()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    lienzo.fallo = new Error('Error creating WebGL context.')
    await montar(unasProps())

    expect(LienzoCasco).toHaveBeenCalled()
    expect(screen.getByRole('img', SILUETA)).toBeInTheDocument()
    expect(screen.queryByTestId('lienzo-3d')).not.toBeInTheDocument()
  })
})
