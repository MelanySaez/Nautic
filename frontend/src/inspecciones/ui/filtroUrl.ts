import type { FiltroInspecciones, Severidad } from '../domain/inspeccion'

export const NIVELES_SEVERIDAD: Severidad[] = ['low', 'medium', 'high', 'critical']

/** Longest and shortest `q` the backend accepts is 2-100; below 2 the text is not sent. */
export const MIN_CARACTERES_BUSQUEDA = 2

/**
 * Reads the search criteria from the URL query string. Dates are passed through untouched so the
 * server reports a malformed one next to its control; values that cannot even be typed
 * (a non-numeric vessel, an unknown severity) are ignored.
 */
export function filtroDesdeParametros(parametros: URLSearchParams): FiltroInspecciones {
  const filtro: FiltroInspecciones = {}
  const buque = Number(parametros.get('buque'))
  if (Number.isInteger(buque) && buque > 0) filtro.buqueId = buque
  const desde = parametros.get('desde')
  if (desde) filtro.desde = desde
  const hasta = parametros.get('hasta')
  if (hasta) filtro.hasta = hasta
  const severidad = parametros.get('severidad_min')
  if (NIVELES_SEVERIDAD.some((nivel) => nivel === severidad)) filtro.severidadMin = severidad as Severidad
  const q = parametros.get('q')?.trim()
  if (q && q.length >= MIN_CARACTERES_BUSQUEDA) filtro.q = q
  return filtro
}
