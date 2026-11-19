import { describe, expect, it } from 'vitest'
import { BUQUE_DE_GUERRA } from './casco/arquetipo'
import { dimensionesCasco } from './casco/dimensiones'
import { generarCasco } from './casco/geometria'
import { CODIGOS_ZONA } from './casco/zonas'
import { arquetipoDeBuque, TIPOS_BUQUE, tipoBuqueDe } from './tiposBuque'

const RAPIDO = { cuadernas: 24, filas: 21 }

describe('TIPOS_BUQUE', () => {
  it('offers the six naval types in order, each with its own archetype', () => {
    expect(TIPOS_BUQUE.map((tipo) => tipo.nombre)).toEqual([
      'Fragata',
      'Corbeta',
      'Patrullera',
      'Destructor',
      'Buque anfibio',
      'Buque logístico',
    ])
    expect(new Set(TIPOS_BUQUE.map((tipo) => tipo.id)).size).toBe(6)
    expect(new Set(TIPOS_BUQUE.map((tipo) => tipo.arquetipo.id)).size).toBe(6)
  })

  it.each(TIPOS_BUQUE.map((tipo) => [tipo.nombre, tipo] as const))('builds a valid hull for %s', (_, tipo) => {
    const dimensiones = dimensionesCasco({}, tipo.arquetipo)
    const { eslora: L, manga: B } = dimensiones
    const casco = generarCasco(dimensiones, tipo.arquetipo, RAPIDO)
    const eps = 1e-4 * L

    expect(casco.zonas.map((zona) => zona.codigo)).toEqual([...CODIGOS_ZONA])
    for (const malla of [...casco.zonas, ...casco.neutras, ...casco.decorativas]) {
      expect(malla.posiciones.every(Number.isFinite), malla.toString()).toBe(true)
    }
    for (const zona of casco.zonas) {
      expect(zona.indices.length, zona.codigo).toBeGreaterThanOrEqual(3)
      const xs = Array.from({ length: zona.posiciones.length / 3 }, (_, i) => zona.posiciones[3 * i])
      if (zona.codigo.startsWith('AFT-')) expect(Math.max(...xs), zona.codigo).toBeLessThanOrEqual(L / 3 + eps)
      if (zona.codigo.startsWith('FWD-')) expect(Math.min(...xs), zona.codigo).toBeGreaterThanOrEqual((2 * L) / 3 - eps)
    }
    expect(casco.caja.max[0]).toBeCloseTo(L, 3)
    expect(casco.caja.max[2]).toBeLessThanOrEqual(B / 2 + eps)
    expect(casco.caja.min[2]).toBeGreaterThanOrEqual(-B / 2 - eps)
  })

  it('gives each type its own proportions', () => {
    const forma = (id: string) => {
      const tipo = TIPOS_BUQUE.find((t) => t.id === id)!
      const { eslora, manga } = dimensionesCasco({}, tipo.arquetipo)
      return { eslora, finura: eslora / manga }
    }

    expect(forma('patrullera').eslora).toBeLessThan(forma('corbeta').eslora)
    expect(forma('corbeta').eslora).toBeLessThan(forma('fragata').eslora)
    expect(forma('fragata').eslora).toBeLessThan(forma('destructor').eslora)
    // Auxiliaries are fuller than combatants.
    expect(forma('buque-logistico').finura).toBeLessThan(forma('destructor').finura)
    expect(forma('buque-anfibio').finura).toBeLessThan(forma('fragata').finura)
  })
})

describe('tipoBuqueDe', () => {
  it('matches the stored name ignoring case, accents and surrounding blanks', () => {
    expect(tipoBuqueDe('Fragata')?.id).toBe('fragata')
    expect(tipoBuqueDe('  PATRULLERA ')?.id).toBe('patrullera')
    expect(tipoBuqueDe('buque logistico')?.id).toBe('buque-logistico')
    expect(tipoBuqueDe('Buque Anfibio')?.id).toBe('buque-anfibio')
  })

  it('returns null for a free-text type outside the catalogue', () => {
    expect(tipoBuqueDe('Remolcador')).toBeNull()
    expect(tipoBuqueDe('')).toBeNull()
  })
})

describe('arquetipoDeBuque', () => {
  it("uses the type's archetype and falls back to the generic warship", () => {
    expect(arquetipoDeBuque('Destructor')).toBe(TIPOS_BUQUE.find((t) => t.id === 'destructor')!.arquetipo)
    expect(arquetipoDeBuque('Velero')).toBe(BUQUE_DE_GUERRA)
  })
})
