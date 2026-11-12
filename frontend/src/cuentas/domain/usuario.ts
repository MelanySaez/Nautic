export interface Usuario {
  id: number
  email: string
  nombre: string
  cargo: string
  /** Django superuser: acts as the leader of every inspection. */
  esAdmin: boolean
}

export interface DatosRegistro {
  email: string
  password: string
  nombre: string
  /** Optional; sent blank when not given. */
  cargo?: string
}

/** Session-cookie authentication against the backend. */
export interface CuentasRepository {
  /** The logged-in user, or null when there is no session. */
  obtenerActual(): Promise<Usuario | null>
  iniciarSesion(email: string, password: string): Promise<Usuario>
  /** Creates the account and opens its session. */
  registrarse(datos: DatosRegistro): Promise<Usuario>
  cerrarSesion(): Promise<void>
  /** Called whenever any request finds the session missing (401). Returns the unsubscribe function. */
  alExpirarSesion(oyente: () => void): () => void
}
