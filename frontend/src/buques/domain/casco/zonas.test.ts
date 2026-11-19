import { describe, expect, it } from 'vitest'
import type { SeccionCasco } from '../../../inspecciones/domain/inspeccion'
import { BUQUE_DE_GUERRA } from './arquetipo'
import {
  CODIGOS_ZONA,
  TRAMOS_DE_CUADERNA,
  alturasDeBandas,
  codigoDeZona,
  esCodigoZona,
  tercioDe,
  ubicarSecciones,
} from './zonas'

/** Codes and order of `SECCIONES_ESTANDAR` in `backend/vision/secciones.py`. */
const CODIGOS_DEL_BACKEND = [
  'FWD-BTM',
  'MID-BTM',
  'AFT-BTM',
  'FWD-BLG-P',
  'FWD-BLG-S',
  'MID-BLG-P',
  'MID-BLG-S',
  'AFT-BLG-P',
  'AFT-BLG-S',
  'FWD-SS-P',
  'MID-SS-P',
  'AFT-SS-P',
  'FWD-SS-S',
  'MID-SS-S',
  'AFT-SS-S',
  'FWD-DK',
  'MID-DK',
  'AFT-DK',
  'KEEL',
  'WL-P',
  'WL-S',
  'PROP',
  'SEA-CHEST',
]

function seccion(id: number, codigo: string): SeccionCasco {
  return { id, codigo, nombre: `Sección ${id}`, descripcion: '', orden: id }
}

describe('CODIGOS_ZONA', () => {
  it('lists the 23 standard codes in the backend order', () => {
    expect([...CODIGOS_ZONA]).toEqual(CODIGOS_DEL_BACKEND)
  })

  it('recognises only exact standard codes', () => {
    expect(esCodigoZona('MID-BLG-S')).toBe(true)
    expect(esCodigoZona('mid-blg-s')).toBe(false)
    expect(esCodigoZona(' KEEL')).toBe(false)
    expect(esCodigoZona('SEC-01')).toBe(false)
  })
})

describe('band classification', () => {
  it('splits the length in thirds from the stern', () => {
    expect(tercioDe(0)).toBe('AFT')
    expect(tercioDe(0.3333)).toBe('AFT')
    expect(tercioDe(1 / 3)).toBe('MID')
    expect(tercioDe(0.5)).toBe('MID')
    expect(tercioDe(2 / 3)).toBe('FWD')
    expect(tercioDe(1)).toBe('FWD')
  })

  it('walks a frame from the keel to the deck edge', () => {
    expect(TRAMOS_DE_CUADERNA).toEqual(['KEEL', 'BTM', 'BLG', 'SS', 'WL', 'SS', 'DK'])
  })

  it('splits bottom and deck edge by third, the waterline by side, bilge and side by both', () => {
    expect(codigoDeZona('KEEL', 'MID', 'P')).toBe('KEEL')
    expect(codigoDeZona('BTM', 'FWD', 'S')).toBe('FWD-BTM')
    expect(codigoDeZona('BTM', 'FWD', 'P')).toBe('FWD-BTM')
    expect(codigoDeZona('DK', 'AFT', 'P')).toBe('AFT-DK')
    expect(codigoDeZona('WL', 'MID', 'P')).toBe('WL-P')
    expect(codigoDeZona('WL', 'AFT', 'S')).toBe('WL-S')
    expect(codigoDeZona('BLG', 'AFT', 'P')).toBe('AFT-BLG-P')
    expect(codigoDeZona('SS', 'FWD', 'S')).toBe('FWD-SS-S')
  })

  it('places the vertical bands by height, the waterline 0.05 D around the draft', () => {
    const alturas = alturasDeBandas({ fondo: 0, cubierta: 10, calado: 4.5, puntal: 10 }, BUQUE_DE_GUERRA.bandas)

    const esperadas = [0.7, 3, 4, 5, 9]
    alturas.forEach((altura, k) => expect(altura).toBeCloseTo(esperadas[k], 9))
  })

  it('keeps the bottom and bilge bands below the waterline where the bottom rises', () => {
    const alturas = alturasDeBandas({ fondo: 3.6, cubierta: 10, calado: 4.5, puntal: 10 }, BUQUE_DE_GUERRA.bandas)

    expect(alturas[2]).toBeCloseTo(4, 9)
    expect(alturas[0]).toBeGreaterThan(3.6)
    for (let k = 1; k < alturas.length; k++) expect(alturas[k]).toBeGreaterThan(alturas[k - 1])
  })
})

describe('ubicarSecciones', () => {
  it('places sections whose code is exactly a standard code', () => {
    const quilla = seccion(1, 'KEEL')
    const proa = seccion(2, 'FWD-BTM')

    const { ubicadas, sinUbicar } = ubicarSecciones([quilla, proa])

    expect([...ubicadas.entries()]).toEqual([
      ['KEEL', quilla],
      ['FWD-BTM', proa],
    ])
    expect(sinUbicar).toEqual([])
  })

  it('leaves custom codes, lower case and free text unplaced, in their input order', () => {
    const generado = seccion(1, 'SEC-01')
    const minusculas = seccion(2, 'keel')
    const babor = seccion(3, 'WL-P')
    const textoLibre = seccion(4, 'Proa babor')
    const conEspacio = seccion(5, ' WL-S')

    const { ubicadas, sinUbicar } = ubicarSecciones([generado, minusculas, babor, textoLibre, conEspacio])

    expect([...ubicadas.keys()]).toEqual(['WL-P'])
    expect(sinUbicar).toEqual([generado, minusculas, textoLibre, conEspacio])
  })

  it('keeps the first section of a repeated standard code and leaves the rest unplaced', () => {
    const primera = seccion(1, 'PROP')
    const otra = seccion(2, 'MID-DK')
    const repetida = seccion(3, 'PROP')

    const { ubicadas, sinUbicar } = ubicarSecciones([primera, otra, repetida])

    expect(ubicadas.get('PROP')).toBe(primera)
    expect(ubicadas.get('MID-DK')).toBe(otra)
    expect(sinUbicar).toEqual([repetida])
  })
})
