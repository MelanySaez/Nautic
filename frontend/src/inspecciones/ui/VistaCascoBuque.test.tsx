import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  crearDependenciasFalsas,
  renderizarRutas,
  unaDeteccion,
  unaFoto,
  unaInspeccion,
  unaPagina,
  unDetalle,
  unDetalleBuque,
} from '../../test/dobles'
import type { InspeccionDetalle, SeccionCasco } from '../domain/inspeccion'
import { BUQUE_DE_GUERRA, PATRULLERA } from '../../buques/domain/casco/arquetipo'
import { EscenaCasco } from './casco/EscenaCasco'
import type { PropsLienzoCasco } from './casco/lienzoCasco'
import { ListaInspeccionesRuta } from './ListaInspeccionesPage'

// The scene slot keeps its real output (the silhouette); the spy only records the canvas props.
vi.mock('./casco/EscenaCasco', async (importOriginal) => {
  const real = await importOriginal<typeof import('./casco/EscenaCasco')>()
  return { EscenaCasco: vi.fn(real.EscenaCasco) }
})

const RUTA = '/inspecciones/buque/1?vista=3d'

const FONDO_PROA: SeccionCasco = { id: 11, codigo: 'FWD-BTM', nombre: 'Fondo - Proa', descripcion: 'Fondo plano de proa', orden: 1 }
const FONDO_CENTRO: SeccionCasco = { id: 12, codigo: 'MID-BTM', nombre: 'Fondo - Centro', descripcion: 'Fondo plano central', orden: 2 }
const QUILLA: SeccionCasco = { id: 13, codigo: 'KEEL', nombre: 'Quilla', descripcion: '', orden: 19 }
const LASTRE: SeccionCasco = { id: 14, codigo: 'SEC-01', nombre: 'Tanque de lastre', descripcion: '', orden: 24 }
// Not in the standard order on purpose: the hull list follows the standard codes.
const SECCIONES = [QUILLA, LASTRE, FONDO_CENTRO, FONDO_PROA]

const RECIENTE = unaInspeccion({ id: 7, nombre: 'Control 2026', fechaCreacion: '2026-11-01T10:00:00Z' })
const ANTERIOR = unaInspeccion({ id: 5, nombre: 'Control 2025', fechaCreacion: '2025-11-01T10:00:00Z' })

const DETALLES: Record<number, InspeccionDetalle> = {
  7: unDetalle({
    ...RECIENTE,
    fotos: [
      unaFoto({ id: 1, seccion: FONDO_CENTRO, estado: 'completada', detecciones: [unaDeteccion({ cantidad: 2 })] }),
      unaFoto({ id: 2, seccion: FONDO_PROA, estado: 'pendiente' }),
    ],
  }),
  5: unDetalle({
    ...ANTERIOR,
    fotos: [
      unaFoto({
        id: 3,
        seccion: QUILLA,
        estado: 'completada',
        detecciones: [unaDeteccion({ clase: 'paint_peel', etiqueta: 'Descascaramiento', severidad: 'low' })],
      }),
    ],
  }),
}

function preparar() {
  const falsas = crearDependenciasFalsas()
  const { buques, inspecciones } = falsas.dependencias
  buques.obtener.mockResolvedValue(
    unDetalleBuque({ id: 1, nombre: 'ARA Libertad', esloraTotalM: 110, secciones: SECCIONES }),
  )
  inspecciones.buscar.mockResolvedValue(unaPagina([RECIENTE, ANTERIOR]))
  inspecciones.obtener.mockImplementation(async (id: number) => DETALLES[id])
  return falsas
}

function renderizar(dependencias = preparar().dependencias, ruta = RUTA) {
  const router = renderizarRutas(
    [
      { path: '/inspecciones/buque/:id', element: <ListaInspeccionesRuta /> },
      { path: '/inspecciones/:id/resultados', element: <p>Resultados</p> },
      { path: '/vision', element: <p>Nueva inspección</p> },
      { path: '/vision/:id', element: <p>Carga de fotos</p> },
    ],
    dependencias,
    ruta,
  )
  return { router, dependencias }
}

/** The section list is folded under the hull: open it first. */
async function zonasDelCasco() {
  const plegable = await screen.findByRole('group', { name: /^Lista de secciones/ })
  if (!plegable.hasAttribute('open')) await userEvent.click(within(plegable).getByText(/^Lista de secciones/))
  return screen.findByRole('group', { name: 'Zonas del casco' })
}

async function zona(codigo: string) {
  return within(await zonasDelCasco()).getByRole('button', { name: new RegExp(`^${codigo} · `) })
}

function panel() {
  return screen.getByRole('region', { name: 'Zona seleccionada' })
}

/** The panel counts as `{term: value}`. */
function conteos(contenedor: HTMLElement) {
  const terminos = within(contenedor).getAllByRole('term').map((t) => t.textContent)
  const valores = within(contenedor).getAllByRole('definition').map((d) => d.textContent)
  return Object.fromEntries(terminos.map((termino, i) => [termino, valores[i]]))
}

function propsDelLienzo(): PropsLienzoCasco {
  const props = vi.mocked(EscenaCasco).mock.lastCall?.[0]
  if (!props) throw new Error('The scene slot was not rendered.')
  return props
}

beforeEach(() => {
  vi.mocked(EscenaCasco).mockClear()
})

describe('VistaCascoBuque', () => {
  it('draws the hull silhouette of the vessel and the legend of every state', async () => {
    renderizar()

    expect(await screen.findByRole('img', { name: 'Silueta del casco de ARA Libertad' })).toBeInTheDocument()
    const leyenda = screen.getByRole('list', { name: 'Leyenda de estados' })
    expect(within(leyenda).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Crítica',
      'Alta',
      'Media',
      'Baja',
      'Hallazgo sin clasificar',
      'Sin hallazgos',
      'Sin analizar',
      'Sin fotos',
    ])
  })
})

describe('VistaCascoBuque layout', () => {
  it('puts the hull first, with the section list folded under it and no side list', async () => {
    renderizar()

    const plegable = await screen.findByRole('group', { name: 'Lista de secciones (4)' })
    expect(plegable).not.toHaveAttribute('open')
    expect(screen.queryByRole('heading', { name: 'Secciones del casco' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Zona seleccionada' })).toHaveTextContent(
      'Pasa el cursor por el casco y haz clic en una sección, o elígela en la «Lista de secciones».',
    )
  })

  it('hands the section name of every placed zone to the scene, for the hover label', async () => {
    renderizar()
    await waitFor(() => expect(propsDelLienzo().nombresZona.size).toBe(3))

    expect(propsDelLienzo().nombresZona).toEqual(
      new Map([
        ['FWD-BTM', 'Fondo - Proa'],
        ['MID-BTM', 'Fondo - Centro'],
        ['KEEL', 'Quilla'],
      ]),
    )
  })
})

describe('VistaCascoBuque colours', () => {
  it('colours the zones with the most recent inspection and names it', async () => {
    const { dependencias } = renderizar()

    expect(await zona('MID-BTM')).toHaveTextContent('Crítica')
    expect(screen.getByText(/Colores según la última inspección:/)).toHaveTextContent('Control 2026')
    expect(dependencias.inspecciones.buscar).toHaveBeenCalledWith({ buqueId: 1 })
    expect(dependencias.inspecciones.obtener).toHaveBeenCalledWith(7)
    expect(dependencias.inspecciones.obtener).not.toHaveBeenCalledWith(5)
  })

  it('updates the zone states live while photos are analyzed', async () => {
    const falsas = preparar()
    renderizar(falsas.dependencias)
    expect(await zona('FWD-BTM')).toHaveTextContent('Sin analizar')

    act(() =>
      falsas.emitirEvento({
        tipo: 'foto-actualizada',
        actualizacion: {
          fotoId: 2,
          estado: 'completada',
          severidad: 'high',
          detecciones: [unaDeteccion({ clase: 'pitting', etiqueta: 'Picaduras', severidad: 'high' })],
          tiempoInferenciaMs: 120,
          imagenAnotada: null,
          errorDetalle: null,
          modelo: 'yolo-seg',
          modeloVersion: null,
          taxonomiaVersion: null,
          detalleDisponible: false,
        },
      }),
    )

    expect(await zona('FWD-BTM')).toHaveTextContent('Alta')
  })

  it('shows every zone without photos when the vessel has no inspections', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.buscar.mockResolvedValue(unaPagina())
    renderizar(dependencias)

    expect(await screen.findByText('Este buque aún no tiene inspecciones.')).toBeInTheDocument()
    for (const boton of within(await zonasDelCasco()).getAllByRole('button')) expect(boton).toHaveTextContent('Sin fotos')
    expect(dependencias.inspecciones.obtener).not.toHaveBeenCalled()
  })
})

describe('VistaCascoBuque zones', () => {
  it('lists the placed sections in the standard order with their state and photo count', async () => {
    renderizar()

    const grupo = await zonasDelCasco()
    await waitFor(() => expect(within(grupo).getByRole('button', { name: /^MID-BTM · / })).toHaveTextContent('Crítica'))
    expect(within(grupo).getAllByRole('button').map((b) => b.textContent?.split(' · ')[0])).toEqual([
      'FWD-BTM',
      'MID-BTM',
      'KEEL',
    ])
    expect(await zona('MID-BTM')).toHaveTextContent('Fondo - Centro')
    expect(await zona('MID-BTM')).toHaveTextContent('1 foto')
    expect(await zona('FWD-BTM')).toHaveTextContent('Sin analizar')
    expect(await zona('KEEL')).toHaveTextContent('Sin fotos')
  })

  it('lists a custom section apart, as not placed on the hull', async () => {
    renderizar()
    await zonasDelCasco()

    const aparte = screen.getByRole('group', { name: 'Secciones sin ubicación en el casco' })
    expect(within(aparte).getAllByRole('button')).toHaveLength(1)
    expect(within(aparte).getByRole('button', { name: /^SEC-01 · Tanque de lastre/ })).toHaveTextContent('Sin fotos')
  })

  it('opens the two-option menu of the selected zone; selecting it again closes it', async () => {
    const { router } = renderizar()
    await zonasDelCasco()
    expect(panel()).toHaveTextContent('Pasa el cursor por el casco y haz clic en una sección, o elígela en la «Lista de secciones».')

    await userEvent.click(await zona('MID-BTM'))

    expect(router.state.location.search).toBe('?vista=3d&zona=12')
    expect(await zona('MID-BTM')).toHaveAttribute('aria-pressed', 'true')
    expect(within(panel()).getByRole('heading', { name: 'Fondo - Centro' })).toBeInTheDocument()
    expect(panel()).toHaveTextContent('MID-BTM')
    expect(panel()).toHaveTextContent('Crítica')
    expect(conteos(panel())).toEqual({ Fotos: '1', Analizadas: '1', Hallazgos: '2' })
    const acciones = within(panel()).getByRole('group', { name: 'Acciones de la zona' })
    expect(within(acciones).getAllByRole('link').concat(within(acciones).getAllByRole('button')).map((e) => e.textContent)).toEqual([
      'Nueva inspección en esta sección',
      'Ver inspecciones de esta sección',
    ])
    expect(within(acciones).getByRole('link', { name: 'Nueva inspección en esta sección' })).toHaveAttribute(
      'href',
      '/vision?buque=1&zona=12',
    )

    await userEvent.click(await zona('MID-BTM'))

    expect(router.state.location.search).toBe('?vista=3d')
    expect(panel()).toHaveTextContent('Pasa el cursor por el casco y haz clic en una sección, o elígela en la «Lista de secciones».')
  })

  it('goes to the new inspection form with the vessel and the zone preselected', async () => {
    const { router } = renderizar(preparar().dependencias, `${RUTA}&zona=12`)
    await zonasDelCasco()

    await userEvent.click(within(panel()).getByRole('link', { name: 'Nueva inspección en esta sección' }))

    expect(router.state.location.pathname).toBe('/vision')
    expect(router.state.location.search).toBe('?buque=1&zona=12')
  })

  it('shows the list filtered by the zone and lets the filter go', async () => {
    const { router, dependencias } = renderizar(preparar().dependencias, `${RUTA}&zona=12`)
    await zonasDelCasco()

    await userEvent.click(within(panel()).getByRole('button', { name: 'Ver inspecciones de esta sección' }))

    expect(router.state.location.search).toBe('?seccion=12')
    await waitFor(() => expect(dependencias.inspecciones.buscar).toHaveBeenLastCalledWith({ buqueId: 1, seccionId: 12 }))
    expect(await screen.findByLabelText('Buscar por nombre')).toBeInTheDocument()
    expect(screen.getByText('Sección: MID-BTM · Fondo - Centro')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtro de sección' }))

    expect(router.state.location.search).toBe('')
    await waitFor(() => expect(dependencias.inspecciones.buscar).toHaveBeenLastCalledWith({ buqueId: 1 }))
    expect(screen.queryByText(/^Sección:/)).not.toBeInTheDocument()
  })

  it('selects a section that is not placed on the hull the same way', async () => {
    const { router } = renderizar()
    await zonasDelCasco()

    await userEvent.click(screen.getByRole('button', { name: /^SEC-01 · / }))

    expect(router.state.location.search).toBe('?vista=3d&zona=14')
    expect(within(panel()).getByRole('heading', { name: 'Tanque de lastre' })).toBeInTheDocument()
    expect(conteos(panel())).toEqual({ Fotos: '0', Analizadas: '0', Hallazgos: '0' })
  })
})

describe('VistaCascoBuque canvas slot', () => {
  it('hands the zone states, photo counts and selection to the hull scene', async () => {
    renderizar()
    await waitFor(() => expect(propsDelLienzo().estados.get('MID-BTM')).toBe('critical'))

    const props = propsDelLienzo()
    expect(props.nombreBuque).toBe('ARA Libertad')
    expect(props.dimensiones.eslora).toBe(110)
    expect(props.cargando).toBe(false)
    expect(props.estados).toEqual(
      new Map([
        ['FWD-BTM', 'sin-analizar'],
        ['MID-BTM', 'critical'],
        ['KEEL', 'sin-fotos'],
      ]),
    )
    expect(props.fotosPorZona).toEqual(
      new Map([
        ['FWD-BTM', 1],
        ['MID-BTM', 1],
        ['KEEL', 0],
      ]),
    )
    expect(props.seleccionada).toBeNull()
  })

  it("shapes the hull with the archetype of the vessel's type, or the generic warship", async () => {
    const { dependencias } = preparar()
    dependencias.buques.obtener.mockResolvedValue(
      unDetalleBuque({ id: 1, nombre: 'ARA Libertad', tipo: 'Patrullera', secciones: SECCIONES }),
    )
    renderizar(dependencias)
    await waitFor(() => expect(propsDelLienzo().arquetipo).toBe(PATRULLERA))

    dependencias.buques.obtener.mockResolvedValue(
      unDetalleBuque({ id: 2, nombre: 'Viejo', tipo: 'Remolcador', secciones: SECCIONES }),
    )
    vi.mocked(EscenaCasco).mockClear()
    renderizar(dependencias, '/inspecciones/buque/2?vista=3d')
    await waitFor(() => expect(propsDelLienzo().arquetipo).toBe(BUQUE_DE_GUERRA))
  })

  it('selects the section placed on a zone picked in the scene', async () => {
    const { router } = renderizar()
    await waitFor(() => expect(propsDelLienzo().estados.get('MID-BTM')).toBe('critical'))

    await act(async () => propsDelLienzo().onSeleccionar('KEEL'))

    expect(router.state.location.search).toBe('?vista=3d&zona=13')
    expect(propsDelLienzo().seleccionada).toBe('KEEL')
    expect(await zona('KEEL')).toHaveAttribute('aria-pressed', 'true')

    await act(async () => propsDelLienzo().onSeleccionar(null))

    expect(router.state.location.search).toBe('?vista=3d')
    expect(propsDelLienzo().seleccionada).toBeNull()
  })
})
