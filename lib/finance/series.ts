import { addMonths, monthKey, parseISODate, type ISODate } from './date'

/**
 * Séries para os gráficos, com os buracos preenchidos.
 *
 * Um mês sem lançamento simplesmente não existe em `v_monthly_summary` — um
 * `group by` não inventa linha vazia. Se o gráfico plotar o que vem do banco,
 * esse mês desaparece do eixo e as barras vizinhas ficam lado a lado como se
 * fossem consecutivas, o que mente sobre o intervalo. Aqui a série é construída
 * a partir do calendário e os dados são encaixados nela.
 *
 * Puro: o mês de referência entra por parâmetro (invariante 9).
 */

/** Chave de mês `YYYY-MM`. */
export type MonthKey = string

const MONTH_KEY = /^(\d{4})-(\d{2})$/

export interface MonthlyTotals {
  month: MonthKey
  incomeCents: number
  expenseCents: number
  netCents: number
}

/** Os N meses que terminam em `endMonth`, do mais antigo para o mais recente. */
export function lastMonthKeys(endMonth: MonthKey, count: number): MonthKey[] {
  if (!MONTH_KEY.test(endMonth)) {
    throw new Error(`Mês inválido: esperado YYYY-MM, recebido "${endMonth}"`)
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Quantidade de meses inválida: ${count}`)
  }

  // Dia 1 para a aritmética de meses não precisar de ajuste de fim de mês.
  const anchor = `${endMonth}-01`
  parseISODate(anchor)

  const keys: MonthKey[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    keys.push(monthKey(addMonths(anchor, -offset)))
  }
  return keys
}

/**
 * Encaixa os totais que vieram do banco na série de meses do calendário.
 *
 * Mês ausente vira zero, e não some. Mês fora do intervalo é descartado: quem
 * decide o intervalo é `endMonth`/`count`, não o que o banco devolveu.
 */
export function buildMonthlySeries(
  rows: readonly MonthlyTotals[],
  endMonth: MonthKey,
  count: number,
): MonthlyTotals[] {
  const byMonth = new Map<MonthKey, MonthlyTotals>()
  for (const row of rows) byMonth.set(row.month, row)

  return lastMonthKeys(endMonth, count).map(
    (month) =>
      byMonth.get(month) ?? { month, incomeCents: 0, expenseCents: 0, netCents: 0 },
  )
}

const MONTH_SHORT = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })

/**
 * Rótulo curto do mês para o eixo: "set", e "set/25" quando o ano muda.
 *
 * `timeZone: 'UTC'` sobre uma data montada em UTC, pelo mesmo motivo de
 * `formatDayLabel`: o mês formatado tem de ser o mês da chave, em qualquer
 * máquina.
 */
export function formatMonthLabel(month: MonthKey, referenceMonth?: MonthKey): string {
  const { year, month: monthNumber } = parseISODate(`${month}-01`)
  const asUtc = new Date(Date.UTC(year, monthNumber - 1, 1))
  const short = MONTH_SHORT.format(asUtc).replace('.', '')

  if (referenceMonth && referenceMonth.slice(0, 4) !== month.slice(0, 4)) {
    return `${short}/${month.slice(2, 4)}`
  }
  return short
}

const MONTH_LONG = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** Mês por extenso, para cabeçalho: "setembro de 2026". */
export function formatMonthLong(month: MonthKey): string {
  const { year, month: monthNumber } = parseISODate(`${month}-01`)
  return MONTH_LONG.format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}

/**
 * Valores de eixo em números redondos.
 *
 * Deixar a biblioteca escolher produz marcas como "R$ 3,5 mil" e "R$ 10,5 mil",
 * que o leitor tem de decifrar antes de comparar. Aqui o passo é arredondado
 * para 1, 2 ou 5 vezes uma potência de dez — a mesma regra que qualquer eixo
 * legível usa — e as marcas saem em 0, 5 mil, 10 mil, 15 mil.
 *
 * Trabalha em centavos inteiros, como todo o resto do módulo.
 */
function niceStep(rough: number): number {
  if (rough <= 1) return 1
  const exponent = Math.floor(Math.log10(rough))
  const base = 10 ** exponent
  const fraction = rough / base

  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * base
}

export function niceTicks(maxCents: number, targetCount = 4): number[] {
  if (!Number.isFinite(maxCents) || maxCents <= 0) return [0]
  if (!Number.isInteger(targetCount) || targetCount < 1) {
    throw new Error(`Número de marcas inválido: ${targetCount}`)
  }

  const step = niceStep(maxCents / targetCount)
  const ticks: number[] = []
  // O laço multiplica em vez de acumular: somar em ponto flutuante acumularia
  // erro e a última marca sairia em 14999999,999.
  for (let index = 0; index * step < maxCents; index += 1) {
    ticks.push(index * step)
  }
  // Uma marca acima do maior valor, para a barra mais alta não encostar no topo.
  ticks.push(ticks.length * step)
  return ticks
}

export interface CategorySlice {
  categoryId: string | null
  name: string
  color: string
  totalCents: number
}

/**
 * Ordena as fatias da rosca e agrupa a cauda em "Outros".
 *
 * Doze fatias numa rosca de celular são doze fatias ilegíveis. O corte mantém
 * as maiores e soma o resto num único pedaço, que continua somando o total —
 * uma rosca cuja soma não fecha com o total do mês é pior que nenhuma.
 */
export function topCategories(
  slices: readonly CategorySlice[],
  max: number,
  otherLabel = 'Outros',
  otherColor = '#94a3b8',
): CategorySlice[] {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`Número de fatias inválido: ${max}`)
  }

  const sorted = [...slices]
    .filter((slice) => slice.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents)

  if (sorted.length <= max) return sorted

  const head = sorted.slice(0, max - 1)
  const tail = sorted.slice(max - 1)
  const tailTotal = tail.reduce((total, slice) => total + slice.totalCents, 0)

  return [
    ...head,
    { categoryId: null, name: otherLabel, color: otherColor, totalCents: tailTotal },
  ]
}

/** Chave de mês da data informada — ponte entre `ISODate` e `MonthKey`. */
export function monthKeyOf(date: ISODate): MonthKey {
  parseISODate(date)
  return monthKey(date)
}
