import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import { etiquetaDeCampo, type GrupoTecnico } from '../domain/fichaTecnica'

/** Collapsible group of optional numeric inputs; opens by itself when one of its fields has an error. */
export function GrupoNumerico({
  grupo,
  valores,
  errores,
  alCambiar,
}: {
  grupo: GrupoTecnico
  valores: Record<string, string>
  errores: Record<string, string>
  alCambiar: (clave: string, valor: string) => void
}) {
  const conError = grupo.campos.some((c) => errores[c.clave])

  return (
    <details open={conError} className="group rounded-lg border border-line bg-surface">
      <summary className="label-caps flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-ink-muted">
        {grupo.titulo}
        <span className="text-ink-dim normal-case">Opcional</span>
      </summary>
      <div className="grid gap-5 border-t border-line p-4 sm:grid-cols-2">
        {grupo.campos.map((campo) => (
          <Campo key={campo.clave} etiqueta={etiquetaDeCampo(campo)} error={errores[campo.clave]}>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={campo.entero ? 1 : 'any'}
              value={valores[campo.clave]}
              onChange={(e) => alCambiar(campo.clave, e.target.value)}
              className={CLASES_CONTROL}
            />
          </Campo>
        ))}
      </div>
    </details>
  )
}
