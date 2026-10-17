import { useCallback, useEffect } from 'react'
import { useDependencias } from '../../app/useDependencias'
import { useRecurso } from '../../shared/hooks/useRecurso'
import type { EventoInspeccion, InspeccionDetalle, SeccionCasco } from '../domain/inspeccion'
import { aplicarEvento } from '../domain/reglas'

export interface DatosInspeccion {
  detalle: InspeccionDetalle
  secciones: SeccionCasco[]
}

/**
 * Loads an inspection with the hull-section catalog and keeps its photos in sync with
 * the server-sent events of that inspection while mounted.
 */
export function useInspeccionEnVivo(inspeccionId: number) {
  const { inspecciones, eventos } = useDependencias()

  const cargar = useCallback(
    async (): Promise<DatosInspeccion> => {
      const [detalle, secciones] = await Promise.all([
        inspecciones.obtener(inspeccionId),
        inspecciones.listarSecciones(),
      ])
      return { detalle, secciones }
    },
    [inspecciones, inspeccionId],
  )
  const { estado, reintentar, actualizar } = useRecurso(cargar)

  const aplicar = useCallback(
    (evento: EventoInspeccion) =>
      actualizar((datos) => ({ ...datos, detalle: { ...datos.detalle, fotos: aplicarEvento(datos.detalle.fotos, evento) } })),
    [actualizar],
  )

  useEffect(() => eventos.suscribir(inspeccionId, aplicar), [eventos, inspeccionId, aplicar])

  return { estado, reintentar, aplicar }
}
