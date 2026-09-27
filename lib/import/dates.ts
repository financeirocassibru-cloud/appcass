import { isISODate, toISODate, type ISODate } from '@/lib/finance/date'

/**
 * Datas como os extratos escrevem. v1.0 — 2026-09-27.
 *
 * Tudo por montagem de string: nenhuma data passa por `new Date(...)`, que interpretaria
 * `2026-09-05` como meia-noite UTC e mudaria o dia em fuso negativo (invariante 2). O que
 * sai daqui é `YYYY-MM-DD` conferido por `isISODate`.
 */

const MONTHS: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  fev: 2,
  fevereiro: 2,
  mar: 3,
  marco: 3,
  abr: 4,
  abril: 4,
  mai: 5,
  maio: 5,
  jun: 6,
  junho: 6,
  jul: 7,
  julho: 7,
  ago: 8,
  agosto: 8,
  set: 9,
  setembro: 9,
  out: 10,
  outubro: 10,
  nov: 11,
  novembro: 11,
  dez: 12,
  dezembro: 12,
  // Alguns bancos exportam em inglês.
  feb: 2,
  apr: 4,
  may: 5,
  aug: 8,
  sep: 9,
  oct: 10,
  dec: 12,
}

/** Minúsculas e sem acento — "Março" e "MARCO" viram a mesma chave. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function build(year: number, month: number, day: number): ISODate | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2999) return null
  const iso = toISODate({ year, month, day })
  return isISODate(iso) ? iso : null
}

function fullYear(raw: string): number {
  const value = Number(raw)
  return raw.length === 2 ? 2000 + value : value
}

const MONTH_NAMES = Object.keys(MONTHS).join('|')

const PATTERNS: { re: RegExp; read: (m: RegExpExecArray, fallbackYear?: number) => ISODate | null }[] = [
  // 2026-09-05
  {
    re: /\b(\d{4})-(\d{2})-(\d{2})\b/,
    read: (m) => build(Number(m[1]), Number(m[2]), Number(m[3])),
  },
  // 05/09/2026, 05-09-2026, 05.09.26
  {
    re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/,
    read: (m) => build(fullYear(m[3] ?? ''), Number(m[2]), Number(m[1])),
  },
  // 05 SET 2026, 5 de setembro de 2026, 05 set. 2026
  {
    re: new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${MONTH_NAMES})\\.?\\s*(?:de\\s+)?(\\d{4})\\b`),
    read: (m) => build(Number(m[3]), MONTHS[m[2] ?? ''] ?? 0, Number(m[1])),
  },
  // 05 SET (ano do período)
  {
    re: new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${MONTH_NAMES})\\b\\.?`),
    read: (m, y) => (y ? build(y, MONTHS[m[2] ?? ''] ?? 0, Number(m[1])) : null),
  },
  // 05/09 (ano do período)
  {
    re: /\b(\d{1,2})\/(\d{1,2})\b(?![/\d])/,
    read: (m, y) => (y ? build(y, Number(m[2]), Number(m[1])) : null),
  },
]

/**
 * Procura uma data dentro do texto. `fallbackYear` completa as formas sem ano.
 *
 * `anchored` exige que a data seja o texto inteiro — é o modo de uma coluna de data de CSV
 * ou de uma célula de PDF, onde uma data solta no meio da descrição ("99* POP 04Set") não
 * pode virar o dia do lançamento.
 */
export function parseStatementDate(
  raw: string,
  { fallbackYear, anchored = false }: { fallbackYear?: number; anchored?: boolean } = {},
): ISODate | null {
  const text = fold(raw).replace(/\s+/g, ' ').trim()
  if (text === '') return null

  for (const { re, read } of PATTERNS) {
    const match = re.exec(text)
    if (!match) continue
    if (anchored && match[0].trim().replace(/\.$/, '') !== text.replace(/\.$/, '')) continue
    const iso = read(match, fallbackYear)
    if (iso) return iso
  }
  return null
}

/** Todas as datas completas (com ano) que aparecem no texto — para achar o período. */
export function findFullDates(raw: string): ISODate[] {
  const text = fold(raw)
  const found: ISODate[] = []
  const res = [
    /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
    new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${MONTH_NAMES})\\.?\\s*(?:de\\s+)?(\\d{4})\\b`, 'g'),
  ]
  res.forEach((re, index) => {
    for (const m of text.matchAll(re)) {
      const iso =
        index === 0
          ? build(Number(m[1]), Number(m[2]), Number(m[3]))
          : index === 1
            ? build(Number(m[3]), Number(m[2]), Number(m[1]))
            : build(Number(m[3]), MONTHS[m[2] ?? ''] ?? 0, Number(m[1]))
      if (iso) found.push(iso)
    }
  })
  return found
}
