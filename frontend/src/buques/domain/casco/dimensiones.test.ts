import { describe, expect, it } from 'vitest'
import type { BuqueDetalle } from '../buque'
import { BUQUE_DE_GUERRA } from './arquetipo'
import { dimensionesCasco } from './dimensiones'

const { mangaEslora, puntalManga, caladoPuntal } = BUQUE_DE_GUERRA.proporciones
const ESLORA_POR_DEFECTO = BUQUE_DE_GUERRA.esloraPorDefecto

function porDefecto(eslora = ESLORA_POR_DEFECTO) {
  const manga = eslora * mangaEslora
  const puntal = manga * puntalManga
  return { eslora, manga, puntal, calado: puntal * caladoPuntal }
}

describe('dimensionesCasco', () => {
  it('uses the four measures of the technical sheet when they are consistent', () => {
    const dim = dimensionesCasco(
      { esloraTotalM: 100, mangaMoldeadaM: 12, puntalM: 8, caladoDisenoM: 4 },
      BUQUE_DE_GUERRA,
    )

    expect(dim).toEqual({ eslora: 100, manga: 12, puntal: 8, calado: 4 })
  })

  it('falls back to the default length and the archetype ratios when every measure is missing', () => {
    const dim = dimensionesCasco({}, BUQUE_DE_GUERRA)
    const esperado = porDefecto()

    expect(dim.eslora).toBe(ESLORA_POR_DEFECTO)
    expect(dim.manga).toBeCloseTo(esperado.manga, 9)
    expect(dim.puntal).toBeCloseTo(esperado.puntal, 9)
    expect(dim.calado).toBeCloseTo(esperado.calado, 9)
  })

  it.each([null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY])('treats %s as a missing measure', (valor) => {
    const dim = dimensionesCasco(
      { esloraTotalM: valor, mangaMoldeadaM: valor, puntalM: valor, caladoDisenoM: valor },
      BUQUE_DE_GUERRA,
    )
    const esperado = porDefecto()

    expect(dim.eslora).toBe(ESLORA_POR_DEFECTO)
    expect(dim.manga).toBeCloseTo(esperado.manga, 9)
    expect(dim.puntal).toBeCloseTo(esperado.puntal, 9)
    expect(dim.calado).toBeCloseTo(esperado.calado, 9)
  })

  it('derives the length from the beam when only the beam is known', () => {
    const dim = dimensionesCasco({ mangaMoldeadaM: 15 }, BUQUE_DE_GUERRA)

    expect(dim.eslora).toBeCloseTo(15 / mangaEslora, 9)
    expect(dim.manga).toBe(15)
    expect(dim.puntal).toBeCloseTo(15 * puntalManga, 9)
    expect(dim.calado).toBeCloseTo(15 * puntalManga * caladoPuntal, 9)
  })

  it('keeps a known length and derives the beam from it when the beam is missing', () => {
    const dim = dimensionesCasco({ esloraTotalM: 80 }, BUQUE_DE_GUERRA)

    expect(dim).toEqual(expect.objectContaining({ eslora: 80 }))
    expect(dim.manga).toBeCloseTo(80 * mangaEslora, 9)
  })

  it.each([50, 60])('ignores a beam of %s m that is not below half of a 100 m length', (manga) => {
    const dim = dimensionesCasco({ esloraTotalM: 100, mangaMoldeadaM: manga }, BUQUE_DE_GUERRA)

    expect(dim.eslora).toBe(100)
    expect(dim.manga).toBeCloseTo(100 * mangaEslora, 9)
  })

  it('derives the depth from the beam when the depth is missing', () => {
    const dim = dimensionesCasco({ esloraTotalM: 100, mangaMoldeadaM: 12, caladoDisenoM: 3 }, BUQUE_DE_GUERRA)

    expect(dim.puntal).toBeCloseTo(12 * puntalManga, 9)
    expect(dim.calado).toBe(3)
  })

  it.each([8, 9])('ignores a draft of %s m that is not below an 8 m depth', (calado) => {
    const dim = dimensionesCasco(
      { esloraTotalM: 100, mangaMoldeadaM: 12, puntalM: 8, caladoDisenoM: calado },
      BUQUE_DE_GUERRA,
    )

    expect(dim.puntal).toBe(8)
    expect(dim.calado).toBeCloseTo(8 * caladoPuntal, 9)
  })

  it('accepts the technical sheet of a vessel detail as it is', () => {
    const ficha: Pick<BuqueDetalle, 'esloraTotalM' | 'mangaMoldeadaM' | 'puntalM' | 'caladoDisenoM'> = {
      esloraTotalM: 90,
      mangaMoldeadaM: null,
      puntalM: 7,
      caladoDisenoM: null,
    }

    const dim = dimensionesCasco(ficha, BUQUE_DE_GUERRA)

    expect(dim.eslora).toBe(90)
    expect(dim.manga).toBeCloseTo(90 * mangaEslora, 9)
    expect(dim.puntal).toBe(7)
    expect(dim.calado).toBeCloseTo(7 * caladoPuntal, 9)
  })
})
