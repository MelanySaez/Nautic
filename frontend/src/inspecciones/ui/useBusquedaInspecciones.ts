import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDependencias } from '../../app/useDependencias'
import { ApiError, type ErroresDeCampo } from '../../shared/http/apiClient'
import { mensajeDe } from '../../shared/ui/formato'
import type { FiltroInspecciones, Inspeccion } from '../domain/inspeccion'

type EstadoBusqueda =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string; campos?: ErroresDeCampo }
  | {
      tipo: 'listo'
      resultados: Inspeccion[]
      siguiente: string | null
      hayMas: boolean
      cargandoMas: boolean
      errorMas: string | null
    }

/** The state remembers which search produced it, so answers to an older search can be told apart. */
type Registro = EstadoBusqueda & { clave: string }

/**
 * Runs the server-side search for `filtro` and accumulates pages. Any change of filter (or a retry)
 * starts again from the first page, and responses that belong to a previous search are discarded.
 * The filter is compared by content, so callers may pass a new object on every render.
 * While `activa` is false nothing is requested (e.g. a list that is not on screen); turning it back
 * on keeps a successful search, with every page loaded so far, instead of asking again. A failed
 * or dropped one is asked for again.
 */
export function useBusquedaInspecciones(filtro: FiltroInspecciones, { activa = true }: { activa?: boolean } = {}) {
  const { inspecciones } = useDependencias()
  const [intento, setIntento] = useState(0)
  const [registro, setRegistro] = useState<Registro | null>(null)
  const consulta = JSON.stringify(filtro)
  const clave = `${intento}:${consulta}`

  // The search already answered successfully (or still in flight) for `clave`.
  const pedida = useRef<string | null>(null)

  useEffect(() => {
    if (!activa || pedida.current === clave) return
    pedida.current = clave
    let vigente = true
    let respondida = false
    const responder = (nuevo: Registro) => {
      respondida = true
      if (vigente) setRegistro(nuevo)
    }
    inspecciones.buscar(JSON.parse(consulta) as FiltroInspecciones).then(
      (pagina) => responder({ clave, tipo: 'listo', ...pagina, cargandoMas: false, errorMas: null }),
      (error: unknown) => {
        // Not worth keeping: coming back to this search tries it again.
        pedida.current = null
        responder({
          clave,
          tipo: 'error',
          mensaje: mensajeDe(error),
          campos: error instanceof ApiError ? error.campos : undefined,
        })
      },
    )
    return () => {
      vigente = false
      // A dropped answer must be asked for again next time.
      if (!respondida) pedida.current = null
    }
  }, [inspecciones, activa, consulta, clave])

  const estado = useMemo<EstadoBusqueda>(
    () => (registro?.clave === clave ? registro : { tipo: 'cargando' }),
    [registro, clave],
  )

  /** Applies a change only if the visible results still come from the search that started it. */
  const actualizarSiVigente = useCallback(
    (claveOrigen: string, cambio: (actual: Extract<Registro, { tipo: 'listo' }>) => Registro) =>
      setRegistro((actual) => (actual?.clave === claveOrigen && actual.tipo === 'listo' ? cambio(actual) : actual)),
    [],
  )

  const cargarMas = useCallback(async () => {
    if (estado.tipo !== 'listo' || !estado.siguiente || estado.cargandoMas) return
    const cursor = estado.siguiente
    actualizarSiVigente(clave, (actual) => ({ ...actual, cargandoMas: true, errorMas: null }))
    try {
      const pagina = await inspecciones.buscar(filtro, cursor)
      actualizarSiVigente(clave, (actual) => {
        const conocidos = new Set(actual.resultados.map((i) => i.id))
        return {
          ...actual,
          resultados: [...actual.resultados, ...pagina.resultados.filter((i) => !conocidos.has(i.id))],
          siguiente: pagina.siguiente,
          hayMas: pagina.hayMas,
          cargandoMas: false,
        }
      })
    } catch (error) {
      actualizarSiVigente(clave, (actual) => ({ ...actual, cargandoMas: false, errorMas: mensajeDe(error) }))
    }
  }, [estado, clave, filtro, inspecciones, actualizarSiVigente])

  const quitar = useCallback(
    (id: number) =>
      setRegistro((actual) =>
        actual?.tipo === 'listo' ? { ...actual, resultados: actual.resultados.filter((i) => i.id !== id) } : actual,
      ),
    [],
  )

  const reintentar = useCallback(() => setIntento((n) => n + 1), [])

  return { estado, cargarMas, quitar, reintentar }
}
