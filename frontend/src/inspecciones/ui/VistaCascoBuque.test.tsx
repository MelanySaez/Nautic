import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  crearDependenciasFalsas,
  renderizarRutas,
  unaDeteccion,
  unaFoto,
  unaInspeccion,
  unaPagina,
  unDetalleBuque,
} from '../../test/dobles'
import type { SeccionCasco, ZonaReciente } from '../domain/inspeccion'
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
const FONDO_POPA: SeccionCasco = { id: 14, codigo: 'AFT-BTM', nombre: 'Fondo - Popa', descripcion: '', orden: 3 }
const QUILLA: SeccionCasco = { id: 13, codigo: 'KEEL', nombre: 'Quilla', descripcion: '', orden: 19 }
// Not in the standard order on purpose: the hull list follows the standard codes.
// Only standard zone codes: a single custom section turns the 3D view off (`admiteVista3d`).
const SECCIONES = [QUILLA, FONDO_CENTRO, FONDO_POPA, FONDO_PROA]

const RECIENTE = unaInspeccion({ id: 7, nombre: 'Control 2026', fechaCreacion: '2026-11-01T10:00:00Z' })
const ANTERIOR = unaInspeccion({ id: 5, nombre: 'Control 2025', fechaCreacion: '2025-11-01T10:00:00Z' })

const ref = ({ id, nombre, fechaCreacion }: typeof RECIENTE) => ({ id, nombre, fechaCreacion })

// Each zone comes from its own latest inspection: the keel was last photographed in 2025, and
// nobody ever photographed the aft bottom.
const ZONAS: ZonaReciente[] = [
  {
    seccionId: FONDO_PROA.id,
    inspeccion: ref(RECIENTE),
    fotos: [unaFoto({ id: 2, seccion: FONDO_PROA, estado: 'pendiente' })],
  },
  {
    seccionId: FONDO_CENTRO.id,
    inspeccion: ref(RECIENTE),
    fotos: [unaFoto({ id: 1, seccion: FONDO_CENTRO, estado: 'completada', detecciones: [unaDeteccion({ cantidad: 2 })] })],
  },
  {
    seccionId: QUILLA.id,
    inspeccion: ref(ANTERIOR),
    fotos: [
      unaFoto({
        id: 3,
        seccion: QUILLA,
        estado: 'completada',
        detecciones: [unaDeteccion({ clase: 'paint_peel', etiqueta: 'Descascaramiento', severidad: 'low' })],
      }),
    ],
  },
]

function preparar() {
  const falsas = crearDependenciasFalsas()
  const { buques, inspecciones } = falsas.dependencias
  buques.obtener.mockResolvedValue(
    unDetalleBuque({ id: 1, nombre: 'ARA Libertad', esloraTotalM: 110, secciones: SECCIONES }),
  )
  inspecciones.buscar.mockResolvedValue(unaPagina([RECIENTE, ANTERIOR]))
  inspecciones.zonasRecientes.mockResolvedValue(ZONAS)
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
    await waitFor(() => expect(propsDelLienzo().nombresZona.size).toBe(4))

    expect(propsDelLienzo().nombresZona).toEqual(
      new Map([
        ['FWD-BTM', 'Fondo - Proa'],
        ['MID-BTM', 'Fondo - Centro'],
        ['AFT-BTM', 'Fondo - Popa'],
        ['KEEL', 'Quilla'],
      ]),
    )
  })

  it('hands the scene the inspection each photographed zone takes its colour from', async () => {
    renderizar()
    await waitFor(() => expect(propsDelLienzo().inspeccionesZona.size).toBe(3))

    expect(propsDelLienzo().inspeccionesZona).toEqual(
      new Map([
        ['FWD-BTM', 'Control 2026'],
        ['MID-BTM', 'Control 2026'],
        ['KEEL', 'Control 2025'],
      ]),
    )
  })
})

describe('VistaCascoBuque colours', () => {
  it('colours every zone with its own most recent inspection and explains it', async () => {
    const { dependencias } = renderizar()

    expect(await zona('MID-BTM')).toHaveTextContent('Crítica')
    // The 2026 inspection did not photograph the keel: the 2025 one still colours it.
    expect(await zona('KEEL')).toHaveTextContent('Baja')
    expect(await zona('AFT-BTM')).toHaveTextContent('Sin fotos')
    expect(screen.getByText('Cada zona muestra su inspección más reciente con fotos de esa sección.')).toBeInTheDocument()
    expect(screen.queryByText(/Colores según la última inspección/)).not.toBeInTheDocument()
    expect(dependencias.inspecciones.zonasRecientes).toHaveBeenCalledWith(1)
    expect(dependencias.inspecciones.obtener).not.toHaveBeenCalled()
  })

  it('reloads the zones when a photo of the latest inspection changes', async () => {
    const falsas = preparar()
    const { zonasRecientes } = falsas.dependencias.inspecciones
    renderizar(falsas.dependencias)
    expect(await zona('FWD-BTM')).toHaveTextContent('Sin analizar')
    expect(falsas.dependencias.eventos.suscribir).toHaveBeenCalledWith(7, expect.any(Function))
    expect(zonasRecientes).toHaveBeenCalledTimes(1)

    const analizada = unaFoto({
      id: 2,
      seccion: FONDO_PROA,
      estado: 'completada',
      detecciones: [unaDeteccion({ clase: 'pitting', etiqueta: 'Picaduras', severidad: 'high' })],
    })
    // The reload is held open to check that the previous zones stay on screen meanwhile.
    let responder: (zonas: typeof ZONAS) => void = () => {}
    zonasRecientes.mockReturnValue(new Promise((resolver) => (responder = resolver)))
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

    await waitFor(() => expect(zonasRecientes).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Cargando zonas…')).not.toBeInTheDocument()
    expect(await zona('FWD-BTM')).toHaveTextContent('Sin analizar')

    act(() => responder([{ ...ZONAS[0], fotos: [analizada] }, ...ZONAS.slice(1)]))
    await waitFor(async () => expect(await zona('FWD-BTM')).toHaveTextContent('Alta'))
    expect(zonasRecientes).toHaveBeenLastCalledWith(1)
  })

  it('shows every zone without photos when the vessel has no inspections', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.buscar.mockResolvedValue(unaPagina())
    dependencias.inspecciones.zonasRecientes.mockResolvedValue([])
    renderizar(dependencias)

    expect(await screen.findByText('Este buque aún no tiene inspecciones.')).toBeInTheDocument()
    for (const boton of within(await zonasDelCasco()).getAllByRole('button')) expect(boton).toHaveTextContent('Sin fotos')
    expect(dependencias.eventos.suscribir).not.toHaveBeenCalled()
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
      'AFT-BTM',
      'KEEL',
    ])
    expect(await zona('MID-BTM')).toHaveTextContent('Fondo - Centro')
    expect(await zona('MID-BTM')).toHaveTextContent('1 foto')
    expect(await zona('FWD-BTM')).toHaveTextContent('Sin analizar')
    expect(await zona('KEEL')).toHaveTextContent('Baja')
    expect(await zona('AFT-BTM')).toHaveTextContent('Sin fotos')
    expect(await zona('AFT-BTM')).toHaveTextContent('0 fotos')
  })

  it('opens the menu of the selected zone; selecting it again closes it', async () => {
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
      'Abrir inspección',
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

  it("names the inspection the selected zone's colour comes from and opens that one", async () => {
    const { router } = renderizar(preparar().dependencias, `${RUTA}&zona=13`)
    await zonasDelCasco()

    expect(panel()).toHaveTextContent('Según la inspección Control 2025')
    expect(panel()).toHaveTextContent('Baja')
    await userEvent.click(within(panel()).getByRole('link', { name: 'Abrir inspección' }))

    expect(router.state.location.pathname).toBe('/inspecciones/5/resultados')
  })

  it('offers no inspection to open for a zone nobody photographed', async () => {
    renderizar(preparar().dependencias, `${RUTA}&zona=14`)
    await zonasDelCasco()

    expect(panel()).toHaveTextContent('Ninguna inspección tiene fotos de esta sección.')
    expect(within(panel()).queryByRole('link', { name: 'Abrir inspección' })).not.toBeInTheDocument()
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
        ['AFT-BTM', 'sin-fotos'],
        ['KEEL', 'low'],
      ]),
    )
    expect(props.fotosPorZona).toEqual(
      new Map([
        ['FWD-BTM', 1],
        ['MID-BTM', 1],
        ['AFT-BTM', 0],
        ['KEEL', 1],
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

    // A fresh tree: the first one must not render into the spy any more.
    cleanup()
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
