import { describe, expect, it } from 'vitest'
import { SECCION_QUILLA, unaDeteccion, unaFoto } from '../../test/dobles'
import type { SeccionCasco } from './inspeccion'
import { resumirZonas } from './resumenZonas'

const SECCION_PROA: SeccionCasco = { id: 4, codigo: 'FWD-BTM', nombre: 'Fondo de proa', descripcion: '', orden: 1 }

const COMPONENTE = unaDeteccion({ clase: 'ship_hull', etiqueta: 'Casco del buque', tipo: 'componente', severidad: null })
const DESCONOCIDA = unaDeteccion({ clase: 'barnacles', etiqueta: 'barnacles', tipo: null, severidad: null })

function resumenDe(fotos: Parameters<typeof resumirZonas>[0], seccion: SeccionCasco = SECCION_QUILLA) {
  return resumirZonas(fotos, [seccion]).get(seccion.id)
}

describe('resumirZonas', () => {
  it('gives every section an entry, and a section without photos is "sin-fotos"', () => {
    const fotos = [unaFoto({ id: 1, seccion: SECCION_PROA, estado: 'completada', detecciones: [unaDeteccion()] })]

    const resumenes = resumirZonas(fotos, [SECCION_QUILLA, SECCION_PROA])

    expect([...resumenes.keys()]).toEqual([SECCION_QUILLA.id, SECCION_PROA.id])
    expect(resumenes.get(SECCION_QUILLA.id)).toEqual({
      seccionId: SECCION_QUILLA.id,
      fotos: 0,
      analizadas: 0,
      hallazgos: 0,
      peorSeveridad: null,
      estado: 'sin-fotos',
    })
  })

  it('ignores photos of sections that are not listed', () => {
    const fotos = [unaFoto({ id: 1, seccion: SECCION_PROA, estado: 'completada', detecciones: [unaDeteccion()] })]

    const resumenes = resumirZonas(fotos, [SECCION_QUILLA])

    expect(resumenes.size).toBe(1)
    expect(resumenes.get(SECCION_QUILLA.id)?.estado).toBe('sin-fotos')
  })

  it('is "sin-analizar" when no photo finished its analysis (pending, in progress or error)', () => {
    const fotos = [
      unaFoto({ id: 1, estado: 'pendiente' }),
      unaFoto({ id: 2, estado: 'en_proceso' }),
      unaFoto({ id: 3, estado: 'error', errorDetalle: 'falló' }),
    ]

    expect(resumenDe(fotos)).toEqual({
      seccionId: SECCION_QUILLA.id,
      fotos: 3,
      analizadas: 0,
      hallazgos: 0,
      peorSeveridad: null,
      estado: 'sin-analizar',
    })
  })

  it('is "sin-hallazgos" when the analyzed photos only show hull components', () => {
    const fotos = [unaFoto({ id: 1, estado: 'completada', detecciones: [COMPONENTE] })]

    expect(resumenDe(fotos)).toMatchObject({ fotos: 1, analizadas: 1, hallazgos: 0, peorSeveridad: null, estado: 'sin-hallazgos' })
  })

  it('is "sin-hallazgos" when every anomaly was discarded by the inspector', () => {
    const fotos = [
      unaFoto({
        id: 1,
        estado: 'completada',
        detecciones: [unaDeteccion({ descartada: true }), unaDeteccion({ clase: 'pitting', severidad: 'high', descartada: true })],
      }),
    ]

    expect(resumenDe(fotos)).toMatchObject({ hallazgos: 0, peorSeveridad: null, estado: 'sin-hallazgos' })
  })

  it('takes the worst severity among the findings of every analyzed photo', () => {
    const fotos = [
      unaFoto({
        id: 1,
        estado: 'completada',
        detecciones: [unaDeteccion({ severidad: 'low' }), unaDeteccion({ clase: 'pitting', severidad: 'medium' })],
      }),
      unaFoto({ id: 2, estado: 'completada', detecciones: [unaDeteccion({ clase: 'crack', severidad: 'high' })] }),
      unaFoto({ id: 3, estado: 'completada', detecciones: [] }),
    ]

    expect(resumenDe(fotos)).toMatchObject({ fotos: 3, analizadas: 3, peorSeveridad: 'high', estado: 'high' })
  })

  it('lets a discarded critical finding give way to the next level', () => {
    const fotos = [
      unaFoto({
        id: 1,
        estado: 'completada',
        detecciones: [unaDeteccion({ severidad: 'critical', descartada: true }), unaDeteccion({ clase: 'pitting', severidad: 'high' })],
      }),
    ]

    expect(resumenDe(fotos)).toMatchObject({ peorSeveridad: 'high', estado: 'high' })
  })

  it('ignores the detections of photos that did not complete their analysis', () => {
    const fotos = [
      unaFoto({ id: 1, estado: 'completada', detecciones: [unaDeteccion({ severidad: 'medium', cantidad: 2 })] }),
      unaFoto({ id: 2, estado: 'en_proceso', detecciones: [unaDeteccion({ severidad: 'critical', cantidad: 5 })] }),
      unaFoto({ id: 3, estado: 'error', detecciones: [unaDeteccion({ severidad: 'high', cantidad: 7 })] }),
    ]

    expect(resumenDe(fotos)).toMatchObject({ fotos: 3, analizadas: 1, hallazgos: 2, peorSeveridad: 'medium', estado: 'medium' })
  })

  it('is "sin-clasificar" when the only findings are of an unknown class', () => {
    const fotos = [unaFoto({ id: 1, estado: 'completada', detecciones: [DESCONOCIDA, COMPONENTE] })]

    expect(resumenDe(fotos)).toMatchObject({ hallazgos: 1, peorSeveridad: null, estado: 'sin-clasificar' })
  })

  it('prefers a known severity over an unknown class', () => {
    const fotos = [unaFoto({ id: 1, estado: 'completada', detecciones: [DESCONOCIDA, unaDeteccion({ severidad: 'low' })] })]

    expect(resumenDe(fotos)).toMatchObject({ peorSeveridad: 'low', estado: 'low' })
  })

  it('sums the counts of the findings only: confirmed anomalies, unknown classes included', () => {
    const fotos = [
      unaFoto({
        id: 1,
        estado: 'completada',
        detecciones: [
          unaDeteccion({ cantidad: 2 }),
          unaDeteccion({ clase: 'marine_growth', severidad: 'medium', cantidad: 3, descartada: true }),
          { ...COMPONENTE, cantidad: 4 },
          { ...DESCONOCIDA, cantidad: 1 },
        ],
      }),
      unaFoto({ id: 2, estado: 'completada', detecciones: [unaDeteccion({ clase: 'pitting', severidad: 'low', cantidad: 6 })] }),
    ]

    expect(resumenDe(fotos)?.hallazgos).toBe(9)
  })

  it('keys sections by id, even when two codes differ only in case', () => {
    const mayusculas: SeccionCasco = { id: 10, codigo: 'SEC-01', nombre: 'Sección 1', descripcion: '', orden: 1 }
    const minusculas: SeccionCasco = { id: 11, codigo: 'sec-01', nombre: 'Sección 1 bis', descripcion: '', orden: 2 }
    const fotos = [
      unaFoto({ id: 1, seccion: mayusculas, estado: 'completada', detecciones: [unaDeteccion({ severidad: 'critical' })] }),
      unaFoto({ id: 2, seccion: minusculas, estado: 'pendiente' }),
    ]

    const resumenes = resumirZonas(fotos, [mayusculas, minusculas])

    expect(resumenes.get(10)).toMatchObject({ seccionId: 10, fotos: 1, estado: 'critical' })
    expect(resumenes.get(11)).toMatchObject({ seccionId: 11, fotos: 1, estado: 'sin-analizar' })
  })
})
