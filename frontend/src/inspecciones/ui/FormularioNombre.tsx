import { useState } from 'react'
import { Boton } from '../../shared/ui/Boton'
import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'

/** Inline form to rename an inspection; the caller owns the request and its error. */
export function FormularioNombre({
  valorInicial,
  guardando,
  error,
  alGuardar,
  alCancelar,
}: {
  valorInicial: string
  guardando: boolean
  error: string | null
  alGuardar: (nombre: string) => void
  alCancelar: () => void
}) {
  const [nombre, setNombre] = useState(valorInicial)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        alGuardar(nombre)
      }}
      className="flex flex-col gap-3"
    >
      <Campo etiqueta="Nombre" error={error} ayuda="Déjelo vacío para usar el nombre generado.">
        <input
          type="text"
          value={nombre}
          maxLength={255}
          onChange={(e) => setNombre(e.target.value)}
          className={CLASES_CONTROL}
        />
      </Campo>
      <div className="flex gap-2">
        <Boton type="submit" disabled={guardando}>
          Guardar
        </Boton>
        <Boton variante="fantasma" onClick={alCancelar} disabled={guardando}>
          Cancelar
        </Boton>
      </div>
    </form>
  )
}
