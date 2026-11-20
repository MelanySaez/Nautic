import type { Arquetipo } from '../../../buques/domain/casco/arquetipo'
import type { DimensionesCasco } from '../../../buques/domain/casco/dimensiones'
import type { CodigoZona } from '../../../buques/domain/casco/zonas'
import type { EstadoZona } from '../../domain/resumenZonas'

/**
 * Props of the hull scene: what the lazy WebGL canvas receives, and what its silhouette fallback
 * draws from. Zones are keyed by standard code; only the codes the vessel has a section for
 * appear in `estados` and `fotosPorZona`, so a missing code has nothing to select.
 */
export interface PropsLienzoCasco {
  /** Names the vessel in the accessible label of the scene. */
  nombreBuque: string
  /** Hull measurements, with the archetype fallbacks already applied (`dimensionesCasco`). */
  dimensiones: DimensionesCasco
  arquetipo: Arquetipo
  /** State of each placed zone in the selected inspection (every zone `sin-fotos` without one). */
  estados: ReadonlyMap<CodigoZona, EstadoZona>
  /** Photos of each placed zone in the selected inspection, in any state (0 included). */
  fotosPorZona: ReadonlyMap<CodigoZona, number>
  /** Section name of each placed zone, shown next to the pointer while hovering it. */
  nombresZona: ReadonlyMap<CodigoZona, string>
  /** True while the selected inspection loads: the states are not final yet. */
  cargando: boolean
  /** The selected zone, when the selected section is placed on the hull. */
  seleccionada: CodigoZona | null
  /** Picking a zone toggles its section; null (e.g. a click on empty space) clears the selection. */
  onSeleccionar: (codigo: CodigoZona | null) => void
}
