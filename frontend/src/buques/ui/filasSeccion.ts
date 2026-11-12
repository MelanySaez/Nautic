import type { NuevaSeccion } from '../domain/buque'

/** Which hull sections the new vessel gets: the 20 standard ones or a list declared by the user. */
export type ModoSecciones = 'estandar' | 'propias'

/** One editable row of the custom list; `uid` keeps the row identity while rows move or disappear. */
export interface FilaSeccion {
  uid: number
  nombre: string
  codigo: string
  descripcion: string
}

export type ErroresSecciones = Record<string, string>

/** Key of the block-level error (server `campos.secciones` or an empty list). */
export const CLAVE_ERROR_SECCIONES = 'secciones'

export function claveErrorFila(uid: number): string {
  return `seccion-${uid}`
}

export function filaVacia(uid: number): FilaSeccion {
  return { uid, nombre: '', codigo: '', descripcion: '' }
}

/** Client-side checks for the custom list: it is not empty and every row has a name. */
export function validarSecciones(modo: ModoSecciones, filas: FilaSeccion[], requerido: string): ErroresSecciones {
  const errores: ErroresSecciones = {}
  if (modo === 'estandar') return errores
  if (filas.length === 0) errores[CLAVE_ERROR_SECCIONES] = 'Declara al menos una sección.'
  for (const fila of filas) {
    if (!fila.nombre.trim()) errores[claveErrorFila(fila.uid)] = requerido
  }
  return errores
}

/** Trimmed custom sections in row order; blank code and description are left out. */
export function aNuevasSecciones(filas: FilaSeccion[]): NuevaSeccion[] {
  return filas.map(({ nombre, codigo, descripcion }) => {
    const seccion: NuevaSeccion = { nombre: nombre.trim() }
    if (codigo.trim()) seccion.codigo = codigo.trim()
    if (descripcion.trim()) seccion.descripcion = descripcion.trim()
    return seccion
  })
}
