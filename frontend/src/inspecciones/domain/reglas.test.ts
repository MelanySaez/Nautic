import { describe, expect, it } from 'vitest'
import type { Foto, Inspeccion } from './inspeccion'
import { aplicarEvento, filtrarInspecciones, resumirProgreso, severidadMaxima } from './reglas'

const seccion = { id: 1, codigo: 'KEEL', nombre: 'Quilla', descripcion: '', orden: 1 }

function foto(overrides: Partial<Foto> = {}): Foto {
  return {
    id: 1,
    seccion,
    imagenOriginal: 'http://api/media/a.jpg',
    imagenAnotada: null,
    detecciones: [],
    tiempoInferenciaMs: null,
    severidad: null,
    estado: 'pendiente',
    errorDetalle: null,
    fechaCreacion: '2026-10-01T10:00:00Z',
    ...overrides,
  }
}

function inspeccion(overrides: Partial<Inspeccion> = {}): Inspeccion {
  return {
    id: 1,
    buqueId: 1,
    buqueNombre: 'ARA Almirante Brown',
    descripcion: '',
    tomadoPor: 'María Pérez',
    fechaCreacion: '2026-10-01T10:00:00Z',
    fechaModificacion: '2026-10-01T10:00:00Z',
    totalFotos: 0,
    ...overrides,
  }
}

describe('resumirProgreso', () => {
  it('counts photos per state and reports finished photos as a percentage', () => {
    const resumen = resumirProgreso([
      foto({ id: 1, estado: 'completada' }),
      foto({ id: 2, estado: 'error' }),
      foto({ id: 3, estado: 'en_proceso' }),
      foto({ id: 4, estado: 'pendiente' }),
    ])

    expect(resumen).toEqual({
      total: 4,
      completadas: 1,
      errores: 1,
      enProceso: 1,
      pendientes: 1,
      porcentaje: 50,
    })
  })

  it('reports 0% for an inspection without photos', () => {
    expect(resumirProgreso([]).porcentaje).toBe(0)
  })
})

describe('severidadMaxima', () => {
  it('returns the most severe level among the photos', () => {
    const fotos = [foto({ severidad: 'low' }), foto({ severidad: 'high' }), foto({ severidad: 'medium' })]

    expect(severidadMaxima(fotos)).toBe('high')
  })

  it('returns null when no photo has a severity yet', () => {
    expect(severidadMaxima([foto(), foto()])).toBeNull()
  })
})

describe('aplicarEvento', () => {
  it('appends a created photo', () => {
    const nueva = foto({ id: 2 })

    expect(aplicarEvento([foto()], { tipo: 'foto-creada', foto: nueva }).map((f) => f.id)).toEqual([1, 2])
  })

  it('ignores a created photo that is already present', () => {
    const fotos = [foto()]

    expect(aplicarEvento(fotos, { tipo: 'foto-creada', foto: foto() })).toHaveLength(1)
  })

  it('merges an update into the matching photo and keeps the others intact', () => {
    const otra = foto({ id: 2 })
    const resultado = aplicarEvento([foto(), otra], {
      tipo: 'foto-actualizada',
      actualizacion: {
        fotoId: 1,
        estado: 'completada',
        severidad: 'critical',
        detecciones: [{ clase: 'corrosion', cantidad: 2, confianzaMaxima: 0.92 }],
        tiempoInferenciaMs: 1200,
        imagenAnotada: 'http://api/media/a-anotada.jpg',
        errorDetalle: null,
      },
    })

    expect(resultado[0]).toMatchObject({
      id: 1,
      estado: 'completada',
      severidad: 'critical',
      tiempoInferenciaMs: 1200,
      imagenAnotada: 'http://api/media/a-anotada.jpg',
      seccion,
    })
    expect(resultado[1]).toBe(otra)
  })

  it('removes a deleted photo', () => {
    expect(aplicarEvento([foto(), foto({ id: 2 })], { tipo: 'foto-eliminada', fotoId: 1 }).map((f) => f.id)).toEqual([2])
  })
})

describe('filtrarInspecciones', () => {
  const inspecciones = [
    inspeccion({ id: 1, buqueNombre: 'ARA Almirante Brown', tomadoPor: 'María Pérez' }),
    inspeccion({ id: 2, buqueNombre: 'ARA Libertad', tomadoPor: 'Juan Gómez' }),
  ]

  it('matches the vessel name ignoring case and accents', () => {
    expect(filtrarInspecciones(inspecciones, 'libertad').map((i) => i.id)).toEqual([2])
  })

  it('matches the inspector name ignoring accents', () => {
    expect(filtrarInspecciones(inspecciones, 'maria').map((i) => i.id)).toEqual([1])
  })

  it('returns everything for a blank query', () => {
    expect(filtrarInspecciones(inspecciones, '   ')).toHaveLength(2)
  })
})
