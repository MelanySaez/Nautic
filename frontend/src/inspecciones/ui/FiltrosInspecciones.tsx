import type { Buque } from '../../buques/domain/buque'
import { Boton } from '../../shared/ui/Boton'
import { Campo } from '../../shared/ui/Campo'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import { MIN_CARACTERES_BUSQUEDA } from './filtroUrl'

export type CampoFiltro = 'buque' | 'desde' | 'hasta' | 'severidad_min'

export interface ValoresFiltros {
  buque: string
  desde: string
  hasta: string
  severidadMin: string
  texto: string
}

const NIVELES = [
  { valor: 'low', texto: 'Baja' },
  { valor: 'medium', texto: 'Media' },
  { valor: 'high', texto: 'Alta' },
  { valor: 'critical', texto: 'Crítica' },
]

export function FiltrosInspecciones({
  valores,
  buques,
  errores,
  hayFiltros,
  alCambiar,
  alEscribir,
  alLimpiar,
}: {
  valores: ValoresFiltros
  buques: Buque[]
  /** First server message per control, keyed by the API field name. */
  errores: Partial<Record<CampoFiltro | 'q', string>>
  hayFiltros: boolean
  alCambiar: (campo: CampoFiltro, valor: string) => void
  alEscribir: (texto: string) => void
  alLimpiar: () => void
}) {
  const textoCorto = valores.texto.trim().length > 0 && valores.texto.trim().length < MIN_CARACTERES_BUSQUEDA
  return (
    <form
      role="search"
      aria-label="Filtrar inspecciones"
      onSubmit={(e) => e.preventDefault()}
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div className="sm:col-span-2 lg:col-span-4">
        <Campo
          etiqueta="Buscar por nombre"
          error={errores.q}
          ayuda={textoCorto ? `Escriba al menos ${MIN_CARACTERES_BUSQUEDA} caracteres.` : undefined}
        >
          <input
            type="search"
            value={valores.texto}
            maxLength={100}
            onChange={(e) => alEscribir(e.target.value)}
            placeholder="Nombre de la inspección…"
            className={CLASES_CONTROL}
          />
        </Campo>
      </div>
      <Campo etiqueta="Buque" error={errores.buque}>
        <select value={valores.buque} onChange={(e) => alCambiar('buque', e.target.value)} className={CLASES_CONTROL}>
          <option value="">Todos los buques</option>
          {buques.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Desde" error={errores.desde}>
        <input type="date" value={valores.desde} onChange={(e) => alCambiar('desde', e.target.value)} className={CLASES_CONTROL} />
      </Campo>
      <Campo etiqueta="Hasta" error={errores.hasta}>
        <input type="date" value={valores.hasta} onChange={(e) => alCambiar('hasta', e.target.value)} className={CLASES_CONTROL} />
      </Campo>
      <Campo etiqueta="Severidad mínima" error={errores.severidad_min}>
        <select
          value={valores.severidadMin}
          onChange={(e) => alCambiar('severidad_min', e.target.value)}
          className={CLASES_CONTROL}
        >
          <option value="">Cualquiera</option>
          {NIVELES.map((n) => (
            <option key={n.valor} value={n.valor}>
              {n.texto}
            </option>
          ))}
        </select>
      </Campo>
      {hayFiltros && (
        <div className="sm:col-span-2 lg:col-span-4">
          <Boton variante="fantasma" onClick={alLimpiar}>
            Limpiar filtros
          </Boton>
        </div>
      )}
    </form>
  )
}
