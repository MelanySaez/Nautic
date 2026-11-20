import { describe, expect, it } from 'vitest'
import { conParametro, idDeParametro } from './parametrosUrl'

describe('idDeParametro', () => {
  it('reads a positive integer id from the query', () => {
    expect(idDeParametro(new URLSearchParams('zona=3'), 'zona')).toBe(3)
    expect(idDeParametro(new URLSearchParams('buque=1207&zona=3'), 'buque')).toBe(1207)
  })

  it.each(['', '0', '-2', '1.5', '03', ' 3', '3a', 'abc', '1e3', '99999999999999999999'])(
    'treats %j as no id',
    (valor) => {
      expect(idDeParametro(new URLSearchParams({ zona: valor }), 'zona')).toBeNull()
    },
  )

  it('returns null when the parameter is missing', () => {
    expect(idDeParametro(new URLSearchParams('buque=2'), 'zona')).toBeNull()
  })
})

describe('conParametro', () => {
  it('sets the parameter and keeps the others', () => {
    const previos = new URLSearchParams('buque=2&zona=1')

    expect(conParametro(previos, 'zona', 5).toString()).toBe('buque=2&zona=5')
    expect(previos.toString()).toBe('buque=2&zona=1')
  })

  it('removes the parameter when the value is null', () => {
    expect(conParametro(new URLSearchParams('zona=1&q=casco'), 'zona', null).toString()).toBe('q=casco')
  })
})
