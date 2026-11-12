import { useCallback } from 'react'
import { useNavigate, type NavigateOptions, type To } from 'react-router'

/** `useNavigate` with the view transition on by default; history steps (`navegar(-1)`) are not animated. */
export function useNavegar() {
  const navigate = useNavigate()
  return useCallback(
    (destino: To, opciones?: NavigateOptions) => navigate(destino, { viewTransition: true, ...opciones }),
    [navigate],
  )
}
