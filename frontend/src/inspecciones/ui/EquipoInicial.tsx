import { Boton } from '../../shared/ui/Boton'
import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import { Icon } from '../../shared/ui/Icon'
import { Tarjeta } from '../../shared/ui/Tarjeta'
import { ROLES_PLANTILLA, type RolPlantilla } from '../domain/miembros'

export interface FilaInvitado {
  uid: number
  email: string
  rol: RolPlantilla
}

/** Error messages of one row, by field (`email`, `rol`, `permisos`). */
export type ErroresFila = Partial<Record<'email' | 'rol' | 'permisos', string>>

/** People invited while creating an inspection, each with a role template. */
export function EquipoInicial({
  filas,
  errores,
  alAgregar,
  alCambiar,
  alQuitar,
}: {
  filas: FilaInvitado[]
  errores: Record<number, ErroresFila>
  alAgregar: () => void
  alCambiar: (uid: number, cambio: Partial<Omit<FilaInvitado, 'uid'>>) => void
  alQuitar: (uid: number) => void
}) {
  return (
    <Tarjeta titulo="Equipo (opcional)">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          Invita a otras personas con su rol: Colaborador puede hacerlo todo, Revisor edita el reporte y Observador solo
          mira. Podrás cambiarlo después en los resultados.
        </p>
        {filas.map((fila, i) => {
          const n = i + 1
          const error = errores[fila.uid] ?? {}
          return (
            <div key={fila.uid} className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
              <Campo etiqueta={`Email de la persona ${n}`} error={error.email ?? error.permisos}>
                <input
                  type="email"
                  value={fila.email}
                  onChange={(e) => alCambiar(fila.uid, { email: e.target.value })}
                  placeholder="persona@ejemplo.com"
                  className={CLASES_CONTROL}
                />
              </Campo>
              <Campo etiqueta={`Rol de la persona ${n}`} error={error.rol}>
                <select
                  value={fila.rol}
                  onChange={(e) => alCambiar(fila.uid, { rol: e.target.value as RolPlantilla })}
                  className={CLASES_CONTROL}
                >
                  {ROLES_PLANTILLA.map(({ rol, etiqueta }) => (
                    <option key={rol} value={rol}>
                      {etiqueta}
                    </option>
                  ))}
                </select>
              </Campo>
              <Boton
                variante="fantasma"
                aria-label={`Quitar persona ${n}`}
                onClick={() => alQuitar(fila.uid)}
                className="sm:mt-7"
              >
                <Icon name="trash" className="size-4" />
              </Boton>
            </div>
          )
        })}
        <Boton variante="secundario" onClick={alAgregar} className="self-start">
          <Icon name="plus" className="size-4" />
          Agregar persona
        </Boton>
      </div>
    </Tarjeta>
  )
}
