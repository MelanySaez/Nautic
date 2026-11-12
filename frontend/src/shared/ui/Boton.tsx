import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'
import type { LinkProps } from 'react-router'
import { Enlace } from './Enlace'

export type VarianteBoton = 'primario' | 'accion' | 'secundario' | 'fantasma'

const BASE =
  'inline-flex items-center justify-center gap-2 rounded px-4 py-2.5 font-mono text-xs font-medium tracking-wider uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50'

const VARIANTES: Record<VarianteBoton, string> = {
  primario: 'bg-primary text-on-primary hover:opacity-90',
  accion: 'bg-accent text-on-accent hover:opacity-90',
  secundario: 'border border-line-strong text-ink hover:border-accent',
  fantasma: 'text-ink-muted hover:bg-surface-2 hover:text-ink',
}

function clasesBoton(variante: VarianteBoton = 'primario', extra = ''): string {
  return `${BASE} ${VARIANTES[variante]} ${extra}`
}

type BotonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBoton }

export function Boton({ variante = 'primario', className = '', type = 'button', ...props }: BotonProps) {
  return <button type={type} className={clasesBoton(variante, className)} {...props} />
}

type EnlaceBotonProps = LinkProps & { variante?: VarianteBoton }

export function EnlaceBoton({ variante = 'primario', className = '', ...props }: EnlaceBotonProps) {
  return <Enlace className={clasesBoton(variante, className)} {...props} />
}

type AnclaBotonProps = AnchorHTMLAttributes<HTMLAnchorElement> & { variante?: VarianteBoton }

/** Plain anchor styled as a button, for links the router must not handle (file downloads). */
export function AnclaBoton({ variante = 'primario', className = '', ...props }: AnclaBotonProps) {
  return <a className={clasesBoton(variante, className)} {...props} />
}
