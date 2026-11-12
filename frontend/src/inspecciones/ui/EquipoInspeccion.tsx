import { useCallback, useId, useState, type FormEvent } from 'react'
import { useDependencias } from '../../app/useDependencias'
import { useRecurso } from '../../shared/hooks/useRecurso'
import { ApiError, type ErroresDeCampo } from '../../shared/http/apiClient'
import { Boton } from '../../shared/ui/Boton'
import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL, clasesControlCompacto } from '../../shared/ui/clasesControl'
import { Cargando, MensajeError } from '../../shared/ui/Estados'
import { Icon } from '../../shared/ui/Icon'
import { Tarjeta } from '../../shared/ui/Tarjeta'
import { mensajeDe } from '../../shared/ui/formato'
import type { InspeccionDetalle } from '../domain/inspeccion'
import {
  ETIQUETA_ROL,
  PERMISOS_MIEMBRO,
  ROLES_PLANTILLA,
  type CambiosMiembro,
  type Miembro,
  type RolPlantilla,
} from '../domain/miembros'

/**
 * Who works on the inspection. The leader invites, edits and removes members and decides
 * whether the inspection is private; everyone else sees the team read-only.
 */
export function EquipoInspeccion({
  detalle,
  alCambiarDetalle,
}: {
  detalle: InspeccionDetalle
  alCambiarDetalle: (cambio: Partial<Omit<InspeccionDetalle, 'fotos'>>) => void
}) {
  const { inspecciones, miembros: repo } = useDependencias()
  const esLider = detalle.misPermisos.esLider
  const cargar = useCallback(() => repo.listar(detalle.id), [repo, detalle.id])
  const { estado, reintentar, actualizar } = useRecurso(cargar)
  const [ocupados, setOcupados] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [cambiandoPrivacidad, setCambiandoPrivacidad] = useState(false)
  const idAyudaPrivada = useId()

  async function conMiembroOcupado(id: number, accion: () => Promise<void>) {
    setError(null)
    setOcupados((s) => new Set(s).add(id))
    try {
      await accion()
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setOcupados((s) => {
        const copia = new Set(s)
        copia.delete(id)
        return copia
      })
    }
  }

  const reemplazar = (miembro: Miembro) => actualizar((lista) => lista.map((m) => (m.id === miembro.id ? miembro : m)))

  const cambiar = (miembro: Miembro, cambios: CambiosMiembro) =>
    conMiembroOcupado(miembro.id, async () => reemplazar(await repo.actualizar(detalle.id, miembro.id, cambios)))

  function quitar(miembro: Miembro) {
    if (!window.confirm(`¿Quitar a ${miembro.usuario.nombre} de la inspección?`)) return
    void conMiembroOcupado(miembro.id, async () => {
      await repo.quitar(detalle.id, miembro.id)
      actualizar((lista) => lista.filter((m) => m.id !== miembro.id))
    })
  }

  async function cambiarPrivacidad(privada: boolean) {
    setError(null)
    setCambiandoPrivacidad(true)
    try {
      const { lider, privada: guardada, misPermisos } = await inspecciones.cambiarPrivacidad(detalle.id, privada)
      alCambiarDetalle({ lider, privada: guardada, misPermisos })
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setCambiandoPrivacidad(false)
    }
  }

  return (
    <section aria-label="Equipo">
      <Tarjeta titulo="Equipo">
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-sm">
            <Icon name="user" className="size-4 text-ink-dim" />
            {detalle.lider ? `Líder: ${detalle.lider.nombre}` : 'Sin líder asignado'}
          </p>

          {esLider && (
            <label className="flex items-start gap-3 text-sm has-disabled:opacity-50">
              <input
                type="checkbox"
                checked={detalle.privada}
                disabled={cambiandoPrivacidad}
                onChange={(e) => void cambiarPrivacidad(e.target.checked)}
                aria-describedby={idAyudaPrivada}
                className="mt-0.5 size-4 accent-accent"
              />
              <span>
                <span className="font-semibold">Inspección privada</span>
                <span id={idAyudaPrivada} aria-hidden className="block text-ink-dim">
                  Solo el líder y los miembros pueden verla.
                </span>
              </span>
            </label>
          )}

          {error && <MensajeError mensaje={error} />}

          {estado.tipo === 'cargando' && <Cargando texto="Cargando equipo…" />}
          {estado.tipo === 'error' && <MensajeError mensaje={estado.mensaje} alReintentar={reintentar} />}
          {estado.tipo === 'listo' &&
            (estado.datos.length === 0 ? (
              <p className="text-sm text-ink-muted">Todavía no hay miembros invitados.</p>
            ) : (
              <ul aria-label="Miembros" className="flex flex-col divide-y divide-line">
                {estado.datos.map((miembro) => (
                  <FilaMiembro
                    key={miembro.id}
                    miembro={miembro}
                    editable={esLider}
                    ocupado={ocupados.has(miembro.id)}
                    alCambiar={(cambios) => void cambiar(miembro, cambios)}
                    alQuitar={() => quitar(miembro)}
                  />
                ))}
              </ul>
            ))}

          {esLider && (
            <FormularioInvitacion
              alInvitar={async (email, rol) => {
                const nuevo = await repo.invitar(detalle.id, { email, rol })
                actualizar((lista) => [...lista, nuevo])
              }}
            />
          )}
        </div>
      </Tarjeta>
    </section>
  )
}

function FilaMiembro({
  miembro,
  editable,
  ocupado,
  alCambiar,
  alQuitar,
}: {
  miembro: Miembro
  editable: boolean
  ocupado: boolean
  alCambiar: (cambios: CambiosMiembro) => void
  alQuitar: () => void
}) {
  const { usuario, rol, permisos } = miembro
  const concedidos = PERMISOS_MIEMBRO.filter(({ clave }) => permisos[clave]).map(({ etiqueta }) => etiqueta)

  return (
    <li aria-label={usuario.nombre} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-semibold">{usuario.nombre}</p>
        {usuario.cargo && <p className="truncate text-sm text-ink-dim">{usuario.cargo}</p>}
      </div>
      {editable ? (
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex items-center gap-2">
            <select
              aria-label={`Rol de ${usuario.nombre}`}
              value={rol}
              disabled={ocupado}
              onChange={(e) => alCambiar({ rol: e.target.value as RolPlantilla })}
              className={clasesControlCompacto}
            >
              {ROLES_PLANTILLA.map((r) => (
                <option key={r.rol} value={r.rol}>
                  {r.etiqueta}
                </option>
              ))}
              {/* Shown only as the current state: picking it would not mean any permission set. */}
              {rol === 'personalizado' && (
                <option value="personalizado" disabled>
                  {ETIQUETA_ROL.personalizado}
                </option>
              )}
            </select>
            <button
              type="button"
              onClick={alQuitar}
              disabled={ocupado}
              aria-label={`Quitar a ${usuario.nombre}`}
              className="rounded p-1.5 text-ink-dim hover:bg-critical-bg hover:text-critical disabled:opacity-50"
            >
              <Icon name="trash" className="size-4" />
            </button>
          </div>
          <fieldset disabled={ocupado} className="m-0 flex flex-wrap gap-x-4 gap-y-1 border-0 p-0">
            <legend className="sr-only">Permisos de {usuario.nombre}</legend>
            {PERMISOS_MIEMBRO.map(({ clave, etiqueta }) => (
              <label key={clave} className="flex items-center gap-1.5 text-sm has-disabled:opacity-50">
                <input
                  type="checkbox"
                  checked={permisos[clave]}
                  onChange={(e) => alCambiar({ permisos: { [clave]: e.target.checked } })}
                  className="size-4 accent-accent"
                />
                {etiqueta}
              </label>
            ))}
          </fieldset>
        </div>
      ) : (
        <div className="flex flex-col gap-1 text-sm sm:items-end">
          <span className="label-caps text-ink-muted">{ETIQUETA_ROL[rol]}</span>
          <span className="text-ink-dim">
            {concedidos.length > 0 ? `Permisos: ${concedidos.join(', ')}` : 'Solo lectura'}
          </span>
        </div>
      )}
    </li>
  )
}

function FormularioInvitacion({ alInvitar }: { alInvitar: (email: string, rol: RolPlantilla) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<RolPlantilla>('colaborador')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campos, setCampos] = useState<ErroresDeCampo | undefined>()

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setError(null)
    setCampos(undefined)
    setEnviando(true)
    try {
      await alInvitar(email, rol)
      setEmail('')
    } catch (e) {
      const deCampo = e instanceof ApiError ? e.campos : undefined
      setCampos(deCampo)
      // Field messages are shown next to their control; only the rest needs the general alert.
      if (!deCampo?.email && !deCampo?.rol) setError(mensajeDe(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-3 border-t border-line pt-4">
      <h3 className="label-caps text-ink-muted">Invitar miembro</h3>
      {error && <MensajeError mensaje={error} />}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-start">
        <Campo etiqueta="Email del usuario" error={campos?.email?.join(' ') ?? campos?.permisos?.join(' ')}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={CLASES_CONTROL} />
        </Campo>
        <Campo etiqueta="Rol" error={campos?.rol?.join(' ')}>
          <select value={rol} onChange={(e) => setRol(e.target.value as RolPlantilla)} className={CLASES_CONTROL}>
            {ROLES_PLANTILLA.map((r) => (
              <option key={r.rol} value={r.rol}>
                {r.etiqueta}
              </option>
            ))}
          </select>
        </Campo>
        <Boton type="submit" disabled={enviando || !email.trim()} className="sm:mt-7">
          {enviando ? 'Invitando…' : 'Invitar'}
        </Boton>
      </div>
    </form>
  )
}
