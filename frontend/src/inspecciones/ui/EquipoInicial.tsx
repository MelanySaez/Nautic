import { Boton } from '../../shared/ui/Boton'
import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import { Icon } from '../../shared/ui/Icon'
import { Tarjeta } from '../../shared/ui/Tarjeta'
import {
  ETIQUETA_ROL,
  PERMISOS_ROL,
  rolDe,
  ROLES_PLANTILLA,
  type PermisosMiembro,
  type PersonaSugerida,
  type RolPlantilla,
} from '../domain/miembros'
import { CasillasPermisos } from './CasillasPermisos'
import { SelectorPersona } from './SelectorPersona'

export interface FilaInvitado {
  uid: number
  /** What was typed: a name to search or an email. */
  texto: string
  /** The user picked from the suggestions; null while the row holds typed text. */
  persona: PersonaSugerida | null
  /** Chosen with a role template, then adjustable one by one (a custom role). */
  permisos: PermisosMiembro
}

/** Error messages of one row, by field (`email`, `usuario_id`, `rol`, `permisos`). */
export type ErroresFila = Partial<Record<'email' | 'usuario_id' | 'rol' | 'permisos', string>>

/** People invited while creating an inspection, each with a role template. */
export function EquipoInicial({
  filas,
  errores,
  privada,
  alCambiarPrivada,
  alAgregar,
  alCambiar,
  alQuitar,
  buscarPersonas,
}: {
  filas: FilaInvitado[]
  privada: boolean
  alCambiarPrivada: (privada: boolean) => void
  errores: Record<number, ErroresFila>
  alAgregar: () => void
  alCambiar: (uid: number, cambio: Partial<Omit<FilaInvitado, 'uid'>>) => void
  alQuitar: (uid: number) => void
  buscarPersonas: (texto: string) => Promise<PersonaSugerida[]>
}) {
  return (
    <Tarjeta titulo="Acceso y equipo">
      <div className="flex flex-col gap-4">
        <label className="flex cursor-pointer items-start gap-3 rounded border border-line px-3 py-2.5 hover:border-accent">
          <input
            type="checkbox"
            checked={privada}
            onChange={(e) => alCambiarPrivada(e.target.checked)}
            className="mt-0.5 size-4"
            aria-labelledby="titulo-privada"
            aria-describedby="ayuda-privada"
          />
          <span className="flex flex-col gap-0.5">
            <span id="titulo-privada" className="text-sm font-semibold">
              Inspección privada
            </span>
            <span id="ayuda-privada" className="text-sm text-ink-muted">
              Solo la verán tú y las personas que invites. Si no la marcas, cualquier usuario podrá verla en modo
              lectura.
            </span>
          </span>
        </label>
        <p className="text-sm text-ink-muted">
          Invita a otras personas con su rol (escribe su nombre para buscarlas, o su email): Colaborador puede hacerlo todo, Revisor edita el reporte y Observador solo
          mira. Ajusta los permisos uno a uno para un rol personalizado. Podrás cambiarlo después en los resultados.
        </p>
        {filas.map((fila, i) => {
          const n = i + 1
          const error = errores[fila.uid] ?? {}
          return (
            <div key={fila.uid} className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
              <Campo
                etiqueta={`Nombre o email de la persona ${n}`}
                error={error.email ?? error.usuario_id ?? error.permisos}
              >
                <SelectorPersona
                  texto={fila.texto}
                  persona={fila.persona}
                  buscar={buscarPersonas}
                  alCambiar={(texto, persona) => alCambiar(fila.uid, { texto, persona })}
                  placeholder="Nombre o persona@ejemplo.com"
                />
              </Campo>
              <Campo etiqueta={`Rol de la persona ${n}`} error={error.rol}>
                <select
                  value={rolDe(fila.permisos)}
                  onChange={(e) => alCambiar(fila.uid, { permisos: PERMISOS_ROL[e.target.value as RolPlantilla] })}
                  className={CLASES_CONTROL}
                >
                  {ROLES_PLANTILLA.map(({ rol, etiqueta }) => (
                    <option key={rol} value={rol}>
                      {etiqueta}
                    </option>
                  ))}
                  {/* Reached by adjusting the permissions below, as in the team editor. */}
                  {rolDe(fila.permisos) === 'personalizado' && (
                    <option value="personalizado" disabled>
                      {ETIQUETA_ROL.personalizado}
                    </option>
                  )}
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
              <div className="sm:col-span-3">
                <CasillasPermisos
                  leyenda={`Permisos de la persona ${n}`}
                  permisos={fila.permisos}
                  alCambiar={(permisos) => alCambiar(fila.uid, { permisos })}
                />
              </div>
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
