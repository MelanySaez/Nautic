import { PERMISOS_MIEMBRO, type PermisosMiembro } from '../domain/miembros'

/**
 * The four permissions of a team member as checkboxes, shared by the team editor and the
 * new-inspection invitations. `leyenda` names the group for screen readers.
 */
export function CasillasPermisos({
  leyenda,
  permisos,
  alCambiar,
  deshabilitado = false,
}: {
  leyenda: string
  permisos: PermisosMiembro
  alCambiar: (permisos: PermisosMiembro) => void
  deshabilitado?: boolean
}) {
  return (
    <fieldset disabled={deshabilitado} className="m-0 flex flex-wrap gap-x-4 gap-y-1 border-0 p-0">
      <legend className="sr-only">{leyenda}</legend>
      {PERMISOS_MIEMBRO.map(({ clave, etiqueta }) => (
        <label key={clave} className="flex items-center gap-1.5 text-sm has-disabled:opacity-50">
          <input
            type="checkbox"
            checked={permisos[clave]}
            onChange={(e) => alCambiar({ ...permisos, [clave]: e.target.checked })}
            className="size-4 accent-accent"
          />
          {etiqueta}
        </label>
      ))}
    </fieldset>
  )
}
