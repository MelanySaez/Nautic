import { describe, expect, it, vi } from 'vitest'
import { ApiClient, ApiError } from './apiClient'

function respuesta(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function errorDe(status: number, body: unknown): Promise<ApiError> {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(respuesta(status, body))
  const cliente = new ApiClient('http://api.test', fetchMock)
  const error = await cliente.get('/api/x/').catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('ApiClient field errors', () => {
  it('keeps the per-field messages of a 400 response next to the general message', async () => {
    const error = await errorDe(400, {
      error: 'Datos inválidos.',
      campos: { nombre: ['Este campo es requerido.'], puntal_m: ['No puede ser negativo.', 'Número fuera de rango.'] },
    })

    expect(error.status).toBe(400)
    expect(error.message).toBe('Datos inválidos.')
    expect(error.campos).toEqual({
      nombre: ['Este campo es requerido.'],
      puntal_m: ['No puede ser negativo.', 'Número fuera de rango.'],
    })
  })

  it('leaves campos undefined when the body has none', async () => {
    const error = await errorDe(404, { detail: 'No encontrado.' })

    expect(error.message).toBe('No encontrado.')
    expect(error.campos).toBeUndefined()
  })

  it.each([
    ['a string', 'nombre'],
    ['an array', ['nombre']],
    ['null', null],
  ])('ignores campos when it is %s', async (_nombre, campos) => {
    const error = await errorDe(400, { error: 'Datos inválidos.', campos })

    expect(error.campos).toBeUndefined()
  })

  it('drops entries that are not arrays of strings and keeps the valid ones', async () => {
    const error = await errorDe(400, {
      error: 'Datos inválidos.',
      campos: { nombre: ['Este campo es requerido.'], tipo: 'texto', etapa: [1, 2], mixto: ['ok', 3] },
    })

    expect(error.campos).toEqual({ nombre: ['Este campo es requerido.'] })
  })

  it('leaves campos undefined when no entry is valid', async () => {
    const error = await errorDe(400, { error: 'Datos inválidos.', campos: { tipo: 'texto' } })

    expect(error.campos).toBeUndefined()
  })
})
