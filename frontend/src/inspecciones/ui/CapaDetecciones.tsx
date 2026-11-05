import { useEffect, useRef } from 'react'
import { decodificarRle, type DetallePorInstancia, type Instancia } from '../domain/detecciones'

const COLOR_POR_DEFECTO = '#ffffff'
const OPACIDAD_MASCARA = 0.4

function rgb(hex: string): [number, number, number] {
  const valor = Number.parseInt(hex.replace('#', ''), 16)
  return [(valor >> 16) & 255, (valor >> 8) & 255, valor & 255]
}

function pintar(lienzo: HTMLCanvasElement, ancho: number, alto: number, instancias: Instancia[]) {
  const contexto = lienzo.getContext('2d')
  // No 2D context (e.g. jsdom in tests): nothing to draw.
  if (!contexto) return
  contexto.clearRect(0, 0, ancho, alto)
  const pixeles = contexto.createImageData(ancho, alto)
  for (const instancia of instancias) {
    if (!instancia.mascara || instancia.mascara.alto !== alto || instancia.mascara.ancho !== ancho) continue
    const [r, g, b] = rgb(instancia.color ?? COLOR_POR_DEFECTO)
    let mascara: Uint8Array
    try {
      mascara = decodificarRle(instancia.mascara)
    } catch {
      continue
    }
    for (let i = 0; i < mascara.length; i++) {
      if (!mascara[i]) continue
      pixeles.data[i * 4] = r
      pixeles.data[i * 4 + 1] = g
      pixeles.data[i * 4 + 2] = b
      pixeles.data[i * 4 + 3] = Math.round(255 * OPACIDAD_MASCARA)
    }
  }
  contexto.putImageData(pixeles, 0, 0)
  contexto.lineWidth = Math.max(2, Math.round(Math.max(ancho, alto) / 300))
  for (const { caja, color } of instancias) {
    contexto.strokeStyle = color ?? COLOR_POR_DEFECTO
    contexto.strokeRect(caja.x1, caja.y1, caja.x2 - caja.x1, caja.y2 - caja.y1)
  }
}

/** Canvas in the original image's pixel space; the parent stretches it over the image. */
export function CapaDetecciones({ detalle, instancias }: { detalle: DetallePorInstancia; instancias: Instancia[] }) {
  const lienzo = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (lienzo.current) pintar(lienzo.current, detalle.ancho, detalle.alto, instancias)
  }, [detalle, instancias])

  return (
    <canvas
      ref={lienzo}
      width={detalle.ancho}
      height={detalle.alto}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  )
}
