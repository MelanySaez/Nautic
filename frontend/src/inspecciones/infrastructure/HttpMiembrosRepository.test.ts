import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpMiembrosRepository } from './HttpMiembrosRepository'

const miembroDto = {
  id: 9,
  usuario: { id: 4, nombre: 'Ana Ruiz', email: 'ana@nautic.test', cargo: 'Inspectora' },
  rol: 'revisor',
  permisos: { subir_fotos: false, analizar: false, editar_reporte: true, editar_inspeccion: false },
  fecha_agregado: '2026-11-01T10:00:00Z',
}
const miembro = {
  id: 9,
  usuario: { id: 4, nombre: 'Ana Ruiz', email: 'ana@nautic.test', cargo: 'Inspectora' },
  rol: 'revisor',
  permisos: { subirFotos: false, analizar: false, editarReporte: true, editarInspeccion: false },
  fechaAgregado: '2026-11-01T10:00:00Z',
}

function respuesta(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('HttpMiembrosRepository', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const repo = new HttpMiembrosRepository('http://api.test', fetchMock)

  beforeEach(() => fetchMock.mockReset())

  function ultimaLlamada() {
    const [url, init] = fetchMock.mock.calls.at(-1)!
    return { url: String(url), init: init ?? {} }
  }

  it('lists the members of an inspection', async () => {
    fetchMock.mockResolvedValue(respuesta(200, [miembroDto]))

    expect(await repo.listar(7)).toEqual([miembro])
    expect(ultimaLlamada().url).toBe('http://api.test/api/vision/inspecciones/7/miembros/')
  })

  it('invites a member by email with a role template', async () => {
    fetchMock.mockResolvedValue(respuesta(201, miembroDto))

    expect(await repo.invitar(7, { email: ' ana@nautic.test ', rol: 'revisor' })).toEqual(miembro)
    const { url, init } = ultimaLlamada()
    expect(url).toBe('http://api.test/api/vision/inspecciones/7/miembros/')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ email: 'ana@nautic.test', rol: 'revisor' })
  })

  it('changes a role', async () => {
    fetchMock.mockResolvedValue(respuesta(200, miembroDto))

    await repo.actualizar(7, 9, { rol: 'observador' })

    const { url, init } = ultimaLlamada()
    expect(url).toBe('http://api.test/api/vision/inspecciones/7/miembros/9/')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ rol: 'observador' })
  })

  it('sends only the permissions that change, in snake_case', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { ...miembroDto, rol: 'personalizado' }))

    const actualizado = await repo.actualizar(7, 9, { permisos: { subirFotos: true } })

    expect(JSON.parse(String(ultimaLlamada().init.body))).toEqual({ permisos: { subir_fotos: true } })
    expect(actualizado.rol).toBe('personalizado')
  })

  it('removes a member', async () => {
    fetchMock.mockResolvedValue(respuesta(204))

    await repo.quitar(7, 9)

    expect(ultimaLlamada()).toMatchObject({
      url: 'http://api.test/api/vision/inspecciones/7/miembros/9/',
      init: { method: 'DELETE' },
    })
  })
})
