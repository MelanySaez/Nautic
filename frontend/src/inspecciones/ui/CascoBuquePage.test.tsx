import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rutas } from '../../app/router'
import {
  crearDependenciasFalsas,
  renderizarRutas,
  SOLO_LECTURA,
  unaDeteccion,
  unaFoto,
  unaInspeccion,
  unaPagina,
  unDetalle,
  unDetalleBuque,
} from '../../test/dobles'
import type { InspeccionDetalle, SeccionCasco } from '../domain/inspeccion'
import { EscenaCasco } from './casco/EscenaCasco'
import type { PropsLienzoCasco } from './casco/lienzoCasco'
import { CascoBuqueRuta } from './CascoBuquePage'

// The scene slot keeps its real output (the silhouette); the spy only records the canvas props.
vi.mock('./casco/EscenaCasco', async (importOriginal) => {
  const real = await importOriginal<typeof import('./casco/EscenaCasco')>()
  return { EscenaCasco: vi.fn(real.EscenaCasco) }
})

const RUTA = '/inspecciones/buque/1/casco'

const FONDO_PROA: SeccionCasco = { id: 11, codigo: 'FWD-BTM', nombre: 'Fondo - Proa', descripcion: 'Fondo plano de proa', orden: 1 }
const FONDO_CENTRO: SeccionCasco = { id: 12, codigo: 'MID-BTM', nombre: 'Fondo - Centro', descripcion: 'Fondo plano central', orden: 2 }
const QUILLA: SeccionCasco = { id: 13, codigo: 'KEEL', nombre: 'Quilla', descripcion: '', orden: 19 }
const LASTRE: SeccionCasco = { id: 14, codigo: 'SEC-01', nombre: 'Tanque de lastre', descripcion: '', orden: 24 }
// Not in the standard order on purpose: the hull list follows the standard codes.
const SECCIONES = [QUILLA, LASTRE, FONDO_CENTRO, FONDO_PROA]

const RECIENTE = unaInspeccion({ id: 7, nombre: 'Control 2026', fechaCreacion: '2026-11-01T10:00:00Z' })
const ANTERIOR = unaInspeccion({ id: 5, nombre: 'Control 2025', fechaCreacion: '2025-11-01T10:00:00Z' })
const ANTIGUA = unaInspeccion({ id: 3, nombre: 'Control 2024', fechaCreacion: '2024-11-01T10:00:00Z' })

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
  3: unDetalle({ ...ANTIGUA }),
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
      { path: '/inspecciones/buque/:id', element: <p>Inspecciones del buque</p> },
      { path: '/inspecciones/buque/:id/casco', element: <CascoBuqueRuta /> },
      { path: '/inspecciones/:id/resultados', element: <p>Resultados</p> },
      { path: '/vision', element: <p>Nueva inspección</p> },
      { path: '/vision/:id', element: <p>Carga de fotos</p> },
    ],
    dependencias,
    ruta,
  )
  return { router, dependencias }
}

async function zonasDelCasco() {
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

describe('CascoBuquePage', () => {
  it('shows the vessel name under the "Vista 3D" label', async () => {
    renderizar()

    expect(await screen.findByRole('heading', { level: 1, name: 'ARA Libertad' })).toBeInTheDocument()
    expect(screen.getByText('Vista 3D')).toBeInTheDocument()
  })

  it('is mounted at /inspecciones/buque/:id/casco', async () => {
    renderizarRutas(rutas, preparar().dependencias, RUTA)

    expect(await screen.findByRole('heading', { level: 1, name: 'ARA Libertad' })).toBeInTheDocument()
    expect(await zonasDelCasco()).toBeInTheDocument()
  })

  it('shows the name passed along right away and goes back to the list it came from', async () => {
    const { dependencias } = preparar()
    dependencias.buques.obtener.mockReturnValue(new Promise(() => {}))
    const { router } = renderizar(dependencias, '/inspecciones/buque/1')

    await router.navigate(RUTA, { state: { buqueNombre: 'ARA Libertad', volverA: '/inspecciones/buque/1?q=casco' } })

    expect(await screen.findByRole('heading', { level: 1, name: 'ARA Libertad' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Volver a las inspecciones del buque' }))
    expect(router.state.location.pathname).toBe('/inspecciones/buque/1')
    expect(router.state.location.search).toBe('?q=casco')
  })

  it('goes back to the vessel inspections when it was opened directly', async () => {
    renderizar()

    expect(await screen.findByRole('link', { name: 'Volver a las inspecciones del buque' })).toHaveAttribute(
      'href',
      '/inspecciones/buque/1',
    )
  })

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

describe('CascoBuquePage inspection selector', () => {
  it('shows the most recent inspection by default without writing it in the URL', async () => {
    const { router, dependencias } = renderizar()

    const selector = await screen.findByRole('combobox', { name: 'Inspección' })
    expect(selector).toHaveValue('7')
    expect(within(selector).getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringMatching(/^Control 2026 · /),
      expect.stringMatching(/^Control 2025 · /),
    ])
    expect(await zona('MID-BTM')).toHaveTextContent('Crítica')
    expect(dependencias.inspecciones.buscar).toHaveBeenCalledWith({ buqueId: 1 })
    expect(dependencias.inspecciones.obtener).toHaveBeenCalledWith(7)
    expect(router.state.location.search).toBe('')
  })

  it('appends the next page of inspections with "Cargar más"', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.buscar
      .mockResolvedValueOnce(unaPagina([RECIENTE], { siguiente: 'c1', hayMas: true }))
      .mockResolvedValueOnce(unaPagina([ANTERIOR]))
    renderizar(dependencias)
    const selector = await screen.findByRole('combobox', { name: 'Inspección' })
    expect(within(selector).getAllByRole('option')).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }))

    await waitFor(() => expect(within(selector).getAllByRole('option')).toHaveLength(2))
    expect(dependencias.inspecciones.buscar).toHaveBeenLastCalledWith({ buqueId: 1 }, 'c1')
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument()
    expect(selector).toHaveValue('7')
  })

  it('writes the chosen inspection in the URL and shows its data', async () => {
    const { router, dependencias } = renderizar()
    expect(await zona('MID-BTM')).toHaveTextContent('Crítica')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Inspección' }), '5')

    expect(router.state.location.search).toBe('?inspeccion=5')
    expect(router.state.historyAction).toBe('REPLACE')
    expect(dependencias.inspecciones.obtener).toHaveBeenLastCalledWith(5)
    await waitFor(async () => expect(await zona('KEEL')).toHaveTextContent('Baja'))
    expect(await zona('MID-BTM')).toHaveTextContent('Sin fotos')
    expect(screen.getByRole('combobox', { name: 'Inspección' })).toHaveValue('5')
  })

  it('keeps showing an inspection of the URL that is not in the loaded pages', async () => {
    const { dependencias } = preparar()
    renderizar(dependencias, `${RUTA}?inspeccion=3`)

    const selector = await screen.findByRole('combobox', { name: 'Inspección' })
    await waitFor(() =>
      expect(within(selector).getByRole('option', { selected: true })).toHaveTextContent(/^Control 2024 · /),
    )
    expect(selector).toHaveValue('3')
    expect(dependencias.inspecciones.obtener).toHaveBeenCalledWith(3)
    expect(dependencias.inspecciones.obtener).not.toHaveBeenCalledWith(7)
  })

  it('refuses an inspection of another vessel', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.obtener.mockResolvedValue(unDetalle({ id: 9, buqueId: 2, buqueNombre: 'ARA Brown' }))
    renderizar(dependencias, `${RUTA}?inspeccion=9`)

    expect(await screen.findByRole('alert')).toHaveTextContent('La inspección elegida no es de este buque.')
    expect(screen.queryByRole('group', { name: 'Zonas del casco' })).not.toBeInTheDocument()
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
})

describe('CascoBuquePage zones', () => {
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

  it('selects a zone in the URL and shows its counts and actions; selecting it again clears it', async () => {
    const { router } = renderizar()
    await zonasDelCasco()
    expect(panel()).toHaveTextContent('Selecciona una zona del casco o de la lista para ver su estado.')

    await userEvent.click(await zona('MID-BTM'))

    expect(router.state.location.search).toBe('?zona=12')
    expect(await zona('MID-BTM')).toHaveAttribute('aria-pressed', 'true')
    expect(within(panel()).getByRole('heading', { name: 'Fondo - Centro' })).toBeInTheDocument()
    expect(panel()).toHaveTextContent('MID-BTM')
    expect(panel()).toHaveTextContent('Fondo plano central')
    expect(panel()).toHaveTextContent('Crítica')
    expect(conteos(panel())).toEqual({ Fotos: '1', Analizadas: '1', Hallazgos: '2' })
    expect(within(panel()).getByRole('link', { name: 'Consultar' })).toHaveAttribute(
      'href',
      '/inspecciones/7/resultados?zona=12',
    )
    expect(within(panel()).getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/vision/7?zona=12')
    expect(within(panel()).getByRole('link', { name: 'Nueva inspección' })).toHaveAttribute(
      'href',
      '/vision?buque=1&zona=12',
    )

    await userEvent.click(await zona('MID-BTM'))

    expect(router.state.location.search).toBe('')
    expect(await zona('MID-BTM')).toHaveAttribute('aria-pressed', 'false')
    expect(panel()).toHaveTextContent('Selecciona una zona del casco o de la lista para ver su estado.')
  })

  it('selects a section that is not placed on the hull the same way', async () => {
    const { router } = renderizar()
    await zonasDelCasco()

    await userEvent.click(screen.getByRole('button', { name: /^SEC-01 · / }))

    expect(router.state.location.search).toBe('?zona=14')
    expect(within(panel()).getByRole('heading', { name: 'Tanque de lastre' })).toBeInTheDocument()
    expect(conteos(panel())).toEqual({ Fotos: '0', Analizadas: '0', Hallazgos: '0' })
  })

  it('disables "Editar" when the user may not upload photos', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.obtener.mockResolvedValue({ ...DETALLES[7], misPermisos: SOLO_LECTURA })
    renderizar(dependencias, `${RUTA}?zona=12`)

    await zonasDelCasco()
    const editar = within(panel()).getByRole('button', { name: 'Editar' })
    expect(editar).toBeDisabled()
    expect(editar).toHaveAccessibleDescription('No tienes permiso para subir fotos en esta inspección.')
    expect(within(panel()).queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(within(panel()).getByRole('link', { name: 'Consultar' })).toBeInTheDocument()
    expect(within(panel()).getByRole('link', { name: 'Nueva inspección' })).toBeInTheDocument()
  })

  it('shows every zone without photos and only "Nueva inspección" when the vessel has no inspections', async () => {
    const { dependencias } = preparar()
    dependencias.inspecciones.buscar.mockResolvedValue(unaPagina())
    renderizar(dependencias, `${RUTA}?zona=12`)

    expect(await screen.findByText('Este buque aún no tiene inspecciones.')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Inspección' })).not.toBeInTheDocument()
    for (const boton of within(await zonasDelCasco()).getAllByRole('button')) expect(boton).toHaveTextContent('Sin fotos')
    expect(within(panel()).getAllByRole('link').map((enlace) => enlace.textContent)).toEqual(['Nueva inspección'])
    expect(within(panel()).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(dependencias.inspecciones.obtener).not.toHaveBeenCalled()
  })
})

describe('CascoBuquePage canvas slot', () => {
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

  it('selects the section placed on a zone picked in the scene', async () => {
    const { router } = renderizar()
    await waitFor(() => expect(propsDelLienzo().estados.get('MID-BTM')).toBe('critical'))

    await act(async () => propsDelLienzo().onSeleccionar('KEEL'))

    expect(router.state.location.search).toBe('?zona=13')
    expect(propsDelLienzo().seleccionada).toBe('KEEL')
    expect(await zona('KEEL')).toHaveAttribute('aria-pressed', 'true')

    await act(async () => propsDelLienzo().onSeleccionar(null))

    expect(router.state.location.search).toBe('')
    expect(propsDelLienzo().seleccionada).toBeNull()
  })
})
