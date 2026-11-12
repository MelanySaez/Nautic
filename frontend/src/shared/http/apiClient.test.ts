import { describe, expect, it, vi } from 'vitest'
import { alNoAutorizado, ApiClient, ApiError } from './apiClient'

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

describe('ApiClient session and CSRF', () => {
  function cliente(cookies = '') {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(respuesta(200, {}))
    return { fetchMock, api: new ApiClient('http://api.test', fetchMock, () => cookies) }
  }

  function cabeceras(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>): Record<string, string> {
    return (fetchMock.mock.calls.at(-1)![1]?.headers ?? {}) as Record<string, string>
  }

  it('sends the session cookies on every request', async () => {
    const { fetchMock, api } = cliente()

    await api.get('/api/x/')

    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('same-origin')
  })

  it.each([
    ['POST', (api: ApiClient) => api.post('/api/x/', { a: 1 })],
    ['POST (form)', (api: ApiClient) => api.post('/api/x/', new FormData())],
    ['PATCH', (api: ApiClient) => api.patch('/api/x/', { a: 1 })],
    ['DELETE', (api: ApiClient) => api.delete('/api/x/')],
  ])('sends the csrftoken cookie as X-CSRFToken on %s', async (_metodo, llamar) => {
    const { fetchMock, api } = cliente('tema=oscuro; csrftoken=abc123; otra=1')

    await llamar(api)

    expect(cabeceras(fetchMock)['X-CSRFToken']).toBe('abc123')
  })

  it('keeps the JSON content type next to the CSRF header', async () => {
    const { fetchMock, api } = cliente('csrftoken=abc123')

    await api.patch('/api/x/', { a: 1 })

    expect(cabeceras(fetchMock)).toEqual({ 'Content-Type': 'application/json', 'X-CSRFToken': 'abc123' })
  })

  it('does not send X-CSRFToken on GET', async () => {
    const { fetchMock, api } = cliente('csrftoken=abc123')

    await api.get('/api/x/')

    expect(cabeceras(fetchMock)['X-CSRFToken']).toBeUndefined()
  })

  it('fetches the CSRF cookie from the auth endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(respuesta(204))
    const api = new ApiClient('http://api.test', fetchMock, () => '')

    await api.prepararCsrf()

    expect(String(fetchMock.mock.calls[0][0])).toBe('http://api.test/api/auth/csrf/')
  })

  it('notifies the 401 listeners and still rejects', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(respuesta(401, { detail: 'No autenticado.' }))
    const api = new ApiClient('http://api.test', fetchMock, () => '')
    const listener = vi.fn()
    const quitar = alNoAutorizado(listener)

    const error = await api.get('/api/x/').catch((e: unknown) => e)
    quitar()
    await api.get('/api/x/').catch(() => {})

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(401)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not notify on other errors', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(respuesta(403, { detail: 'Sin permiso.' }))
    const api = new ApiClient('http://api.test', fetchMock, () => '')
    const listener = vi.fn()
    const quitar = alNoAutorizado(listener)

    await api.get('/api/x/').catch(() => {})
    quitar()

    expect(listener).not.toHaveBeenCalled()
  })
})
