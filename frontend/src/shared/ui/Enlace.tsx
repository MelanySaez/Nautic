import { Link, NavLink, type LinkProps, type NavLinkProps } from 'react-router'

/*
 * App-wide navigation primitives. Every route change animates through the View Transitions API
 * (cross-fade plus shared elements, see `src/index.css`); browsers without it navigate instantly.
 * Use these (and `useNavegar` from `shared/hooks`) instead of react-router's Link, NavLink and
 * useNavigate so no navigation forgets it.
 */

export function Enlace({ viewTransition = true, ...props }: LinkProps) {
  return <Link viewTransition={viewTransition} {...props} />
}

export function EnlaceNav({ viewTransition = true, ...props }: NavLinkProps) {
  return <NavLink viewTransition={viewTransition} {...props} />
}
