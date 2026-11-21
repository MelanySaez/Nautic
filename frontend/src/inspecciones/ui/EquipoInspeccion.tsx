import { useCallback, useId, useState, type FormEvent } from 'react'
import { useDependencias } from '../../app/useDependencias'
import { useRecurso } from '../../shared/hooks/useRecurso'
import { ApiError, type ErroresDeCampo } from '../../shared/http/apiClient'
import { Boton } from '../../shared/ui/Boton'
import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL, clasesControlCompacto } from '../../shared/ui/clasesControl'
import { Cargando, MensajeError } from '../../shared/ui/Estados'
import { Icon } from '../../shared/ui/Icon'
import { mensajeDe } from '../../shared/ui/formato'
import type { InspeccionDetalle } from '../domain/inspeccion'
import {
  cambiosEntre,
  ETIQUETA_ROL,
  invitadoDe,
  MENSAJE_ELIGE_PERSONA,
  PERMISOS_MIEMBRO,
  PERMISOS_ROL,
  rolDe,
  ROLES_PLANTILLA,
  type CambiosMiembro,
  type Miembro,
  type NuevoMiembro,
  type PermisosMiembro,
  type PersonaSugerida,
  type RolPlantilla,
} from '../domain/miembros'
import { CasillasPermisos } from './CasillasPermisos'
import { SelectorPersona } from './SelectorPersona'

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
  const buscarPersonas = useCallback((texto: string) => repo.buscarUsuarios(texto), [repo])
  const { estado, reintentar, actualizar } = useRecurso(cargar)
  const [ocupados, setOcupados] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [cambiandoPrivacidad, setCambiandoPrivacidad] = useState(false)
  const idAyudaPrivada = useId()

  /** Runs a change on one member, showing its error; resolves true when it worked. */
  async function conMiembroOcupado(id: number, accion: () => Promise<void>): Promise<boolean> {
    setError(null)
    setOcupados((s) => new Set(s).add(id))
    try {
      await accion()
      return true
    } catch (e) {
      setError(mensajeDe(e))
      return false
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
      {/* Folded by default so the photo results stay close to the top. */}
      <details className="group rounded-lg border border-line bg-surface">
        <summary className="label-caps flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-ink-muted hover:text-ink">
          Equipo
          <span className="flex items-center gap-3">
            {estado.tipo === 'listo' && (
              <span className="text-ink-dim normal-case">
                {estado.datos.length} {estado.datos.length === 1 ? 'miembro' : 'miembros'}
              </span>
            )}
            {/* Points down while folded and up once unfolded. */}
            <Icon name="chevron" className="size-4 transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="flex flex-col gap-4 border-t border-line p-4">
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
                    alCambiar={(cambios) => cambiar(miembro, cambios)}
                    alQuitar={() => quitar(miembro)}
                  />
                ))}
              </ul>
            ))}

          {esLider && (
            <FormularioInvitacion
              buscarPersonas={buscarPersonas}
              alInvitar={async (datos) => {
                const nuevo = await repo.invitar(detalle.id, datos)
                actualizar((lista) => [...lista, nuevo])
              }}
            />
          )}
        </div>
      </details>
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
  alCambiar: (cambios: CambiosMiembro) => Promise<boolean>
  alQuitar: () => void
}) {
  const { usuario, rol, permisos } = miembro
  // Edits stay here until "Guardar cambios": nothing is sent while the leader is still choosing.
  const [borrador, setBorrador] = useState<PermisosMiembro | null>(null)
  const elegidos = borrador ?? permisos
  const cambios = borrador ? cambiosEntre(permisos, borrador) : null
  const rolElegido = borrador ? rolDe(borrador) : rol

  async function guardar() {
    if (cambios && (await alCambiar(cambios))) setBorrador(null)
  }

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
              value={rolElegido}
              disabled={ocupado}
              onChange={(e) => setBorrador(PERMISOS_ROL[e.target.value as RolPlantilla])}
              className={clasesControlCompacto}
            >
              {ROLES_PLANTILLA.map((r) => (
                <option key={r.rol} value={r.rol}>
                  {r.etiqueta}
                </option>
              ))}
              {/* Shown only as the current state: picking it would not mean any permission set. */}
              {rolElegido === 'personalizado' && (
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
          <CasillasPermisos
            leyenda={`Permisos de ${usuario.nombre}`}
            permisos={elegidos}
            alCambiar={setBorrador}
            deshabilitado={ocupado}
          />
          {cambios && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink-muted">Cambios sin guardar</span>
              <Boton
                variante="secundario"
                onClick={() => setBorrador(null)}
                disabled={ocupado}
                aria-label={`Descartar cambios de ${usuario.nombre}`}
              >
                Descartar
              </Boton>
              <Boton onClick={() => void guardar()} disabled={ocupado} aria-label={`Guardar cambios de ${usuario.nombre}`}>
                {ocupado ? 'Guardando…' : 'Guardar cambios'}
              </Boton>
            </div>
          )}
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

function FormularioInvitacion({
  alInvitar,
  buscarPersonas,
}: {
  alInvitar: (datos: NuevoMiembro) => Promise<void>
  buscarPersonas: (texto: string) => Promise<PersonaSugerida[]>
}) {
  const [texto, setTexto] = useState('')
  const [persona, setPersona] = useState<PersonaSugerida | null>(null)
  const [rol, setRol] = useState<RolPlantilla>('colaborador')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campos, setCampos] = useState<ErroresDeCampo | undefined>()

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setError(null)
    const invitado = invitadoDe(texto, persona)
    if (!invitado) {
      setCampos({ email: [MENSAJE_ELIGE_PERSONA] })
      return
    }
    setCampos(undefined)
    setEnviando(true)
    try {
      await alInvitar({ ...invitado, rol })
      setTexto('')
      setPersona(null)
    } catch (e) {
      const deCampo = e instanceof ApiError ? e.campos : undefined
      setCampos(deCampo)
      // Field messages are shown next to their control; only the rest needs the general alert.
      if (!deCampo?.email && !deCampo?.usuario_id && !deCampo?.rol) setError(mensajeDe(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-3 border-t border-line pt-4">
      <h3 className="label-caps text-ink-muted">Invitar miembro</h3>
      {error && <MensajeError mensaje={error} />}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-start">
        <Campo
          etiqueta="Nombre o email del usuario"
          error={(campos?.email ?? campos?.usuario_id ?? campos?.permisos)?.join(' ')}
        >
          <SelectorPersona
            texto={texto}
            persona={persona}
            buscar={buscarPersonas}
            alCambiar={(nuevoTexto, elegida) => {
              setTexto(nuevoTexto)
              setPersona(elegida)
            }}
            placeholder="Escribe un nombre o un email"
          />
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
        <Boton type="submit" disabled={enviando || !texto.trim()} className="sm:mt-7">
          {enviando ? 'Invitando…' : 'Invitar'}
        </Boton>
      </div>
    </form>
  )
}
