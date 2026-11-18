import { beforeAll, describe, expect, it } from 'vitest'
import { BUQUE_DE_GUERRA } from './arquetipo'
import { dimensionesCasco } from './dimensiones'
import { generarCasco, type CascoGenerado, type Malla, type OpcionesCasco } from './geometria'
import { CODIGOS_ZONA, type CodigoZona } from './zonas'

const DIM = dimensionesCasco({}, BUQUE_DE_GUERRA)
const { eslora: L, manga: B, puntal: D, calado: T } = DIM
/** Coarse resolution for the tests that do not depend on it. */
const RAPIDO: OpcionesCasco = { cuadernas: 24, filas: 21 }
/** Positions are Float32: compare against planes with a small tolerance. */
const EPS = 1e-4 * L

type Punto = [number, number, number]

function zona(casco: CascoGenerado, codigo: CodigoZona): Malla {
  const encontrada = casco.zonas.find((z) => z.codigo === codigo)
  if (!encontrada) throw new Error(`Missing zone ${codigo}`)
  return encontrada
}

function vertice(malla: Malla, indice: number): Punto {
  const k = 3 * indice
  return [malla.posiciones[k], malla.posiciones[k + 1], malla.posiciones[k + 2]]
}

function vertices(malla: Malla): Punto[] {
  return Array.from({ length: malla.posiciones.length / 3 }, (_, i) => vertice(malla, i))
}

function triangulos(malla: Malla): Array<[number, number, number]> {
  const lista: Array<[number, number, number]> = []
  for (let k = 0; k < malla.indices.length; k += 3) {
    lista.push([malla.indices[k], malla.indices[k + 1], malla.indices[k + 2]])
  }
  return lista
}

function todas(casco: CascoGenerado): Malla[] {
  return [...casco.zonas, ...casco.neutras, ...casco.decorativas]
}

/** Sorted `x|y|z` keys of every vertex, with z multiplied by `signoZ`. */
function claves(malla: Malla, signoZ: number): string[] {
  return vertices(malla)
    .map(([x, y, z]) => `${x}|${y}|${z * signoZ + 0}`)
    .sort()
}

describe('generarCasco', () => {
  let casco: CascoGenerado

  beforeAll(() => {
    casco = generarCasco(DIM, BUQUE_DE_GUERRA)
  })

  it('creates exactly one mesh per standard code, each with triangles', () => {
    const rapido = generarCasco(DIM, BUQUE_DE_GUERRA, RAPIDO)

    for (const resultado of [casco, rapido]) {
      expect(resultado.zonas.map((z) => z.codigo)).toEqual([...CODIGOS_ZONA])
      for (const malla of resultado.zonas) {
        expect(malla.indices.length, malla.codigo).toBeGreaterThanOrEqual(3)
        expect(malla.indices.length % 3, malla.codigo).toBe(0)
      }
    }
  })

  it('keeps every index in range and every position and normal finite', () => {
    const rapido = generarCasco(DIM, BUQUE_DE_GUERRA, RAPIDO)

    for (const malla of todas(rapido)) {
      const total = malla.posiciones.length / 3
      expect(malla.posiciones.length % 3).toBe(0)
      expect(malla.normales.length).toBe(malla.posiciones.length)
      expect(malla.indices.length % 3).toBe(0)
      expect(Math.max(...malla.indices)).toBeLessThan(total)
      expect(malla.posiciones.every(Number.isFinite)).toBe(true)
      for (let k = 0; k < malla.normales.length; k += 3) {
        expect(Math.hypot(malla.normales[k], malla.normales[k + 1], malla.normales[k + 2])).toBeCloseTo(1, 4)
      }
    }
  })

  it('separates the neutral deck and transom from the decorative superstructure', () => {
    expect(casco.neutras).toHaveLength(2)
    expect(casco.decorativas).toHaveLength(BUQUE_DE_GUERRA.superestructura.length)
    for (const malla of [...casco.neutras, ...casco.decorativas]) {
      expect(malla.indices.length).toBeGreaterThanOrEqual(3)
    }
  })

  it.each<[string, OpcionesCasco | undefined]>([
    ['the default resolution', undefined],
    ['a frame count that is not a multiple of three', { cuadernas: 20, filas: 12 }],
  ])('never mixes thirds: no zone triangle crosses x = L/3 or x = 2L/3 (%s)', (_, opciones) => {
    const resultado = opciones ? generarCasco(DIM, BUQUE_DE_GUERRA, opciones) : casco
    const cruces: string[] = []

    for (const malla of resultado.zonas) {
      for (const triangulo of triangulos(malla)) {
        const xs = triangulo.map((i) => vertice(malla, i)[0])
        for (const plano of [L / 3, (2 * L) / 3]) {
          if (Math.min(...xs) < plano - EPS && Math.max(...xs) > plano + EPS) cruces.push(malla.codigo)
        }
      }
    }

    expect(cruces).toEqual([])
  })

  it('keeps each lengthwise zone inside its third', () => {
    for (const malla of casco.zonas) {
      const xs = vertices(malla).map(([x]) => x)
      if (malla.codigo.startsWith('AFT-')) expect(Math.max(...xs), malla.codigo).toBeLessThanOrEqual(L / 3 + EPS)
      if (malla.codigo.startsWith('MID-')) {
        expect(Math.min(...xs), malla.codigo).toBeGreaterThanOrEqual(L / 3 - EPS)
        expect(Math.max(...xs), malla.codigo).toBeLessThanOrEqual((2 * L) / 3 + EPS)
      }
      if (malla.codigo.startsWith('FWD-')) expect(Math.min(...xs), malla.codigo).toBeGreaterThanOrEqual((2 * L) / 3 - EPS)
    }
  })

  it('mirrors each port zone on its starboard zone, port at z <= 0 and starboard at z >= 0', () => {
    const rapido = generarCasco(DIM, BUQUE_DE_GUERRA, RAPIDO)
    const pares = CODIGOS_ZONA.filter((c) => c.endsWith('-P'))
    expect(pares).toHaveLength(7)

    for (const codigoBabor of pares) {
      const babor = zona(rapido, codigoBabor)
      const estribor = zona(rapido, codigoBabor.replace(/-P$/, '-S') as CodigoZona)

      expect(vertices(babor).every(([, , z]) => z <= 0), codigoBabor).toBe(true)
      expect(vertices(estribor).every(([, , z]) => z >= 0), codigoBabor).toBe(true)
      expect(claves(babor, -1), codigoBabor).toEqual(claves(estribor, 1))
      expect(babor.indices.length).toBe(estribor.indices.length)
    }
  })

  it('winds every triangle so that its face points the same way as its vertex normals', () => {
    const rapido = generarCasco(DIM, BUQUE_DE_GUERRA, RAPIDO)
    const invertidos: string[] = []

    todas(rapido).forEach((malla, m) => {
      for (const [a, b, c] of triangulos(malla)) {
        const [pa, pb, pc] = [vertice(malla, a), vertice(malla, b), vertice(malla, c)]
        const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]
        const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]]
        const cara = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        const area = Math.hypot(...cara)
        if (area < 1e-6) continue
        let producto = 0
        for (const i of [a, b, c]) {
          for (let e = 0; e < 3; e++) producto += cara[e] * malla.normales[3 * i + e]
        }
        if (producto / area < -1e-3) invertidos.push(`${m}:${'codigo' in malla ? String(malla.codigo) : ''}`)
      }
    })

    expect(invertidos).toEqual([])
  })

  it('puts the waterline band 0.05 D around the design draft amidships', () => {
    for (const codigo of ['WL-P', 'WL-S'] as const) {
      const centrales = vertices(zona(casco, codigo)).filter(([x]) => x >= 0.4 * L && x <= 0.6 * L)
      expect(centrales.length).toBeGreaterThan(0)
      for (const [, y] of centrales) {
        expect(y).toBeGreaterThanOrEqual(T - 0.05 * D - EPS)
        expect(y).toBeLessThanOrEqual(T + 0.05 * D + EPS)
      }
    }
  })

  it('keeps the keel as a narrow strip on the centreline', () => {
    const quilla = vertices(zona(casco, 'KEEL'))

    expect(Math.max(...quilla.map(([, , z]) => Math.abs(z)))).toBeLessThanOrEqual(0.05 * B)
    expect(quilla.some(([, , z]) => z < 0)).toBe(true)
    expect(quilla.some(([, , z]) => z > 0)).toBe(true)
  })

  it('builds the propulsion as symmetric appendages near the stern, below the waterline', () => {
    const helices = zona(casco, 'PROP')
    const puntos = vertices(helices)

    expect(Math.max(...puntos.map(([x]) => x))).toBeLessThan(L / 3)
    expect(Math.min(...puntos.map(([x]) => x))).toBeGreaterThanOrEqual(-0.02 * L)
    expect(Math.max(...puntos.map(([, y]) => y))).toBeLessThan(T)
    expect(claves(helices, 1)).toEqual(claves(helices, -1))
  })

  it('puts the two sea-chest grilles under the bottom of the middle third', () => {
    const puntos = vertices(zona(casco, 'SEA-CHEST'))

    expect(Math.min(...puntos.map(([x]) => x))).toBeGreaterThan(L / 3)
    expect(Math.max(...puntos.map(([x]) => x))).toBeLessThan((2 * L) / 3)
    expect(Math.max(...puntos.map(([, y]) => y))).toBeLessThan(0.25 * T)
    expect(puntos.some(([, , z]) => z < 0)).toBe(true)
    expect(puntos.some(([, , z]) => z > 0)).toBe(true)
  })

  it('fits everything in an L x B box from the transom to the stem', () => {
    const puntos = todas(casco).flatMap(vertices)
    const eje = (e: number) => puntos.map((p) => p[e])

    expect(casco.caja.min[0]).toBe(Math.min(...eje(0)))
    expect(casco.caja.max[0]).toBe(Math.max(...eje(0)))
    expect(casco.caja.min[1]).toBe(Math.min(...eje(1)))
    expect(casco.caja.max[1]).toBe(Math.max(...eje(1)))
    expect(casco.caja.min[2]).toBe(Math.min(...eje(2)))
    expect(casco.caja.max[2]).toBe(Math.max(...eje(2)))

    // Appendages may reach slightly aft of the transom; nothing goes past the stem or the beam.
    expect(casco.caja.min[0]).toBeGreaterThanOrEqual(-0.02 * L)
    expect(casco.caja.max[0]).toBeCloseTo(L, 3)
    expect(casco.caja.min[1]).toBeGreaterThanOrEqual(0)
    expect(casco.caja.max[2]).toBeLessThanOrEqual(B / 2 + EPS)
    expect(casco.caja.max[2]).toBeGreaterThan(0.49 * B)
    expect(casco.caja.min[2]).toBeGreaterThanOrEqual(-B / 2 - EPS)
    expect(casco.caja.min[2]).toBeLessThan(-0.49 * B)
  })

  it('scales with the measurements of the vessel', () => {
    const corto = generarCasco(dimensionesCasco({ esloraTotalM: 60 }, BUQUE_DE_GUERRA), BUQUE_DE_GUERRA, RAPIDO)

    expect(corto.caja.max[0]).toBeCloseTo(60, 3)
    expect(corto.caja.max[2]).toBeCloseTo((60 * BUQUE_DE_GUERRA.proporciones.mangaEslora) / 2, 3)
  })

  it('is deterministic', () => {
    const primero = generarCasco(DIM, BUQUE_DE_GUERRA, RAPIDO)
    const segundo = generarCasco(DIM, BUQUE_DE_GUERRA, RAPIDO)

    expect(segundo).toEqual(primero)
  })
})
