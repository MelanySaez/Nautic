import type { Foto, SeccionCasco, Severidad } from './inspeccion'
import { esHallazgo, masSevera } from './reglas'

/** State of one hull zone in an inspection: its worst finding severity, or why it has none. */
export type EstadoZona = Severidad | 'sin-clasificar' | 'sin-hallazgos' | 'sin-analizar' | 'sin-fotos'

/** What one inspection says about one hull section, read with the PDF report's rule. */
export interface ResumenZona {
  seccionId: number
  /** Photos of the section in the inspection, in any state. */
  fotos: number
  /** Photos whose analysis completed: the only ones read for findings. */
  analizadas: number
  /** Sum of the detection counts of the findings in the analyzed photos. */
  hallazgos: number
  /** Worst known taxonomy severity among the findings; null when none has one. */
  peorSeveridad: Severidad | null
  estado: EstadoZona
}

function estadoZona(fotos: number, analizadas: number, hallazgos: number, peorSeveridad: Severidad | null): EstadoZona {
  if (fotos === 0) return 'sin-fotos'
  if (analizadas === 0) return 'sin-analizar'
  if (peorSeveridad !== null) return peorSeveridad
  // Findings of unknown classes have no severity, but they are never hidden.
  return hallazgos > 0 ? 'sin-clasificar' : 'sin-hallazgos'
}

/**
 * One summary per section (keyed by `seccion.id`, sections without photos included). Like the PDF
 * report, only completed photos are read, and a finding is an anomaly that was not discarded.
 * Photos of sections that are not listed are ignored.
 */
export function resumirZonas(fotos: readonly Foto[], secciones: readonly SeccionCasco[]): Map<number, ResumenZona> {
  const fotosPorSeccion = new Map<number, Foto[]>()
  for (const foto of fotos) {
    const propias = fotosPorSeccion.get(foto.seccion.id)
    if (propias) propias.push(foto)
    else fotosPorSeccion.set(foto.seccion.id, [foto])
  }

  const resumenes = new Map<number, ResumenZona>()
  for (const { id } of secciones) {
    const propias = fotosPorSeccion.get(id) ?? []
    const analizadas = propias.filter((f) => f.estado === 'completada')
    const hallazgos = analizadas.flatMap((f) => f.detecciones.filter(esHallazgo))
    const peorSeveridad = hallazgos.reduce<Severidad | null>((peor, h) => masSevera(peor, h.severidad), null)
    resumenes.set(id, {
      seccionId: id,
      fotos: propias.length,
      analizadas: analizadas.length,
      hallazgos: hallazgos.reduce((total, h) => total + h.cantidad, 0),
      peorSeveridad,
      estado: estadoZona(propias.length, analizadas.length, hallazgos.length, peorSeveridad),
    })
  }
  return resumenes
}
