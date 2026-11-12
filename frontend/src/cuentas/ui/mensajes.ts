import type { ErroresDeCampo } from '../../shared/http/apiClient'

/** All the messages of one API field, joined for a `Campo` error; null when it has none. */
export function mensajesDe(campos: ErroresDeCampo | undefined, campo: string): string | null {
  const mensajes = campos?.[campo]
  return mensajes && mensajes.length > 0 ? mensajes.join(' ') : null
}
