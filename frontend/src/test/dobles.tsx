import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { vi } from 'vitest'
import type { Dependencias } from '../app/composicion'
import { DependenciasProvider } from '../app/DependenciasProvider'
import type { Buque, BuqueDetalle, NuevoBuque } from '../buques/domain/buque'
import type { ModeloIA } from '../inspecciones/domain/modelo'
import type {
  EventoInspeccion,
  FiltroInspecciones,
  Foto,
  Inspeccion,
  InspeccionDetalle,
  PaginaInspecciones,
  SeccionCasco,
} from '../inspecciones/domain/inspeccion'

export const SECCION_QUILLA: SeccionCasco = { id: 3, codigo: 'KEEL', nombre: 'Quilla', descripcion: '', orden: 9 }

export function unBuque(overrides: Partial<Buque> = {}): Buque {
  return {
    id: 1,
    nombre: 'ARA Almirante Brown',
    tipo: 'Destructor',
    etapa: 'Activo',
    imagen: null,
    createdAt: '2026-10-01T10:00:00',
    updatedAt: '2026-10-01T10:00:00',
    ...overrides,
  }
}

/** Full technical sheet with every optional measure unset. */
export function unDetalleBuque(overrides: Partial<BuqueDetalle> = {}): BuqueDetalle {
  return {
    ...unBuque(),
    descripcion: '',
    autonomiaHoras: null,
    vidaDisenoAnios: null,
    horasNavegacionAnio: null,
    autonomiaDias: null,
    velMaximaNudos: null,
    alcanceNmA12kn: null,
    esloraTotalM: null,
    mangaMoldeadaM: null,
    puntalM: null,
    caladoDisenoM: null,
    desplazamientoTon: null,
    combustibleDiarioM3: null,
    combustibleDieselM3: null,
    combustibleHelicopteroM3: null,
    gasolinaBotesM3: null,
    aguaPotableM3: null,
    aceiteLubricanteM3: null,
    aceiteHidraulicoM3: null,
    rondasConfig: {},
    contextoOperacional: {},
    documentos: [],
    misiones: [],
    gruposConstructivos: [],
    secciones: [],
    ...overrides,
  }
}

export function unaInspeccion(overrides: Partial<Inspeccion> = {}): Inspeccion {
  return {
    id: 1,
    buqueId: 1,
    buqueNombre: 'ARA Almirante Brown',
    nombre: 'Inspección #1 — ARA Almirante Brown',
    severidadMax: null,
    descripcion: 'Control anual de casco',
    tomadoPor: 'María Pérez',
    fechaCreacion: '2026-10-01T10:00:00Z',
    fechaModificacion: '2026-10-01T10:00:00Z',
    totalFotos: 0,
    ...overrides,
  }
}

export function unaPagina(resultados: Inspeccion[] = [], extra: Partial<PaginaInspecciones> = {}): PaginaInspecciones {
  return { resultados, siguiente: null, hayMas: false, ...extra }
}

export function unaFoto(overrides: Partial<Foto> = {}): Foto {
  return {
    id: 1,
    seccion: SECCION_QUILLA,
    imagenOriginal: 'http://api.test/media/original.jpg',
    imagenAnotada: null,
    detecciones: [],
    tiempoInferenciaMs: null,
    severidad: null,
    estado: 'pendiente',
    errorDetalle: null,
    modelo: null,
    modeloVersion: null,
    taxonomiaVersion: null,
    fechaCreacion: '2026-10-01T10:05:00Z',
    ...overrides,
  }
}

export function unModelo(overrides: Partial<ModeloIA> = {}): ModeloIA {
  return {
    id: 'yolo-seg',
    label: 'YOLO segmentación',
    descripcion: 'Detecta y segmenta daños del casco.',
    arquitectura: 'yolo',
    version: '1.0.0',
    produceMascaras: true,
    confianzaPorDefecto: 0.25,
    porDefecto: true,
    disponible: true,
    ...overrides,
  }
}

export function unDetalle(overrides: Partial<InspeccionDetalle> = {}): InspeccionDetalle {
  return { ...unaInspeccion(), fotos: [], ...overrides }
}

/** Fake adapters for every port; tests override only what they exercise. */
export function crearDependenciasFalsas() {
  let emitir: (evento: EventoInspeccion) => void = () => {}
  const cancelar = vi.fn()
  const dependencias = {
    inspecciones: {
      buscar: vi.fn(async (_filtro: FiltroInspecciones, _cursor?: string) => unaPagina()),
      obtener: vi.fn(async () => unDetalle()),
      crear: vi.fn(async () => unaInspeccion()),
      renombrar: vi.fn(async (_id: number, nombre: string) => unaInspeccion({ nombre })),
      eliminar: vi.fn(async () => {}),
      listarSecciones: vi.fn(async (_buqueId: number) => [SECCION_QUILLA]),
      subirFoto: vi.fn(async () => unaFoto()),
      analizar: vi.fn(async (_inspeccionId: number, _modeloId?: string) => ({ iniciadas: 0, omitidasPorLimite: 0 })),
      reintentarFoto: vi.fn(async (_fotoId: number, _modeloId?: string) => unaFoto()),
      eliminarFoto: vi.fn(async () => {}),
    },
    modelos: {
      listar: vi.fn(async () => [unModelo()]),
    },
    eventos: {
      suscribir: vi.fn((_id: number, alRecibir: (evento: EventoInspeccion) => void) => {
        emitir = alRecibir
        return cancelar
      }),
    },
    buques: {
      listar: vi.fn(async () => [
        unBuque(),
        unBuque({ id: 2, nombre: 'ARA Libertad', tipo: 'Fragata' }),
      ]),
      obtener: vi.fn(async (_id: number) => unDetalleBuque()),
      crear: vi.fn(async (_datos: NuevoBuque) => unDetalleBuque()),
    },
  } satisfies Dependencias
  return { dependencias, emitirEvento: (evento: EventoInspeccion) => emitir(evento), cancelarSuscripcion: cancelar }
}

/** Renders routes inside a memory router with the given fake dependencies. */
export function renderizarRutas(rutas: RouteObject[], dependencias: Dependencias, rutaInicial: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [rutaInicial] })
  render(
    <DependenciasProvider valor={dependencias}>
      <RouterProvider router={router} />
    </DependenciasProvider>,
  )
  return router
}
