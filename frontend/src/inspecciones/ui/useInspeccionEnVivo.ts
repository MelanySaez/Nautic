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
 * Loads an inspection with the hull sections of its vessel and keeps its photos in sync with
 * the server-sent events of that inspection while mounted.
 */
export function useInspeccionEnVivo(inspeccionId: number) {
  const { inspecciones, eventos } = useDependencias()

  const cargar = useCallback(
    async (): Promise<DatosInspeccion> => {
      // The sections belong to the inspection's vessel, which is only known once it is loaded.
      const detalle = await inspecciones.obtener(inspeccionId)
      const secciones = await inspecciones.listarSecciones(detalle.buqueId)
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
