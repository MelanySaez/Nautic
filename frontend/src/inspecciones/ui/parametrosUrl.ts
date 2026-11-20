import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

const ID_POSITIVO = /^[1-9]\d*$/

/**
 * Reads a database id from the URL query. Only a canonical positive integer counts; anything else
 * (blank, zero, negative, decimal, leading zeros, too large) is treated as absent.
 */
export function idDeParametro(parametros: URLSearchParams, nombre: string): number | null {
  const valor = parametros.get(nombre)
  if (valor === null || !ID_POSITIVO.test(valor)) return null
  const id = Number(valor)
  return Number.isSafeInteger(id) ? id : null
}

/** Copy of `parametros` with `nombre` set to `valor`, or removed when it is null; the rest is kept. */
export function conParametro(
  parametros: URLSearchParams,
  nombre: string,
  valor: string | number | null,
): URLSearchParams {
  const siguientes = new URLSearchParams(parametros)
  if (valor === null) siguientes.delete(nombre)
  else siguientes.set(nombre, String(valor))
  return siguientes
}

/**
 * An id kept in the URL query (e.g. `?zona=<seccionId>`), so a page can be linked to directly.
 * Changes replace the history entry: picking a value is not a step "back" should undo.
 */
export function useIdEnUrl(nombre: string): [number | null, (id: number | null) => void] {
  const [parametros, setParametros] = useSearchParams()
  const fijar = useCallback(
    (id: number | null) => setParametros((previos) => conParametro(previos, nombre, id), { replace: true }),
    [setParametros, nombre],
  )
  return [idDeParametro(parametros, nombre), fijar]
}
