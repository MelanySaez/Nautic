import type { BuqueDetalle } from '../domain/buque'
import { GRUPOS_TECNICOS } from '../domain/fichaTecnica'

export const REQUERIDO = 'Este campo es requerido.'

export const CAMPOS_TECNICOS = GRUPOS_TECNICOS.flatMap((g) => g.campos)

/** Text fields of the "Datos generales" block. */
export const CAMPOS_GENERALES = ['nombre', 'tipo', 'etapa', 'descripcion', 'imagen'] as const

/** Raw input text keyed by form key (general fields plus the camelCase measure keys). */
export type Valores = Record<string, string>
/** Error message keyed by form key. */
export type Errores = Record<string, string>

export const VALORES_VACIOS: Valores = Object.fromEntries([
  ...CAMPOS_GENERALES.map((k) => [k, '']),
  ...CAMPOS_TECNICOS.map((c) => [c.clave, '']),
])

/** Form values for an existing sheet: unset measures and image become empty inputs. */
export function valoresDesde(buque: BuqueDetalle): Valores {
  return {
    nombre: buque.nombre,
    tipo: buque.tipo,
    etapa: buque.etapa,
    descripcion: buque.descripcion,
    imagen: buque.imagen ?? '',
    ...Object.fromEntries(CAMPOS_TECNICOS.map((c) => [c.clave, buque[c.clave] === null ? '' : String(buque[c.clave])])),
  }
}

/**
 * Client-side checks that save a round trip; the backend remains the authority.
 * `etapaRequerida`: on creation a blank stage means the backend default, on edit it is invalid.
 */
export function validar(valores: Valores, { etapaRequerida = false } = {}): Errores {
  const errores: Errores = {}
  if (!valores.nombre.trim()) errores.nombre = REQUERIDO
  if (!valores.tipo.trim()) errores.tipo = REQUERIDO
  if (etapaRequerida && !valores.etapa.trim()) errores.etapa = REQUERIDO
  for (const campo of CAMPOS_TECNICOS) {
    const texto = valores[campo.clave].trim()
    if (!texto) continue
    const numero = Number(texto)
    if (!Number.isFinite(numero)) errores[campo.clave] = 'Debe ser un número.'
    else if (numero < 0) errores[campo.clave] = 'No puede ser negativo.'
    else if (campo.entero && !Number.isInteger(numero)) errores[campo.clave] = 'Debe ser un número entero.'
  }
  return errores
}

/** Wire (snake_case) name of every form field -> form key. */
const CLAVE_POR_CAMPO_API: Record<string, string> = {
  ...Object.fromEntries(CAMPOS_GENERALES.map((k) => [k, k])),
  ...Object.fromEntries(CAMPOS_TECNICOS.map((c) => [c.claveApi, c.clave])),
}

/**
 * Splits server field errors into those that belong to a form field and the rest.
 * `extra` maps additional wire keys the page renders itself (e.g. the sections block).
 */
export function repartirErroresDelServidor(campos: Record<string, string[]>, extra: Record<string, string> = {}) {
  const delFormulario: Errores = {}
  const sinCampo: string[] = []
  for (const [claveApi, mensajes] of Object.entries(campos)) {
    const clave = extra[claveApi] ?? CLAVE_POR_CAMPO_API[claveApi]
    if (clave) delFormulario[clave] = mensajes.join(' ')
    else sinCampo.push(`${claveApi}: ${mensajes.join(' ')}`)
  }
  return { delFormulario, sinCampo }
}
