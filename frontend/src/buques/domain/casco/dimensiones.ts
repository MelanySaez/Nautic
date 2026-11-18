import type { DatosTecnicosBuque } from '../buque'
import type { Arquetipo } from './arquetipo'

/** The four technical-sheet measures the hull needs; `BuqueDetalle` satisfies it as it is. */
export type MedidasCasco = Partial<
  Pick<DatosTecnicosBuque, 'esloraTotalM' | 'mangaMoldeadaM' | 'puntalM' | 'caladoDisenoM'>
>

/** Main hull measurements in meters: length L, beam B, depth D and draft T. */
export interface DimensionesCasco {
  eslora: number
  manga: number
  puntal: number
  calado: number
}

/** A usable measure: a finite number above zero. Anything else counts as missing. */
function medida(valor: number | null | undefined): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? valor : null
}

/**
 * Hull measurements from the technical sheet, falling back to the archetype for missing or
 * inconsistent values, in this order:
 * - L: the length, else the beam / (B/L), else the archetype default length;
 * - B: the beam when it is below L/2, else L · (B/L);
 * - D: the depth, else B · (D/B);
 * - T: the draft when it is below D, else D · (T/D).
 */
export function dimensionesCasco(ficha: MedidasCasco, arquetipo: Arquetipo): DimensionesCasco {
  const { mangaEslora, puntalManga, caladoPuntal } = arquetipo.proporciones
  const esloraFicha = medida(ficha.esloraTotalM)
  const mangaFicha = medida(ficha.mangaMoldeadaM)
  const puntalFicha = medida(ficha.puntalM)
  const caladoFicha = medida(ficha.caladoDisenoM)

  const eslora = esloraFicha ?? (mangaFicha !== null ? mangaFicha / mangaEslora : arquetipo.esloraPorDefecto)
  const manga = mangaFicha !== null && mangaFicha < eslora / 2 ? mangaFicha : eslora * mangaEslora
  const puntal = puntalFicha ?? manga * puntalManga
  const calado = caladoFicha !== null && caladoFicha < puntal ? caladoFicha : puntal * caladoPuntal
  return { eslora, manga, puntal, calado }
}
