import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/http/apiClient'
import { HttpInspeccionesRepository } from './HttpInspeccionesRepository'

const BASE = 'http://api.test'

const seccionDto = { id: 3, codigo: 'KEEL', nombre: 'Quilla', descripcion: '', orden: 9 }
const inspeccionDto = {
  id: 7,
  buque_id: 2,
  buque_nombre: 'ARA Libertad',
  nombre: 'Inspección #7 — ARA Libertad',
  severidad_max: 'high',
  descripcion: 'Control anual',
  tomado_por: 'Juan Gómez',
  fecha_creacion: '2026-10-01T10:00:00Z',
  fecha_modificacion: '2026-10-02T10:00:00Z',
  total_fotos: 1,
}
const fotoDto = {
  id: 11,
  seccion: seccionDto,
  imagen_original: 'http://api.test/media/inspecciones/originales/a.jpg',
  imagen_anotada: null,
  detecciones: null,
  tiempo_inferencia_ms: null,
  severidad: null,
  estado: 'pendiente',
  error_detalle: null,
  modelo: 'yolo-seg',
  modelo_version: '1.2.0',
  taxonomia_version: '2026.1',
  fecha_creacion: '2026-10-01T10:05:00Z',
}

function respuesta(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('HttpInspeccionesRepository', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const repo = new HttpInspeccionesRepository(BASE, fetchMock)

  beforeEach(() => {
    fetchMock.mockReset()
  })

  function ultimaLlamada() {
    const [url, init] = fetchMock.mock.calls.at(-1)!
    return { url: String(url), init: init ?? {} }
  }

  it('searches sending the filters as query parameters and maps the page', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { resultados: [inspeccionDto], siguiente: 'abc', hay_mas: true }))

    const pagina = await repo.buscar({
      buqueId: 2,
      desde: '2026-10-01',
      hasta: '2026-10-31',
      severidadMin: 'high',
      q: 'casco',
    })

    expect(ultimaLlamada().url).toBe(
      'http://api.test/api/vision/inspecciones/?buque=2&desde=2026-10-01&hasta=2026-10-31&severidad_min=high&q=casco&limit=24',
    )
    expect(pagina.siguiente).toBe('abc')
    expect(pagina.hayMas).toBe(true)
    expect(pagina.resultados).toEqual([
      {
        id: 7,
        buqueId: 2,
        buqueNombre: 'ARA Libertad',
        nombre: 'Inspección #7 — ARA Libertad',
        severidadMax: 'high',
        descripcion: 'Control anual',
        tomadoPor: 'Juan Gómez',
        fechaCreacion: '2026-10-01T10:00:00Z',
        fechaModificacion: '2026-10-02T10:00:00Z',
        totalFotos: 1,
      },
    ])
  })

  it('passes the cursor untouched to get the next page and omits blank filters', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { resultados: [], siguiente: null, hay_mas: false }))

    const pagina = await repo.buscar({ q: '  ' }, 'abc+/=&x')

    expect(ultimaLlamada().url).toBe('http://api.test/api/vision/inspecciones/?limit=24&cursor=abc%2B%2F%3D%26x')
    expect(pagina).toEqual({ resultados: [], siguiente: null, hayMas: false })
  })

  it('surfaces the field errors of a rejected search', async () => {
    fetchMock.mockResolvedValue(
      respuesta(400, { error: 'Datos inválidos.', campos: { q: ['Debe tener entre 2 y 100 caracteres.'] } }),
    )

    await expect(repo.buscar({ q: 'a' })).rejects.toMatchObject({
      status: 400,
      campos: { q: ['Debe tener entre 2 y 100 caracteres.'] },
    })
  })

  it('gets the inspection detail with its photos, treating missing detections as empty', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { ...inspeccionDto, fotos: [fotoDto] }))

    const detalle = await repo.obtener(7)

    expect(ultimaLlamada().url).toBe('http://api.test/api/vision/inspecciones/7/')
    expect(detalle.fotos[0]).toEqual({
      id: 11,
      seccion: seccionDto,
      imagenOriginal: 'http://api.test/media/inspecciones/originales/a.jpg',
      imagenAnotada: null,
      detecciones: [],
      tiempoInferenciaMs: null,
      severidad: null,
      estado: 'pendiente',
      errorDetalle: null,
      modelo: 'yolo-seg',
      modeloVersion: '1.2.0',
      taxonomiaVersion: '2026.1',
      fechaCreacion: '2026-10-01T10:05:00Z',
    })
  })

  it('maps grouped detections', async () => {
    fetchMock.mockResolvedValue(
      respuesta(200, {
        ...inspeccionDto,
        fotos: [{ ...fotoDto, detecciones: [{ class_name: 'corrosion', count: 2, max_confidence: 0.92 }] }],
      }),
    )

    const detalle = await repo.obtener(7)

    expect(detalle.fotos[0].detecciones).toEqual([{ clase: 'corrosion', cantidad: 2, confianzaMaxima: 0.92 }])
  })

  it('creates an inspection sending the snake_case payload', async () => {
    fetchMock.mockResolvedValue(respuesta(201, inspeccionDto))

    const creada = await repo.crear({
      buqueId: 2,
      nombre: 'Control anual 2026',
      tomadoPor: 'Juan Gómez',
      descripcion: 'Control anual',
    })

    const { url, init } = ultimaLlamada()
    expect(url).toBe('http://api.test/api/vision/inspecciones/')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      buque_id: 2,
      nombre: 'Control anual 2026',
      tomado_por: 'Juan Gómez',
      descripcion: 'Control anual',
    })
    expect(creada.id).toBe(7)
  })

  it('renames an inspection with a PATCH carrying only the name', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { ...inspeccionDto, nombre: 'Casco proa', fotos: [] }))

    const renombrada = await repo.renombrar(7, '  Casco proa ')

    const { url, init } = ultimaLlamada()
    expect(url).toBe('http://api.test/api/vision/inspecciones/7/')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ nombre: 'Casco proa' })
    expect(renombrada.nombre).toBe('Casco proa')
  })

  it('deletes an inspection', async () => {
    fetchMock.mockResolvedValue(respuesta(204))

    await repo.eliminar(7)

    expect(ultimaLlamada()).toMatchObject({
      url: 'http://api.test/api/vision/inspecciones/7/',
      init: { method: 'DELETE' },
    })
  })

  it('lists the hull sections of one vessel', async () => {
    fetchMock.mockResolvedValue(respuesta(200, [seccionDto]))

    expect(await repo.listarSecciones(2)).toEqual([seccionDto])
    expect(ultimaLlamada().url).toBe('http://api.test/api/vision/secciones/?buque=2')
  })

  it('uploads a photo as multipart form data', async () => {
    fetchMock.mockResolvedValue(respuesta(202, fotoDto))
    const imagen = new File(['bytes'], 'keel.jpg', { type: 'image/jpeg' })

    const foto = await repo.subirFoto(7, 3, imagen)

    const { url, init } = ultimaLlamada()
    expect(url).toBe('http://api.test/api/vision/inspecciones/7/fotos/')
    expect(init.method).toBe('POST')
    const body = init.body as FormData
    expect(body.get('seccion_id')).toBe('3')
    expect((body.get('imagen') as File).name).toBe('keel.jpg')
    expect(foto.id).toBe(11)
  })

  it('starts the analysis of pending photos', async () => {
    fetchMock.mockResolvedValue(respuesta(202, { iniciadas: 3, omitidas_por_limite: 1 }))

    expect(await repo.analizar(7)).toEqual({ iniciadas: 3, omitidasPorLimite: 1 })
    expect(ultimaLlamada()).toMatchObject({
      url: 'http://api.test/api/vision/inspecciones/7/analizar/',
      init: { method: 'POST' },
    })
  })

  it('sends the chosen model when analyzing and only then', async () => {
    fetchMock.mockImplementation(async () => respuesta(202, { iniciadas: 1, omitidas_por_limite: 0 }))

    await repo.analizar(7, 'rtdetr')
    expect(JSON.parse(String(ultimaLlamada().init.body))).toEqual({ modelo: 'rtdetr' })

    await repo.analizar(7)
    expect(ultimaLlamada().init.body).toBeUndefined()
  })

  it('sends the chosen model when retrying a photo', async () => {
    fetchMock.mockResolvedValue(respuesta(202, fotoDto))

    await repo.reintentarFoto(11, 'maskrcnn')

    expect(JSON.parse(String(ultimaLlamada().init.body))).toEqual({ modelo: 'maskrcnn' })
  })

  it('surfaces the field errors of a rejected model', async () => {
    fetchMock.mockResolvedValue(
      respuesta(400, { error: 'Datos inválidos.', campos: { modelo: ['Modelo desconocido.'] } }),
    )

    await expect(repo.analizar(7, 'x')).rejects.toMatchObject({ status: 400, campos: { modelo: ['Modelo desconocido.'] } })
  })

  it('retries and deletes a single photo', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(202, fotoDto)).mockResolvedValueOnce(respuesta(204))

    await repo.reintentarFoto(11)
    expect(ultimaLlamada()).toMatchObject({ url: 'http://api.test/api/vision/fotos/11/', init: { method: 'POST' } })

    await repo.eliminarFoto(11)
    expect(ultimaLlamada()).toMatchObject({ url: 'http://api.test/api/vision/fotos/11/', init: { method: 'DELETE' } })
  })

  it('surfaces the backend `error` message', async () => {
    fetchMock.mockResolvedValue(respuesta(400, { error: 'No hay fotos pendientes de análisis.' }))

    const fallo = repo.analizar(7)

    await expect(fallo).rejects.toBeInstanceOf(ApiError)
    await expect(fallo).rejects.toMatchObject({ status: 400, message: 'No hay fotos pendientes de análisis.' })
  })

  it('surfaces the DRF `detail` message', async () => {
    fetchMock.mockResolvedValue(respuesta(404, { detail: 'No encontrado.' }))

    await expect(repo.obtener(99)).rejects.toMatchObject({ status: 404, message: 'No encontrado.' })
  })

  it('uses a generic message when the response has no readable error', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Server Error</html>', { status: 500 }))

    await expect(repo.buscar({})).rejects.toMatchObject({
      status: 500,
      message: 'El servidor respondió con un error (500).',
    })
  })

  it('reports a network failure without leaking the raw error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(repo.buscar({})).rejects.toMatchObject({
      status: 0,
      message: 'No se pudo conectar con el servidor.',
    })
  })
})
