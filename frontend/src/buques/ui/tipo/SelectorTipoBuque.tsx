import { useId } from 'react'
import { TIPOS_BUQUE, tipoBuqueDe } from '../../domain/tiposBuque'
import { MiniaturaCasco } from './MiniaturaCasco'

/**
 * The vessel type as a grid of cards (a radio group): each card shows the type's hull turning
 * slowly and its name. The value is the type name, which the backend stores as `tipo`. A stored
 * type from before the catalogue is named and kept until another one is chosen.
 */
export function SelectorTipoBuque({
  valor,
  error,
  alCambiar,
}: {
  valor: string
  error?: string
  alCambiar: (nombre: string) => void
}) {
  const id = useId()
  const idMensaje = `${id}-mensaje`
  const actual = tipoBuqueDe(valor)
  const fueraDeCatalogo = valor.trim() !== '' && actual === null

  return (
    <fieldset
      role="radiogroup"
      aria-labelledby={`${id}-titulo`}
      aria-describedby={error || fueraDeCatalogo ? idMensaje : undefined}
      aria-invalid={error ? true : undefined}
      className="flex flex-col gap-2"
    >
      <legend id={`${id}-titulo`} className="mb-1.5 text-sm font-semibold">
        Tipo
      </legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TIPOS_BUQUE.map((tipo) => {
          const elegido = actual?.id === tipo.id
          return (
            <label
              key={tipo.id}
              className={`flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-surface-2 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                elegido ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-ink-dim'
              }`}
            >
              <input
                type="radio"
                name={`${id}-tipo`}
                value={tipo.nombre}
                checked={elegido}
                onChange={() => alCambiar(tipo.nombre)}
                className="sr-only"
              />
              {/* Decorative: the radio is named by the type name below. */}
              <div aria-hidden="true" className="aspect-[4/3] w-full">
                <MiniaturaCasco nombre={tipo.nombre} arquetipo={tipo.arquetipo} seleccionado={elegido} />
              </div>
              <span
                className={`border-t px-3 py-2 text-center text-sm font-semibold ${
                  elegido ? 'border-accent text-accent-ink' : 'border-line text-ink'
                }`}
              >
                {tipo.nombre}
              </span>
            </label>
          )
        })}
      </div>
      {error ? (
        <p id={idMensaje} className="text-sm text-critical">
          {error}
        </p>
      ) : (
        fueraDeCatalogo && (
          <p id={idMensaje} className="text-sm text-ink-dim">
            Tipo actual: {valor.trim()}. Elige uno de la lista para cambiarlo.
          </p>
        )
      )}
    </fieldset>
  )
}
