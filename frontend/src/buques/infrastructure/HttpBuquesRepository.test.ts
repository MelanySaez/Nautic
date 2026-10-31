import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/http/apiClient'
import { HttpBuquesRepository } from './HttpBuquesRepository'

const BASE = 'http://api.test'

const resumenDto = {
  id: 1,
  nombre: 'ARC Caribe',
  tipo: 'Fragata',
  etapa: 'En construcción',
  imagen: 'caribe.png',
  created_at: '2026-10-28T22:41:07.512903',
  updated_at: '2026-10-28T22:41:08.000000',
}
const detalleDto = {
  id: 1,
  nombre: 'ARC Caribe',
  tipo: 'Fragata',
  descripcion: 'Buque de prueba',
  autonomia_horas: 120,
  vida_diseno_anios: null,
  horas_navegacion_anio: null,
  imagen: 'caribe.png',
  etapa: 'En construcción',
  rondas_config: { intervalo: 4 },
  documentos: [{ nombre: 'plano.pdf' }],
  vel_maxima_nudos: null,
  autonomia_dias: null,
  alcance_nm_a_12kn: null,
  eslora_total_m: 110.5,
  manga_moldeada_m: null,
  puntal_m: null,
  calado_diseno_m: null,
  desplazamiento_ton: 1900,
  combustible_diario_m3: null,
  combustible_diesel_m3: null,
  combustible_helicoptero_m3: null,
  gasolina_botes_m3: null,
  agua_potable_m3: null,
  aceite_lubricante_m3: null,
  aceite_hidraulico_m3: 2.5,
  contexto_operacional: { zona: 'Caribe' },
  misiones: ['patrulla'],
  grupos_constructivos: [{ codigo: '100' }],
  secciones: [{ id: 3, codigo: 'KEEL', nombre: 'Quilla', descripcion: '', orden: 0 }],
  created_at: '2026-10-28T22:41:07.512903',
  updated_at: '2026-10-28T22:41:08.000000',
}

function respuesta(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function pagina(total: number, offset: number, resultados: unknown[]) {
  return { total, offset, limit: 200, resultados }
}

describe('HttpBuquesRepository', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const repo = new HttpBuquesRepository(BASE, fetchMock)

  beforeEach(() => {
    fetchMock.mockReset()
  })

  function llamada(indice: number) {
    const [url, init] = fetchMock.mock.calls.at(indice)!
    return { url: String(url), init: init ?? {} }
  }

  describe('listar', () => {
    it('requests the first page with the maximum limit and maps summaries to the domain model', async () => {
      fetchMock.mockResolvedValue(respuesta(200, pagina(2, 0, [resumenDto, { ...resumenDto, id: 2, imagen: null }])))

      const buques = await repo.listar()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(llamada(0).url).toBe('http://api.test/api/buques/?offset=0&limit=200')
      expect(buques).toEqual([
        {
          id: 1,
          nombre: 'ARC Caribe',
          tipo: 'Fragata',
          etapa: 'En construcción',
          imagen: 'caribe.png',
          createdAt: '2026-10-28T22:41:07.512903',
          updatedAt: '2026-10-28T22:41:08.000000',
        },
        expect.objectContaining({ id: 2, imagen: null }),
      ])
    })

    it('returns an empty list when there are no vessels', async () => {
      fetchMock.mockResolvedValue(respuesta(200, pagina(0, 0, [])))

      expect(await repo.listar()).toEqual([])
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('walks every page until the offset reaches the total, keeping the order', async () => {
      const primera = Array.from({ length: 200 }, (_, i) => ({ ...resumenDto, id: i + 1 }))
      fetchMock
        .mockResolvedValueOnce(respuesta(200, pagina(201, 0, primera)))
        .mockResolvedValueOnce(respuesta(200, pagina(201, 200, [{ ...resumenDto, id: 201 }])))

      const buques = await repo.listar()

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(llamada(0).url).toBe('http://api.test/api/buques/?offset=0&limit=200')
      expect(llamada(1).url).toBe('http://api.test/api/buques/?offset=200&limit=200')
      expect(buques).toHaveLength(201)
      expect(buques.at(0)?.id).toBe(1)
      expect(buques.at(-1)?.id).toBe(201)
    })

    it('stops when a page comes back empty even if the total was not reached', async () => {
      fetchMock.mockResolvedValue(respuesta(200, pagina(500, 0, [])))

      expect(await repo.listar()).toEqual([])
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('surfaces the server error message', async () => {
      fetchMock.mockResolvedValue(respuesta(400, { error: 'offset debe ser un entero >= 0.' }))

      await expect(repo.listar()).rejects.toMatchObject({ status: 400, message: 'offset debe ser un entero >= 0.' })
    })
  })

  describe('obtener', () => {
    it('gets the technical sheet and maps every field to camelCase, keeping nulls and JSON fields', async () => {
      fetchMock.mockResolvedValue(respuesta(200, detalleDto))

      const detalle = await repo.obtener(1)

      expect(llamada(0).url).toBe('http://api.test/api/buques/1/')
      expect(detalle).toEqual({
        id: 1,
        nombre: 'ARC Caribe',
        tipo: 'Fragata',
        descripcion: 'Buque de prueba',
        etapa: 'En construcción',
        imagen: 'caribe.png',
        autonomiaHoras: 120,
        vidaDisenoAnios: null,
        horasNavegacionAnio: null,
        autonomiaDias: null,
        velMaximaNudos: null,
        alcanceNmA12kn: null,
        esloraTotalM: 110.5,
        mangaMoldeadaM: null,
        puntalM: null,
        caladoDisenoM: null,
        desplazamientoTon: 1900,
        combustibleDiarioM3: null,
        combustibleDieselM3: null,
        combustibleHelicopteroM3: null,
        gasolinaBotesM3: null,
        aguaPotableM3: null,
        aceiteLubricanteM3: null,
        aceiteHidraulicoM3: 2.5,
        rondasConfig: { intervalo: 4 },
        contextoOperacional: { zona: 'Caribe' },
        documentos: [{ nombre: 'plano.pdf' }],
        misiones: ['patrulla'],
        gruposConstructivos: [{ codigo: '100' }],
        secciones: [{ id: 3, codigo: 'KEEL', nombre: 'Quilla', descripcion: '', orden: 0 }],
        createdAt: '2026-10-28T22:41:07.512903',
        updatedAt: '2026-10-28T22:41:08.000000',
      })
    })

    it('rejects with the status and detail of a 404', async () => {
      fetchMock.mockResolvedValue(respuesta(404, { detail: 'No encontrado.' }))

      const error = await repo.obtener(99).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ status: 404, message: 'No encontrado.' })
    })

    it('rejects with a connection error when the network fails', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

      await expect(repo.obtener(1)).rejects.toMatchObject({ status: 0, message: 'No se pudo conectar con el servidor.' })
    })
  })

  describe('crear', () => {
    it('posts only the provided fields in snake_case and returns the created sheet', async () => {
      fetchMock.mockResolvedValue(respuesta(201, detalleDto))

      const creado = await repo.crear({
        nombre: 'ARC Caribe',
        tipo: 'Fragata',
        etapa: 'En construcción',
        esloraTotalM: 110.5,
        autonomiaHoras: 0,
        aceiteHidraulicoM3: null,
      })

      const { url, init } = llamada(0)
      expect(url).toBe('http://api.test/api/buques/')
      expect(init.method).toBe('POST')
      expect(JSON.parse(String(init.body))).toEqual({
        nombre: 'ARC Caribe',
        tipo: 'Fragata',
        etapa: 'En construcción',
        eslora_total_m: 110.5,
        autonomia_horas: 0,
        aceite_hidraulico_m3: null,
      })
      expect(creado.id).toBe(1)
      expect(creado.esloraTotalM).toBe(110.5)
    })

    it('omits undefined and blank optionals so the backend applies its defaults', async () => {
      fetchMock.mockResolvedValue(respuesta(201, detalleDto))

      await repo.crear({ nombre: 'Lancha', tipo: 'Patrullera', etapa: '', descripcion: '', imagen: '', puntalM: undefined })

      expect(JSON.parse(String(llamada(0).init.body))).toEqual({ nombre: 'Lancha', tipo: 'Patrullera' })
    })

    it('sends the free-form JSON fields untouched', async () => {
      fetchMock.mockResolvedValue(respuesta(201, detalleDto))

      await repo.crear({ nombre: 'Lancha', tipo: 'Patrullera', misiones: [], rondasConfig: { intervalo: 4 } })

      expect(JSON.parse(String(llamada(0).init.body))).toEqual({
        nombre: 'Lancha',
        tipo: 'Patrullera',
        misiones: [],
        rondas_config: { intervalo: 4 },
      })
    })

    it('sends a custom section list in order and drops blank codes and descriptions', async () => {
      fetchMock.mockResolvedValue(respuesta(201, detalleDto))

      await repo.crear({
        nombre: 'Lancha',
        tipo: 'Patrullera',
        secciones: [
          { nombre: 'Proa', codigo: 'PRW', descripcion: 'Parte delantera' },
          { nombre: 'Popa', codigo: '', descripcion: '' },
        ],
      })

      expect(JSON.parse(String(llamada(0).init.body))).toEqual({
        nombre: 'Lancha',
        tipo: 'Patrullera',
        secciones: [{ nombre: 'Proa', codigo: 'PRW', descripcion: 'Parte delantera' }, { nombre: 'Popa' }],
      })
    })

    it('rejects with ApiError carrying the field errors of a 400', async () => {
      fetchMock.mockResolvedValue(
        respuesta(400, {
          error: 'Datos inválidos.',
          campos: { nombre: ['Este campo es requerido.'], puntal_m: ['No puede ser negativo.'] },
        }),
      )

      const error = await repo.crear({ nombre: '', tipo: 'Fragata', puntalM: -1 }).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({
        status: 400,
        message: 'Datos inválidos.',
        campos: { nombre: ['Este campo es requerido.'], puntal_m: ['No puede ser negativo.'] },
      })
    })
  })
})
