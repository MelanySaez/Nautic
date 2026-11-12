import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { vi } from 'vitest'
import type { Dependencias } from '../app/composicion'
import { DependenciasProvider } from '../app/DependenciasProvider'
import type { Buque, BuqueConInspecciones, BuqueDetalle, CambiosBuque, NuevoBuque } from '../buques/domain/buque'
import type { DatosRegistro, Usuario } from '../cuentas/domain/usuario'
import { SesionContext } from '../cuentas/ui/sesion'
import type { DetallePorInstancia } from '../inspecciones/domain/detecciones'
import type { ModeloIA } from '../inspecciones/domain/modelo'
import type { BorradorReporte, CambiosReporte } from '../inspecciones/domain/reporte'
import type {
  EventoInspeccion,
  FiltroInspecciones,
  Foto,
  Inspeccion,
  InspeccionDetalle,
  PaginaInspecciones,
  PermisosInspeccion,
  SeccionCasco,
} from '../inspecciones/domain/inspeccion'
import type { CambiosMiembro, Miembro, NuevoMiembro } from '../inspecciones/domain/miembros'

/** The logged-in user of page tests; leads the default inspection (`lider.id` 1). */
export function unUsuario(overrides: Partial<Usuario> = {}): Usuario {
  return { id: 1, email: 'maria@nautic.test', nombre: 'María Pérez', cargo: 'Inspectora', esAdmin: false, ...overrides }
}

export const SECCION_QUILLA: SeccionCasco = { id: 3, codigo: 'KEEL', nombre: 'Quilla', descripcion: '', orden: 9 }

/** Report draft never saved, with one photo to review (corrosion + paint peel). */
export function unBorradorReporte(overrides: Partial<BorradorReporte> = {}): BorradorReporte {
  return {
    conclusion: '',
    observaciones: '',
    recomendaciones: '',
    inspectorNombre: '',
    inspectorCargo: '',
    actualizado: null,
    fotos: [
      {
        fotoId: 4,
        seccion: { codigo: 'KEEL', nombre: 'Quilla' },
        imagen: '/media/inspecciones/anotadas/4.jpg',
        severidad: 'critical',
        nota: '',
        hallazgos: [
          { clase: 'corrosion', etiqueta: 'Corrosión', severidad: 'critical', total: 2, confianzaMaxima: 0.9, descartado: false },
          { clase: 'paint_peel', etiqueta: 'Descascaramiento de pintura', severidad: 'low', total: 1, confianzaMaxima: 0.3, descartado: false },
        ],
      },
    ],
    ...overrides,
  }
}

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
    lider: { id: 1, nombre: 'María Pérez' },
    privada: false,
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
    detalleDisponible: false,
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

/** Everything granted: the default user leads the inspection. */
export const TODOS_LOS_PERMISOS: PermisosInspeccion = {
  ver: true,
  esLider: true,
  subirFotos: true,
  analizar: true,
  editarReporte: true,
  editarInspeccion: true,
}

/** A member who may only read the inspection. */
export const SOLO_LECTURA: PermisosInspeccion = {
  ver: true,
  esLider: false,
  subirFotos: false,
  analizar: false,
  editarReporte: false,
  editarInspeccion: false,
}

export function unDetalle(overrides: Partial<InspeccionDetalle> = {}): InspeccionDetalle {
  return { ...unaInspeccion(), fotos: [], misPermisos: TODOS_LOS_PERMISOS, ...overrides }
}

export function unMiembro(overrides: Partial<Miembro> = {}): Miembro {
  return {
    id: 9,
    usuario: { id: 4, nombre: 'Ana Ruiz', cargo: 'Inspectora' },
    rol: 'revisor',
    permisos: { subirFotos: false, analizar: false, editarReporte: true, editarInspeccion: false },
    fechaAgregado: '2026-11-01T10:00:00Z',
    ...overrides,
  }
}

/** Fake adapters for every port; tests override only what they exercise. */
export function crearDependenciasFalsas() {
  let emitir: (evento: EventoInspeccion) => void = () => {}
  let expirar: () => void = () => {}
  const cancelar = vi.fn()
  const dependencias = {
    cuentas: {
      obtenerActual: vi.fn(async (): Promise<Usuario | null> => unUsuario()),
      iniciarSesion: vi.fn(async (_email: string, _password: string) => unUsuario()),
      registrarse: vi.fn(async (_datos: DatosRegistro) => unUsuario()),
      cerrarSesion: vi.fn(async () => {}),
      alExpirarSesion: vi.fn((oyente: () => void) => {
        expirar = oyente
        return () => {
          expirar = () => {}
        }
      }),
    },
    inspecciones: {
      buscar: vi.fn(async (_filtro: FiltroInspecciones, _cursor?: string) => unaPagina()),
      obtener: vi.fn(async () => unDetalle()),
      crear: vi.fn(async () => unaInspeccion()),
      renombrar: vi.fn(async (_id: number, nombre: string) => unaInspeccion({ nombre })),
      eliminar: vi.fn(async () => {}),
      cambiarPrivacidad: vi.fn(async (_id: number, privada: boolean) => unDetalle({ privada })),
      listarSecciones: vi.fn(async (_buqueId: number) => [SECCION_QUILLA]),
      subirFoto: vi.fn(async () => unaFoto()),
      analizar: vi.fn(async (_inspeccionId: number, _modeloId?: string) => ({ iniciadas: 0, omitidasPorLimite: 0 })),
      reintentarFoto: vi.fn(async (_fotoId: number, _modeloId?: string) => unaFoto()),
      eliminarFoto: vi.fn(async () => {}),
      obtenerDetecciones: vi.fn(async (_fotoId: number): Promise<DetallePorInstancia> => ({ ancho: 1, alto: 1, instancias: [] })),
      urlReporte: vi.fn((inspeccionId: number) => `/api/vision/inspecciones/${inspeccionId}/reporte/pdf/`),
      obtenerReporte: vi.fn(async (_inspeccionId: number) => unBorradorReporte()),
      guardarReporte: vi.fn(async (_inspeccionId: number, _cambios: CambiosReporte) => unBorradorReporte()),
    },
    miembros: {
      listar: vi.fn(async (_inspeccionId: number): Promise<Miembro[]> => []),
      invitar: vi.fn(async (_inspeccionId: number, datos: NuevoMiembro) =>
        unMiembro({ id: 10, usuario: { id: 5, nombre: 'Luis Sosa', cargo: '' }, rol: datos.rol }),
      ),
      actualizar: vi.fn(async (_inspeccionId: number, miembroId: number, _cambios: CambiosMiembro) => unMiembro({ id: miembroId })),
      quitar: vi.fn(async (_inspeccionId: number, _miembroId: number) => {}),
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
      listarConInspecciones: vi.fn(async (): Promise<BuqueConInspecciones[]> => []),
      obtener: vi.fn(async (_id: number) => unDetalleBuque()),
      crear: vi.fn(async (_datos: NuevoBuque) => unDetalleBuque()),
      actualizar: vi.fn(async (_id: number, _cambios: CambiosBuque) => unDetalleBuque()),
    },
  } satisfies Dependencias
  return {
    dependencias,
    emitirEvento: (evento: EventoInspeccion) => emitir(evento),
    cancelarSuscripcion: cancelar,
    /** Simulates a request answered 401 (the session expired). */
    expirarSesion: () => expirar(),
  }
}

/**
 * Renders routes inside a memory router with the given fake dependencies. Pages see `usuario`
 * as the logged-in user; routes that mount the real session provider replace it.
 */
export function renderizarRutas(
  rutas: RouteObject[],
  dependencias: Dependencias,
  rutaInicial: string,
  usuario: Usuario = unUsuario(),
) {
  const router = createMemoryRouter(rutas, { initialEntries: [rutaInicial] })
  render(
    <DependenciasProvider valor={dependencias}>
      <SesionContext.Provider value={{ usuario, iniciar: () => {}, cerrarSesion: async () => {} }}>
        <RouterProvider router={router} />
      </SesionContext.Provider>
    </DependenciasProvider>,
  )
  return router
}
