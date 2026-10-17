import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { vi } from 'vitest'
import type { Dependencias } from '../app/composicion'
import { DependenciasProvider } from '../app/DependenciasProvider'
import type { EventoInspeccion, Foto, Inspeccion, InspeccionDetalle, SeccionCasco } from '../inspecciones/domain/inspeccion'

export const SECCION_QUILLA: SeccionCasco = { id: 3, codigo: 'KEEL', nombre: 'Quilla', descripcion: '', orden: 9 }

export function unaInspeccion(overrides: Partial<Inspeccion> = {}): Inspeccion {
  return {
    id: 1,
    buqueId: 1,
    buqueNombre: 'ARA Almirante Brown',
    descripcion: 'Control anual de casco',
    tomadoPor: 'María Pérez',
    fechaCreacion: '2026-10-01T10:00:00Z',
    fechaModificacion: '2026-10-01T10:00:00Z',
    totalFotos: 0,
    ...overrides,
  }
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
    fechaCreacion: '2026-10-01T10:05:00Z',
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
      listar: vi.fn(async () => [] as Inspeccion[]),
      obtener: vi.fn(async () => unDetalle()),
      crear: vi.fn(async () => unaInspeccion()),
      eliminar: vi.fn(async () => {}),
      listarSecciones: vi.fn(async () => [SECCION_QUILLA]),
      subirFoto: vi.fn(async () => unaFoto()),
      analizar: vi.fn(async () => ({ iniciadas: 0, omitidasPorLimite: 0 })),
      reintentarFoto: vi.fn(async () => unaFoto()),
      eliminarFoto: vi.fn(async () => {}),
    },
    eventos: {
      suscribir: vi.fn((_id: number, alRecibir: (evento: EventoInspeccion) => void) => {
        emitir = alRecibir
        return cancelar
      }),
    },
    buques: {
      listar: vi.fn(async () => [
        { id: 1, nombre: 'ARA Almirante Brown', tipo: 'Destructor' },
        { id: 2, nombre: 'ARA Libertad', tipo: 'Fragata' },
      ]),
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
