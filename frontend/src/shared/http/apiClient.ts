export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export type Fetcher = typeof fetch

/** Base URL of the Django backend; empty means same origin (Vite dev proxy). */
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

async function mensajeDeError(respuesta: Response): Promise<string> {
  try {
    const cuerpo: unknown = await respuesta.json()
    if (cuerpo && typeof cuerpo === 'object') {
      const { error, detail } = cuerpo as { error?: unknown; detail?: unknown }
      if (typeof error === 'string' && error) return error
      if (typeof detail === 'string' && detail) return detail
    }
  } catch {
    // Non-JSON body (HTML error page, empty body): fall through to the generic message.
  }
  return `El servidor respondió con un error (${respuesta.status}).`
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
      throw new ApiError(respuesta.status, await mensajeDeError(respuesta))
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
