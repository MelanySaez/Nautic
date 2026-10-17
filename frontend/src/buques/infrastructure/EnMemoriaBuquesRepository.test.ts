import { describe, expect, it } from 'vitest'
import { EnMemoriaBuquesRepository } from './EnMemoriaBuquesRepository'

describe('EnMemoriaBuquesRepository', () => {
  it('lists the seeded vessels sorted by name', async () => {
    const repo = new EnMemoriaBuquesRepository([
      { id: 2, nombre: 'ARA Libertad', tipo: 'Fragata' },
      { id: 1, nombre: 'ARA Almirante Brown', tipo: 'Destructor' },
    ])

    expect((await repo.listar()).map((b) => b.nombre)).toEqual(['ARA Almirante Brown', 'ARA Libertad'])
  })

  it('returns a copy so callers cannot mutate the seed', async () => {
    const repo = new EnMemoriaBuquesRepository([{ id: 1, nombre: 'ARA Libertad', tipo: 'Fragata' }])

    ;(await repo.listar()).pop()

    expect(await repo.listar()).toHaveLength(1)
  })
})
