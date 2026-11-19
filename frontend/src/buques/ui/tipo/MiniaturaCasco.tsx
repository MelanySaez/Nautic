import { lazy, Suspense, useMemo, useState } from 'react'
import type { Arquetipo } from '../../domain/casco/arquetipo'
import { dimensionesCasco } from '../../domain/casco/dimensiones'
import { LimiteDelLienzo } from '../../../inspecciones/ui/casco/EscenaCasco'
import { SiluetaCasco } from '../../../inspecciones/ui/casco/SiluetaCasco'
import { webglDisponible } from '../../../inspecciones/ui/casco/vistaCasco'

// three.js only arrives with this lazy chunk, so the entry chunk stays free of it.
const LienzoMiniatura = lazy(() => import('./LienzoMiniatura'))

/**
 * Thumbnail of a vessel type: its hull in 3D turning slowly (still under reduced motion), with
 * the side silhouette while it loads, without WebGL or when the canvas fails.
 */
export function MiniaturaCasco({
  nombre,
  arquetipo,
  seleccionado,
}: {
  nombre: string
  arquetipo: Arquetipo
  seleccionado: boolean
}) {
  const [webgl] = useState(webglDisponible)
  const dimensiones = useMemo(() => dimensionesCasco({}, arquetipo), [arquetipo])
  const silueta = (
    <div className="flex size-full items-center justify-center p-3">
      <SiluetaCasco nombreBuque={nombre} dimensiones={dimensiones} arquetipo={arquetipo} />
    </div>
  )
  if (!webgl) return silueta

  return (
    <LimiteDelLienzo alternativa={silueta}>
      <Suspense fallback={silueta}>
        <LienzoMiniatura arquetipo={arquetipo} seleccionado={seleccionado} />
      </Suspense>
    </LimiteDelLienzo>
  )
}
