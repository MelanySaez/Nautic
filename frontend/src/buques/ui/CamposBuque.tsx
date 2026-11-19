import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import { Tarjeta } from '../../shared/ui/Tarjeta'
import { GRUPOS_TECNICOS } from '../domain/fichaTecnica'
import { CampoImagen } from './CampoImagen'
import type { EleccionImagen } from './eleccionImagen'
import { GrupoNumerico } from './GrupoNumerico'
import { TIPOS_BUQUE, tipoBuqueDe } from '../domain/tiposBuque'
import type { Errores, Valores } from './formularioBuque'

const ETAPAS_SUGERIDAS = ['Activo', 'En construcción']

/** General data and technical-sheet measures, shared by the create and edit forms. */
export function CamposBuque({
  valores,
  errores,
  alCambiar,
  ayudaEtapa,
  imagen,
}: {
  valores: Valores
  errores: Errores
  alCambiar: (clave: string, valor: string) => void
  ayudaEtapa?: string
  /** The image picker: the stored image URL and what the user chose (see `CampoImagen`). */
  imagen: {
    actual: string | null
    eleccion: EleccionImagen
    alCambiar: (eleccion: EleccionImagen, error: string | null) => void
  }
}) {
  // A stored type matches the catalogue ignoring case and accents; free text from before it does not.
  const tipoActual = tipoBuqueDe(valores.tipo)
  const fueraDeCatalogo = valores.tipo.trim() !== '' && tipoActual === null

  return (
    <>
      <Tarjeta titulo="Datos generales">
        <div className="flex flex-col gap-5">
          <Campo etiqueta="Nombre" error={errores.nombre}>
            <input
              value={valores.nombre}
              onChange={(e) => alCambiar('nombre', e.target.value)}
              maxLength={255}
              className={CLASES_CONTROL}
            />
          </Campo>
          <Campo etiqueta="Tipo" error={errores.tipo}>
            <select
              value={tipoActual?.nombre ?? valores.tipo}
              onChange={(e) => alCambiar('tipo', e.target.value)}
              className={CLASES_CONTROL}
            >
              <option value="" disabled>
                Selecciona un tipo
              </option>
              {/* A type stored before the catalogue stays selectable until another one is chosen. */}
              {fueraDeCatalogo && (
                <option value={valores.tipo}>{valores.tipo} (fuera del catálogo)</option>
              )}
              {TIPOS_BUQUE.map((tipo) => (
                <option key={tipo.id} value={tipo.nombre}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Etapa" error={errores.etapa} ayuda={ayudaEtapa}>
            <input
              value={valores.etapa}
              onChange={(e) => alCambiar('etapa', e.target.value)}
              maxLength={255}
              list="etapas-buque"
              className={CLASES_CONTROL}
            />
          </Campo>
          <datalist id="etapas-buque">
            {ETAPAS_SUGERIDAS.map((etapa) => (
              <option key={etapa} value={etapa} />
            ))}
          </datalist>
          <Campo etiqueta="Descripción" error={errores.descripcion}>
            <textarea
              value={valores.descripcion}
              onChange={(e) => alCambiar('descripcion', e.target.value)}
              rows={3}
              className={`${CLASES_CONTROL} resize-y`}
            />
          </Campo>
          <CampoImagen {...imagen} error={errores.imagen} />
        </div>
      </Tarjeta>

      <div className="flex flex-col gap-3">
        {GRUPOS_TECNICOS.map((grupo) => (
          <GrupoNumerico key={grupo.titulo} grupo={grupo} valores={valores} errores={errores} alCambiar={alCambiar} />
        ))}
      </div>
    </>
  )
}
