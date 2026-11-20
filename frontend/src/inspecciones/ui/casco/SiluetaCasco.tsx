import { useMemo } from 'react'
import type { Arquetipo } from '../../../buques/domain/casco/arquetipo'
import type { DimensionesCasco } from '../../../buques/domain/casco/dimensiones'
import { perfilLateral } from '../../../buques/domain/casco/perfil'

/** Starboard side silhouette of the generated hull, with its design waterline. */
export function SiluetaCasco({
  nombreBuque,
  dimensiones,
  arquetipo,
}: {
  nombreBuque: string
  dimensiones: DimensionesCasco
  arquetipo: Arquetipo
}) {
  const { d, ancho, alto } = useMemo(() => perfilLateral(dimensiones, arquetipo), [dimensiones, arquetipo])
  // The profile puts y = 0 at the top of the tallest piece; the keel baseline sits at y = alto.
  const flotacion = alto - dimensiones.calado

  return (
    <svg
      role="img"
      aria-label={`Silueta del casco de ${nombreBuque}`}
      viewBox={`0 0 ${ancho} ${alto}`}
      className="h-auto max-h-full w-full text-ink-dim"
    >
      <path d={d} fill="currentColor" fillOpacity={0.25} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <line
        x1={0}
        x2={ancho}
        y1={flotacion}
        y2={flotacion}
        className="text-info"
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="1.5 1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
