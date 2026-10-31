import { useCallback } from 'react'
import { useDependencias } from '../../app/useDependencias'
import { useRecurso } from '../../shared/hooks/useRecurso'

/** Loads the AI model catalog once for the page. */
export function useModelos() {
  const { modelos } = useDependencias()
  const cargar = useCallback(() => modelos.listar(), [modelos])
  return useRecurso(cargar).estado
}
