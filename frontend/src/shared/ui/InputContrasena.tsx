import { useState, type InputHTMLAttributes } from 'react'
import { CLASES_CONTROL } from './clasesControl'
import { Icon } from './Icon'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>

/** Password input with a button that shows or hides what was typed. Use inside `Campo`. */
export function InputContrasena(props: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={`${CLASES_CONTROL} pr-11`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} />
      </button>
    </div>
  )
}
