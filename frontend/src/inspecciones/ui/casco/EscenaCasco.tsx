import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import type { PropsLienzoCasco } from './lienzoCasco'
import { SiluetaCasco } from './SiluetaCasco'
import { webglDisponible } from './vistaCasco'

// The only way into three.js: a lazy chunk loaded by this page alone. The extension is explicit
// because `lienzoCasco.ts` (the props) differs from it only in case on case-insensitive disks.
const LienzoCasco = lazy(() => import('./LienzoCasco.tsx'))

/** Shows `alternativa` instead of a canvas that failed to load or to start (e.g. a lost WebGL context). */
class LimiteDelLienzo extends Component<{ alternativa: ReactNode; children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false }

  static getDerivedStateFromError() {
    return { fallo: true }
  }

  render() {
    return this.state.fallo ? this.props.alternativa : this.props.children
  }
}

/**
 * Slot of the hull scene: the WebGL canvas, lazy-loaded, with the side silhouette while it loads
 * and in its place when the browser has no WebGL or the canvas fails.
 */
export function EscenaCasco(props: PropsLienzoCasco) {
  const [webgl] = useState(webglDisponible)
  const silueta = (
    <div className="flex size-full items-center justify-center p-4">
      <SiluetaCasco nombreBuque={props.nombreBuque} dimensiones={props.dimensiones} arquetipo={props.arquetipo} />
    </div>
  )
  if (!webgl) return silueta

  return (
    <LimiteDelLienzo alternativa={silueta}>
      <Suspense fallback={silueta}>
        <LienzoCasco {...props} />
      </Suspense>
    </LimiteDelLienzo>
  )
}
