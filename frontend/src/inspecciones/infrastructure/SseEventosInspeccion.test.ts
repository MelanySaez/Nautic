import { describe, expect, it, vi } from 'vitest'
import type { EventoInspeccion } from '../domain/inspeccion'
import { SseEventosInspeccion, type FuenteEventos } from './SseEventosInspeccion'

class FuenteFalsa implements FuenteEventos {
  readonly url: string
  cerrada = false
  private readonly oyentes = new Map<string, (e: MessageEvent) => void>()

  constructor(url: string) {
    this.url = url
  }

  addEventListener(tipo: string, oyente: (e: MessageEvent) => void) {
    this.oyentes.set(tipo, oyente)
  }

  close() {
    this.cerrada = true
  }

  emitir(tipo: string, datos: string) {
    this.oyentes.get(tipo)?.(new MessageEvent(tipo, { data: datos }))
  }
}

const fotoDto = {
  id: 11,
  seccion: { id: 3, codigo: 'KEEL', nombre: 'Quilla', descripcion: '', orden: 9 },
  imagen_original: 'http://api.test/media/a.jpg',
  imagen_anotada: null,
  detecciones: null,
  tiempo_inferencia_ms: null,
  severidad: null,
  estado: 'pendiente',
  error_detalle: null,
  fecha_creacion: '2026-10-01T10:05:00Z',
}

function suscribir() {
  let fuente: FuenteFalsa | undefined
  const eventos = new SseEventosInspeccion('http://api.test', (url) => (fuente = new FuenteFalsa(url)))
  const recibidos: EventoInspeccion[] = []
  const cancelar = eventos.suscribir(7, (e) => recibidos.push(e))
  return { fuente: fuente!, recibidos, cancelar }
}

describe('SseEventosInspeccion', () => {
  it('opens the stream of the inspection', () => {
    expect(suscribir().fuente.url).toBe('http://api.test/api/vision/inspecciones/7/stream/')
  })

  it('maps a created photo', () => {
    const { fuente, recibidos } = suscribir()

    fuente.emitir('foto-created', JSON.stringify({ foto: fotoDto }))

    expect(recibidos).toHaveLength(1)
    expect(recibidos[0]).toMatchObject({ tipo: 'foto-creada', foto: { id: 11, estado: 'pendiente', detecciones: [] } })
  })

  it('maps an update and resolves the raw annotated image path to a URL', () => {
    const { fuente, recibidos } = suscribir()

    fuente.emitir(
      'foto-updated',
      JSON.stringify({
        foto_id: 11,
        inspeccion_id: 7,
        estado: 'completada',
        severidad: 'high',
        detecciones: [{ class_name: 'corrosion', count: 1, max_confidence: 0.81 }],
        tiempo_inferencia_ms: 950,
        imagen_anotada: 'media/inspecciones/anotadas/a.jpg',
        error_detalle: null,
      }),
    )

    expect(recibidos).toEqual([
      {
        tipo: 'foto-actualizada',
        actualizacion: {
          fotoId: 11,
          estado: 'completada',
          severidad: 'high',
          detecciones: [{ clase: 'corrosion', cantidad: 1, confianzaMaxima: 0.81 }],
          tiempoInferenciaMs: 950,
          imagenAnotada: 'http://api.test/media/inspecciones/anotadas/a.jpg',
          errorDetalle: null,
        },
      },
    ])
  })

  it('maps a deleted photo', () => {
    const { fuente, recibidos } = suscribir()

    fuente.emitir('foto-deleted', JSON.stringify({ foto_id: 11, inspeccion_id: 7 }))

    expect(recibidos).toEqual([{ tipo: 'foto-eliminada', fotoId: 11 }])
  })

  it('ignores malformed payloads instead of crashing', () => {
    const { fuente, recibidos } = suscribir()
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})

    fuente.emitir('foto-updated', 'not json')

    expect(recibidos).toEqual([])
    expect(aviso).toHaveBeenCalled()
  })

  it('closes the stream when the subscription is cancelled', () => {
    const { fuente, cancelar } = suscribir()

    cancelar()

    expect(fuente.cerrada).toBe(true)
  })
})
