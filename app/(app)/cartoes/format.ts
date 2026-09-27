/**
 * Datas curtas das telas de cartão — v1.0 — 2026-09-27 (Fase 13). Sem passar por `Date` no
 * fuso local (invariante 2): a string `YYYY-MM-DD` já tem tudo.
 */
export function formatDay(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year?.slice(2)}`
}

export function formatDayMonth(date: string): string {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}
