/**
 * Where a back link may return to, read from the location state: only the app's inspection
 * pages count (never another site such as `//host/...`), anything else is `undefined`.
 */
export function destinoDeVuelta(valor: unknown): string | undefined {
  return typeof valor === 'string' && (valor.startsWith('/inspecciones/') || valor.startsWith('/vision/'))
    ? valor
    : undefined
}
