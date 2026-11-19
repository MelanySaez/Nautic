import { describe, expect, it } from 'vitest'
import { BUQUE_DE_GUERRA } from './arquetipo'
import { dimensionesCasco } from './dimensiones'
import { perfilLateral } from './perfil'

function coordenadas(d: string): Array<[number, number]> {
  const numeros = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
  const pares: Array<[number, number]> = []
  for (let k = 0; k + 1 < numeros.length; k += 2) pares.push([numeros[k], numeros[k + 1]])
  return pares
}

describe('perfilLateral', () => {
  it('draws closed subpaths: the hull plus one outline per superstructure piece', () => {
    const { d } = perfilLateral(dimensionesCasco({}, BUQUE_DE_GUERRA), BUQUE_DE_GUERRA)

    expect(d.startsWith('M')).toBe(true)
    expect(d.trim().endsWith('Z')).toBe(true)
    const subtrazos = 1 + BUQUE_DE_GUERRA.superestructura.length
    expect(d.match(/M/g)).toHaveLength(subtrazos)
    expect(d.match(/Z/g)).toHaveLength(subtrazos)
  })

  it.each([60, 120])('spans the length of a %s m vessel and stays inside its own box', (eslora) => {
    const dim = dimensionesCasco({ esloraTotalM: eslora }, BUQUE_DE_GUERRA)

    const { d, ancho, alto } = perfilLateral(dim, BUQUE_DE_GUERRA)

    expect(ancho).toBeCloseTo(eslora, 6)
    expect(alto).toBeGreaterThan(dim.puntal)
    const puntos = coordenadas(d)
    expect(puntos.length).toBeGreaterThan(10)
    for (const [x, y] of puntos) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(ancho)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(alto)
    }
    expect(Math.min(...puntos.map(([x]) => x))).toBe(0)
    expect(Math.max(...puntos.map(([x]) => x))).toBeCloseTo(ancho, 1)
  })
})
