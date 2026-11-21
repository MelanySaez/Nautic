import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { CLASES_CONTROL } from '../../shared/ui/clasesControl'
import type { PersonaSugerida } from '../domain/miembros'

const MINIMO_CARACTERES = 2
const ESPERA_MS = 250

/** The text worth searching by name: 2+ characters and not an email being typed. */
function consultaDe(texto: string): string | null {
  const limpio = texto.trim()
  return limpio.length >= MINIMO_CARACTERES && !limpio.includes('@') ? limpio : null
}

/**
 * Who to invite, Gmail-style: typing a name suggests registered users (name and cargo,
 * never their email) and picking one selects that user; an email can still be typed by hand.
 * Editing the text drops the pick. Receives `id` and the aria props from `Campo`.
 */
export function SelectorPersona({
  id,
  texto,
  persona,
  buscar,
  alCambiar,
  placeholder,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  id?: string
  texto: string
  persona: PersonaSugerida | null
  buscar: (texto: string) => Promise<PersonaSugerida[]>
  alCambiar: (texto: string, persona: PersonaSugerida | null) => void
  placeholder?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  const idLista = useId()
  const [resultado, setResultado] = useState<{ consulta: string; personas: PersonaSugerida[] } | null>(null)
  const [abierta, setAbierta] = useState(false)
  const [activa, setActiva] = useState(-1)
  const consulta = persona ? null : consultaDe(texto)

  useEffect(() => {
    if (consulta === null) return
    // Answers to an older text are dropped: only the latest search may fill the list.
    let vigente = true
    const temporizador = setTimeout(() => {
      buscar(consulta).then(
        (personas) => {
          if (!vigente) return
          setResultado({ consulta, personas })
          setActiva(-1)
        },
        // Suggestions are a convenience: on failure (throttled, offline) nothing is shown, and
        // never the "nadie coincide" notice, which would wrongly say the person has no account.
        () => {},
      )
    }, ESPERA_MS)
    return () => {
      vigente = false
      clearTimeout(temporizador)
    }
  }, [consulta, buscar])

  const sugerencias = consulta !== null && resultado?.consulta === consulta ? resultado.personas : []
  const expandida = abierta && sugerencias.length > 0
  // The search answered for this very text and found nobody: say how to invite them anyway.
  const sinResultados = abierta && consulta !== null && resultado?.consulta === consulta && sugerencias.length === 0
  const idOpcion = (i: number) => `${idLista}-${i}`

  function elegir(elegida: PersonaSugerida) {
    alCambiar(elegida.nombre, elegida)
    setAbierta(false)
  }

  function alTeclear(evento: KeyboardEvent<HTMLInputElement>) {
    // Escape is only taken while something is shown, so an enclosing dialog still gets it otherwise.
    if (evento.key === 'Escape' && (expandida || sinResultados)) {
      evento.preventDefault()
      setAbierta(false)
      return
    }
    if (!expandida) return
    const total = sugerencias.length
    if (evento.key === 'ArrowDown') {
      evento.preventDefault()
      setActiva((i) => (i + 1) % total)
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault()
      setActiva((i) => (i <= 0 ? total - 1 : i - 1))
    } else if (evento.key === 'Enter' && activa >= 0) {
      // Picks the suggestion instead of submitting the form.
      evento.preventDefault()
      elegir(sugerencias[activa])
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expandida}
        aria-controls={expandida ? idLista : undefined}
        aria-activedescendant={expandida && activa >= 0 ? idOpcion(activa) : undefined}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        autoComplete="off"
        value={texto}
        onChange={(e) => {
          alCambiar(e.target.value, null)
          setAbierta(true)
        }}
        onKeyDown={alTeclear}
        onBlur={() => setAbierta(false)}
        placeholder={placeholder}
        className={CLASES_CONTROL}
      />
      {expandida && (
        <ul
          id={idLista}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded border border-line bg-surface py-1 shadow-lg"
        >
          {sugerencias.map((sugerida, i) => (
            <li
              key={sugerida.id}
              id={idOpcion(i)}
              role="option"
              aria-selected={i === activa}
              // Keeps the focus in the input, so the list is not closed by its blur first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(sugerida)}
              className={`flex cursor-pointer flex-col px-3 py-2 text-sm ${i === activa ? 'bg-accent/10' : 'hover:bg-accent/5'}`}
            >
              <span className="font-medium">{sugerida.nombre}</span>
              {sugerida.cargo && <span className="text-xs text-ink-muted">{sugerida.cargo}</span>}
            </li>
          ))}
        </ul>
      )}
      {sinResultados && (
        <p
          role="status"
          className="absolute inset-x-0 top-full z-20 mt-1 rounded border border-line bg-surface px-3 py-2 text-sm text-ink-muted shadow-lg"
        >
          Nadie coincide con «{consulta}». Escribe su email completo; si aún no tiene cuenta, debe registrarse primero.
        </p>
      )}
    </div>
  )
}
