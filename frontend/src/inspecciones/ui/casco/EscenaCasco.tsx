import type { PropsLienzoCasco } from './lienzoCasco'
import { SiluetaCasco } from './SiluetaCasco'

/**
 * Slot of the hull scene. It draws the side silhouette for now; the lazy WebGL canvas will take
 * these same props here, with the silhouette as its loading fallback.
 */
export function EscenaCasco({ nombreBuque, dimensiones, arquetipo }: PropsLienzoCasco) {
  return <SiluetaCasco nombreBuque={nombreBuque} dimensiones={dimensiones} arquetipo={arquetipo} />
}
