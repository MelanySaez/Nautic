import { useCallback, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useDependencias } from '../../app/useDependencias'
import { useRecurso } from '../../shared/hooks/useRecurso'
import { Cargando, MensajeError } from '../../shared/ui/Estados'
import { Icon } from '../../shared/ui/Icon'
import { Tarjeta } from '../../shared/ui/Tarjeta'
import { formatearFecha } from '../../shared/ui/formato'
import type { BuqueDetalle } from '../domain/buque'
import { etiquetaDeCampo, GRUPOS_TECNICOS } from '../domain/fichaTecnica'
import { FichaGrupo } from './FichaGrupo'

const FORMATO_NUMERO = new Intl.NumberFormat('es', { maximumFractionDigits: 3 })

/** Route entry: keys the page by id so switching vessels starts from a clean state. */
export function BuqueDetalleRuta() {
  const { id } = useParams()
  const buqueId = id !== undefined && /^\d+$/.test(id) ? Number(id) : null

  if (buqueId === null) {
    return (
      <Marco>
        <MensajeError mensaje="El identificador del buque no es válido." />
      </Marco>
    )
  }
  return <BuqueDetallePage key={buqueId} buqueId={buqueId} />
}

export function BuqueDetallePage({ buqueId }: { buqueId: number }) {
  const { buques } = useDependencias()
  const cargar = useCallback(() => buques.obtener(buqueId), [buques, buqueId])
  const { estado, reintentar } = useRecurso(cargar)

  if (estado.tipo === 'cargando') return <Cargando texto="Cargando ficha técnica…" />
  if (estado.tipo === 'error') {
    return (
      <Marco>
        <MensajeError mensaje={estado.mensaje} alReintentar={reintentar} />
      </Marco>
    )
  }
  return <FichaTecnica buque={estado.datos} />
}

function Marco({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <Link to="/buques" className="label-caps inline-flex items-center gap-2 self-start text-ink-muted hover:text-ink">
        <Icon name="back" className="size-4" />
        Volver a buques
      </Link>
      {children}
    </div>
  )
}

function FichaTecnica({ buque }: { buque: BuqueDetalle }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-4">
        <Link to="/buques" aria-label="Volver a buques" className="rounded p-1 text-ink-muted hover:text-ink">
          <Icon name="back" className="size-6" />
        </Link>
        {/* There is no image serving contract yet, so the picture is always a placeholder. */}
        <div className="flex size-14 shrink-0 items-center justify-center rounded bg-surface-2 text-ink-dim">
          <Icon name="ship" className="size-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="label-caps text-ink-dim">Ficha técnica · BUQ-{String(buque.id).padStart(4, '0')}</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{buque.nombre}</h1>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <FichaGrupo
          titulo="General"
          filas={[
            { etiqueta: 'Tipo', valor: buque.tipo },
            { etiqueta: 'Etapa', valor: buque.etapa || null },
            { etiqueta: 'Descripción', valor: buque.descripcion || null },
            { etiqueta: 'Registrado', valor: formatearFecha(buque.createdAt) },
            { etiqueta: 'Actualizado', valor: formatearFecha(buque.updatedAt) },
          ]}
        />
        {GRUPOS_TECNICOS.map((grupo) => (
          <FichaGrupo
            key={grupo.titulo}
            titulo={grupo.titulo}
            filas={grupo.campos.map((campo) => {
              const valor = buque[campo.clave]
              return { etiqueta: etiquetaDeCampo(campo), valor: valor === null ? null : FORMATO_NUMERO.format(valor) }
            })}
          />
        ))}
        <SeccionesDelCasco secciones={buque.secciones} />
      </div>
    </div>
  )
}

/** Hull sections the vessel declared, in display order (the API already sorts them). */
function SeccionesDelCasco({ secciones }: { secciones: BuqueDetalle['secciones'] }) {
  return (
    <div role="region" aria-label="Secciones del casco" className="lg:col-span-2">
      <Tarjeta titulo="Secciones del casco" accion={<span className="label-caps text-accent-ink">{secciones.length} zonas</span>}>
        {secciones.length === 0 ? (
          <p className="text-sm text-ink-muted">Este buque no tiene secciones declaradas.</p>
        ) : (
          <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {secciones.map((seccion) => (
              <li key={seccion.id} className="flex flex-col gap-0.5">
                <span className="text-sm">
                  <span className="font-mono text-ink-dim">{seccion.codigo}</span> · {seccion.nombre}
                </span>
                {seccion.descripcion && <span className="text-sm text-ink-muted">{seccion.descripcion}</span>}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  )
}
