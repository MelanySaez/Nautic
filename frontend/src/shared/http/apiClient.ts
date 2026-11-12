/** Per-field validation messages keyed by the API's snake_case field names. */
export type ErroresDeCampo = Record<string, string[]>

export class ApiError extends Error {
  readonly status: number
  /** Field-level messages from a 400 `{"campos": {...}}` body; undefined when the body has none. */
  readonly campos?: ErroresDeCampo

  constructor(status: number, message: string, campos?: ErroresDeCampo) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.campos = campos
  }
}

export type Fetcher = typeof fetch

/** Base URL of the Django backend; empty means same origin (Vite dev proxy). */
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

/** Keeps only the entries of `campos` that are arrays of strings; undefined when none survive. */
function erroresDeCampo(campos: unknown): ErroresDeCampo | undefined {
  if (!campos || typeof campos !== 'object' || Array.isArray(campos)) return undefined
  const validos: ErroresDeCampo = {}
  for (const [campo, mensajes] of Object.entries(campos)) {
    if (Array.isArray(mensajes) && mensajes.every((m) => typeof m === 'string')) validos[campo] = mensajes
  }
  return Object.keys(validos).length > 0 ? validos : undefined
}

async function errorDeRespuesta(respuesta: Response): Promise<ApiError> {
  try {
    const cuerpo: unknown = await respuesta.json()
    if (cuerpo && typeof cuerpo === 'object') {
      const { error, detail, campos } = cuerpo as { error?: unknown; detail?: unknown; campos?: unknown }
      const mensaje = typeof error === 'string' && error ? error : typeof detail === 'string' && detail ? detail : null
      if (mensaje) return new ApiError(respuesta.status, mensaje, erroresDeCampo(campos))
    }
  } catch {
    // Non-JSON body (HTML error page, empty body): fall through to the generic message.
  }
  return new ApiError(respuesta.status, `El servidor respondió con un error (${respuesta.status}).`)
}

export class ApiClient {
  private readonly baseUrl: string
  private readonly fetcher: Fetcher

  constructor(baseUrl: string, fetcher: Fetcher = (...args) => fetch(...args)) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.fetcher = fetcher
  }

  async request<T>(ruta: string, init: RequestInit = {}): Promise<T> {
    let respuesta: Response
    try {
      respuesta = await this.fetcher(`${this.baseUrl}${ruta}`, init)
    } catch {
      throw new ApiError(0, 'No se pudo conectar con el servidor.')
    }
    if (!respuesta.ok) {
      throw await errorDeRespuesta(respuesta)
    }
    if (respuesta.status === 204) return undefined as T
    return (await respuesta.json()) as T
  }

  get<T>(ruta: string): Promise<T> {
    return this.request<T>(ruta)
  }

  post<T>(ruta: string, cuerpo?: unknown): Promise<T> {
    if (cuerpo instanceof FormData) {
      return this.request<T>(ruta, { method: 'POST', body: cuerpo })
    }
    return this.request<T>(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
  }

  patch<T>(ruta: string, cuerpo: unknown): Promise<T> {
    return this.request<T>(ruta, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
  }

  delete(ruta: string): Promise<void> {
    return this.request<void>(ruta, { method: 'DELETE' })
  }
}

/**
 * Resolves a media reference to a loadable URL. REST responses already carry absolute
 * URLs, but SSE events carry the raw stored path (`media/...`).
 */
export function resolverUrlMedia(ruta: string | null, baseUrl: string): string | null {
  if (!ruta) return null
  if (/^https?:\/\//.test(ruta)) return ruta
  return `${baseUrl.replace(/\/+$/, '')}/${ruta.replace(/\\/g, '/').replace(/^\/+/, '')}`
}
