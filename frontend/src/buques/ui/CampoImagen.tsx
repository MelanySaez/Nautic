import { useEffect, useState } from 'react'
import { Boton } from '../../shared/ui/Boton'
import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import { Icon } from '../../shared/ui/Icon'
import { errorDeImagen, MAXIMO_MB_IMAGEN, type EleccionImagen } from './eleccionImagen'

/**
 * Preview URL of a picked file. It is created and released by the same effect, so StrictMode's
 * extra mount/unmount cycle never leaves the preview pointing at a released URL.
 */
function useUrlDeArchivo(archivo: File | null): string | null {
  const [vista, setVista] = useState<{ archivo: File; url: string } | null>(null)
  useEffect(() => {
    if (!archivo) return
    const url = URL.createObjectURL(archivo)
    // The object URL is an external resource this effect owns: create, publish, release.
    // oxlint-disable-next-line react/set-state-in-effect
    setVista({ archivo, url })
    return () => URL.revokeObjectURL(url)
  }, [archivo])
  // Ignore a URL left from a previous file until the effect catches up.
  return archivo && vista?.archivo === archivo ? vista.url : null
}

/**
 * The vessel image: a file picker (opens the system file explorer) with a preview of the picked
 * file or of the current image, and a button to remove it.
 */
export function CampoImagen({
  actual,
  eleccion,
  error,
  alCambiar,
}: {
  /** URL of the stored image, if any. */
  actual: string | null
  eleccion: EleccionImagen
  error?: string
  alCambiar: (eleccion: EleccionImagen, error: string | null) => void
}) {
  const urlArchivo = useUrlDeArchivo(eleccion.archivo)
  const vista = urlArchivo ?? (eleccion.quitar ? null : actual)

  return (
    <div className="flex flex-col gap-3">
      <Campo etiqueta="Imagen" error={error} ayuda={`JPG, PNG o WEBP, hasta ${MAXIMO_MB_IMAGEN} MB.`}>
        <input
          type="file"
          accept="image/*"
          onChange={(evento) => {
            const archivo = evento.target.files?.[0]
            if (!archivo) return
            const problema = errorDeImagen(archivo)
            alCambiar(problema ? { ...eleccion, archivo: null } : { archivo, quitar: false }, problema)
          }}
          className={`${CLASES_CONTROL} file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-ink`}
        />
      </Campo>
      {vista && (
        <div className="flex items-end gap-3">
          <img
            src={vista}
            alt="Vista previa de la imagen"
            className="max-h-48 rounded border border-line bg-surface-2 object-contain"
          />
          <Boton
            variante="secundario"
            onClick={() => alCambiar({ archivo: null, quitar: actual !== null }, null)}
          >
            <Icon name="trash" className="size-4" />
            Quitar imagen
          </Boton>
        </div>
      )}
    </div>
  )
}
