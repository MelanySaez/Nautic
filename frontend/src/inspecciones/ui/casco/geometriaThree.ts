// three.js glue shared by the lazy canvases (`LienzoCasco`, `LienzoMiniatura`). Only lazy modules
// may import this file, so three.js stays out of the entry chunk.
import { BufferAttribute, BufferGeometry } from 'three'
import type { Malla } from '../../../buques/domain/casco/malla'

/** A three.js geometry over the arrays of a generated mesh (no copy). */
export function geometriaDe(malla: Malla): BufferGeometry {
  const geometria = new BufferGeometry()
  geometria.setAttribute('position', new BufferAttribute(malla.posiciones, 3))
  geometria.setAttribute('normal', new BufferAttribute(malla.normales, 3))
  geometria.setIndex(new BufferAttribute(malla.indices, 1))
  geometria.computeBoundingSphere()
  return geometria
}
