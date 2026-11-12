import { useCallback, useEffect, useState } from 'react'
import { mensajeDe } from '../ui/formato'

export type EstadoRecurso<T> =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; datos: T }

/**
 * Loads async data once per `cargar` identity and exposes a retry. Responses that arrive
 * after the component unmounted or after a newer request are discarded. Pages that load
 * by route param should be keyed by that param so a new id starts from "cargando".
 */
export function useRecurso<T>(cargar: () => Promise<T>) {
  const [estado, setEstado] = useState<EstadoRecurso<T>>({ tipo: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    cargar().then(
      (datos) => vigente && setEstado({ tipo: 'listo', datos }),
      (error: unknown) => vigente && setEstado({ tipo: 'error', mensaje: mensajeDe(error) }),
    )
    return () => {
      vigente = false
    }
  }, [cargar, intento])

  const reintentar = useCallback(() => {
    setEstado({ tipo: 'cargando' })
    setIntento((n) => n + 1)
  }, [])
  const actualizar = useCallback(
    (cambio: (datos: T) => T) =>
      setEstado((actual) => (actual.tipo === 'listo' ? { tipo: 'listo', datos: cambio(actual.datos) } : actual)),
    [],
  )

  return { estado, reintentar, actualizar }
}
