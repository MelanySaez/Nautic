import type { Buque } from './buque'

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Keeps the vessels whose name or type contains the query, ignoring case and accents. */
export function filtrarBuques(buques: Buque[], consulta: string): Buque[] {
  const termino = normalizar(consulta)
  if (!termino) return buques
  return buques.filter((b) => normalizar(b.nombre).includes(termino) || normalizar(b.tipo).includes(termino))
}
