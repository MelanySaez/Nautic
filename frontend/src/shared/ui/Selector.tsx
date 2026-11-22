import type { SelectHTMLAttributes } from 'react'
import { CLASES_CONTROL } from './clasesControl'
import { Icon } from './Icon'

/**
 * Native select with the form control look and its own arrow, kept off the right edge.
 * It forwards every prop (`id`, `aria-*` from `Campo` included) to the `<select>`.
 */
export function Selector({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={`${CLASES_CONTROL} cursor-pointer appearance-none pr-11 ${className}`} />
      <Icon
        name="chevron"
        className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink-muted"
      />
    </div>
  )
}
