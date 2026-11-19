import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { ApiError } from '../../shared/http/apiClient'
import { mensajeDe } from '../../shared/ui/formato'

/** Largest image the backend accepts (`TAMANO_MAXIMO_IMAGEN` in `views_buques.py`), in whole MB. */
export const MAXIMO_MB_IMAGEN = 5
export const TAMANO_MAXIMO_IMAGEN = MAXIMO_MB_IMAGEN * 1024 * 1024

/** What the user did with the image in the form: nothing, picked a file, or removed the current one. */
export interface EleccionImagen {
  archivo: File | null
  quitar: boolean
}

export const SIN_CAMBIOS_IMAGEN: EleccionImagen = { archivo: null, quitar: false }

/** Client-side check that saves a round trip; the backend validates the file again. */
export function errorDeImagen(archivo: File): string | null {
  if (!archivo.type.startsWith('image/')) return 'Selecciona un archivo de imagen.'
  if (archivo.size > TAMANO_MAXIMO_IMAGEN) return `La imagen no puede superar ${MAXIMO_MB_IMAGEN} MB.`
  return null
}

/** The field message of an image upload error when the server gave one, else the general message. */
export function detalleDeError(error: unknown): string {
  return (error instanceof ApiError && error.campos?.imagen?.join(' ')) || mensajeDe(error)
}

/**
 * The image choice of a vessel form, with its field error kept in the form's `errores`. A rejected
 * file is never kept, so it can never block the submit: only its message stays until the next pick.
 */
export function useEleccionImagen(
  setErrores: Dispatch<SetStateAction<Record<string, string>>>,
): [EleccionImagen, (eleccion: EleccionImagen, error: string | null) => void] {
  const [eleccion, setEleccion] = useState<EleccionImagen>(SIN_CAMBIOS_IMAGEN)
  const cambiar = useCallback(
    (nueva: EleccionImagen, error: string | null) => {
      setEleccion(nueva)
      setErrores(({ imagen: _anterior, ...resto }) => (error ? { ...resto, imagen: error } : resto))
    },
    [setErrores],
  )
  return [eleccion, cambiar]
}
