import { describe, expect, it } from 'vitest'
import { decodificarRle } from './detecciones'

describe('decodificarRle', () => {
  it('decodes column-major COCO counts into a row-major mask', () => {
    // 2 rows x 3 columns; column order: 0 | 1 1 | 0 0 0
    const mascara = decodificarRle({ alto: 2, ancho: 3, conteos: [1, 2, 3] })

    expect(Array.from(mascara)).toEqual([0, 1, 0, 1, 0, 0])
  })

  it('rejects counts that do not cover the whole mask', () => {
    expect(() => decodificarRle({ alto: 2, ancho: 2, conteos: [1, 1] })).toThrow()
  })
})
