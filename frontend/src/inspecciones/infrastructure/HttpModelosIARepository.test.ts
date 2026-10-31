import { describe, expect, it, vi } from 'vitest'
import { HttpModelosIARepository } from './HttpModelosIARepository'

const modeloDto = {
  id: 'yolo-seg',
  label: 'YOLO segmentación',
  descripcion: 'Detecta y segmenta daños del casco.',
  arquitectura: 'yolo',
  version: '1.2.0',
  produce_mascaras: true,
  confianza_por_defecto: 0.25,
  por_defecto: true,
  disponible: false,
}

describe('HttpModelosIARepository', () => {
  it('lists the model catalog mapped to the domain model', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ modelos: [modeloDto] })))
    const repo = new HttpModelosIARepository('http://api.test', fetchMock)

    const modelos = await repo.listar()

    expect(String(fetchMock.mock.calls[0][0])).toBe('http://api.test/api/vision/modelos/')
    expect(modelos).toEqual([
      {
        id: 'yolo-seg',
        label: 'YOLO segmentación',
        descripcion: 'Detecta y segmenta daños del casco.',
        arquitectura: 'yolo',
        version: '1.2.0',
        produceMascaras: true,
        confianzaPorDefecto: 0.25,
        porDefecto: true,
        disponible: false,
      },
    ])
  })
})
