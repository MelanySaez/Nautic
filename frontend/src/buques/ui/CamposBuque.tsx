import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import { Tarjeta } from '../../shared/ui/Tarjeta'
import { GRUPOS_TECNICOS } from '../domain/fichaTecnica'
import { GrupoNumerico } from './GrupoNumerico'
import type { Errores, Valores } from './formularioBuque'

const ETAPAS_SUGERIDAS = ['Activo', 'En construcción']

/** General data and technical-sheet measures, shared by the create and edit forms. */
export function CamposBuque({
  valores,
  errores,
  alCambiar,
  ayudaEtapa,
}: {
  valores: Valores
  errores: Errores
  alCambiar: (clave: string, valor: string) => void
  ayudaEtapa?: string
}) {
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
            <input
              value={valores.tipo}
              onChange={(e) => alCambiar('tipo', e.target.value)}
              maxLength={255}
              placeholder="Fragata, patrullera…"
              className={CLASES_CONTROL}
            />
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
          <Campo etiqueta="Imagen" error={errores.imagen} ayuda="Nombre o ruta del archivo; todavía no se muestra.">
            <input
              value={valores.imagen}
              onChange={(e) => alCambiar('imagen', e.target.value)}
              maxLength={255}
              className={CLASES_CONTROL}
            />
          </Campo>
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
