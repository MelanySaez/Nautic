import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClient, ApiError } from '../../shared/http/apiClient'
import { HttpCuentasRepository } from './HttpCuentasRepository'

const usuarioDto = { id: 5, email: 'ana@nautic.test', nombre: 'Ana Ruiz', cargo: 'Inspectora', es_admin: false }
const usuario = { id: 5, email: 'ana@nautic.test', nombre: 'Ana Ruiz', cargo: 'Inspectora', esAdmin: false }

function respuesta(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('HttpCuentasRepository', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const repo = new HttpCuentasRepository('http://api.test', fetchMock, () => 'csrftoken=tok')

  beforeEach(() => fetchMock.mockReset())

  function llamada(indice: number) {
    const [url, init] = fetchMock.mock.calls[indice]
    return { url: String(url), init: init ?? {} }
  }

  it('maps the current user', async () => {
    fetchMock.mockResolvedValue(respuesta(200, usuarioDto))

    expect(await repo.obtenerActual()).toEqual(usuario)
    expect(llamada(0).url).toBe('http://api.test/api/auth/yo/')
  })

  it('answers null when there is no session', async () => {
    fetchMock.mockResolvedValue(respuesta(401, { detail: 'No autenticado.' }))

    expect(await repo.obtenerActual()).toBeNull()
  })

  it('rejects other errors when loading the current user', async () => {
    fetchMock.mockResolvedValue(respuesta(500))

    await expect(repo.obtenerActual()).rejects.toBeInstanceOf(ApiError)
  })

  it('fetches the CSRF cookie and then logs in', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(204)).mockResolvedValueOnce(respuesta(200, usuarioDto))

    expect(await repo.iniciarSesion('ana@nautic.test', 'secreta123')).toEqual(usuario)
    expect(llamada(0).url).toBe('http://api.test/api/auth/csrf/')
    expect(llamada(1).url).toBe('http://api.test/api/auth/login/')
    expect(llamada(1).init.method).toBe('POST')
    expect(JSON.parse(String(llamada(1).init.body))).toEqual({ email: 'ana@nautic.test', password: 'secreta123' })
    expect((llamada(1).init.headers as Record<string, string>)['X-CSRFToken']).toBe('tok')
  })

  it('registers sending a blank cargo when none is given', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(204)).mockResolvedValueOnce(respuesta(201, usuarioDto))

    expect(await repo.registrarse({ email: 'ana@nautic.test', password: 'secreta123', nombre: 'Ana Ruiz' })).toEqual(usuario)
    expect(llamada(0).url).toBe('http://api.test/api/auth/csrf/')
    expect(llamada(1).url).toBe('http://api.test/api/auth/registro/')
    expect(JSON.parse(String(llamada(1).init.body))).toEqual({
      email: 'ana@nautic.test',
      password: 'secreta123',
      nombre: 'Ana Ruiz',
      cargo: '',
    })
  })

  it('keeps the field errors of a rejected registration', async () => {
    fetchMock
      .mockResolvedValueOnce(respuesta(204))
      .mockResolvedValueOnce(respuesta(400, { error: 'Datos inválidos.', campos: { email: ['Ya existe una cuenta con ese email.'] } }))

    const error = await repo.registrarse({ email: 'ana@nautic.test', password: 'x', nombre: 'Ana' }).catch((e: unknown) => e)

    expect((error as ApiError).campos).toEqual({ email: ['Ya existe una cuenta con ese email.'] })
  })

  it('logs out', async () => {
    fetchMock.mockResolvedValue(respuesta(204))

    await repo.cerrarSesion()

    expect(llamada(0)).toMatchObject({ url: 'http://api.test/api/auth/logout/', init: { method: 'POST' } })
  })

  it('notifies an expired session when any request answers 401', async () => {
    const oyente = vi.fn()
    const quitar = repo.alExpirarSesion(oyente)
    fetchMock.mockResolvedValue(respuesta(401, { detail: 'No autenticado.' }))

    await new ApiClient('http://api.test', fetchMock).get('/api/buques/').catch(() => {})
    quitar()

    expect(oyente).toHaveBeenCalledTimes(1)
  })
})
