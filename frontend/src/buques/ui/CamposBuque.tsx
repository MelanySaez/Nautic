import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import { Selector } from '../../shared/ui/Selector'
import { Tarjeta } from '../../shared/ui/Tarjeta'
import { GRUPOS_TECNICOS } from '../domain/fichaTecnica'
import { CampoImagen } from './CampoImagen'
import type { EleccionImagen } from './eleccionImagen'
import { GrupoNumerico } from './GrupoNumerico'
import { TIPOS_BUQUE, tipoBuqueDe } from '../domain/tiposBuque'
import type { Errores, Valores } from './formularioBuque'

/** Stages offered in the form; the first one is the backend default for a new vessel. */
const ETAPAS = ['Activo', 'En construcción']

/** General data and technical-sheet measures, shared by the create and edit forms. */
export function CamposBuque({
  valores,
  errores,
  alCambiar,
  imagen,
}: {
  valores: Valores
  errores: Errores
  alCambiar: (clave: string, valor: string) => void
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
  // A blank stage (new vessel) shows the default without sending it; one stored before the
  // list stays selectable until another one is chosen.
  const etapa = valores.etapa.trim() === '' ? ETAPAS[0] : valores.etapa
  const etapaFueraDeLista = !ETAPAS.includes(etapa)

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
            <Selector value={tipoActual?.nombre ?? valores.tipo} onChange={(e) => alCambiar('tipo', e.target.value)}>
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
            </Selector>
          </Campo>
          <Campo etiqueta="Etapa" error={errores.etapa}>
            <Selector value={etapa} onChange={(e) => alCambiar('etapa', e.target.value)}>
              {etapaFueraDeLista && <option value={etapa}>{etapa} (fuera de la lista)</option>}
              {ETAPAS.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {opcion}
                </option>
              ))}
            </Selector>
          </Campo>
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
