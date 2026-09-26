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
 *
 * v1.1 — 2026-09-26: entraram `tickOffsets`, para a Análise desenhar o eixo Y em DOM e
 * mantê-lo fixo enquanto o gráfico rola na horizontal, e `categoryDeviation`, para o gráfico
 * de "fora da curva".
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

/**
 * Marcas de eixo para uma série que atravessa o zero.
 *
 * `niceTicks` assume que a escala começa em zero, o que serve a barras mas não
 * ao saldo projetado: ele pode ficar negativo, e é justamente aí que a tela
 * precisa ser lida com atenção. Aqui o passo é arredondado pela mesma regra, e
 * as marcas cobrem o intervalo inteiro.
 *
 * O zero sempre cai numa marca quando o intervalo o atravessa — é a linha de
 * referência do gráfico, e ela não pode ficar entre duas marcas.
 */
export function niceTicksRange(minCents: number, maxCents: number, targetCount = 4): number[] {
  if (!Number.isFinite(minCents) || !Number.isFinite(maxCents)) return [0]
  if (!Number.isInteger(targetCount) || targetCount < 1) {
    throw new Error(`Número de marcas inválido: ${targetCount}`)
  }

  const low = Math.min(minCents, 0)
  const high = Math.max(maxCents, 0)
  if (low === high) return [0]

  const step = niceStep((high - low) / targetCount)
  const first = Math.floor(low / step) * step
  const last = Math.ceil(high / step) * step

  const ticks: number[] = []
  for (let value = first; value <= last; value += step) {
    // `Math.round` fecha o resíduo de ponto flutuante que a soma repetida
    // acumularia: as marcas são centavos inteiros.
    ticks.push(Math.round(value))
  }
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

/**
 * Posição vertical, em pixels, de cada marca do eixo.
 *
 * Existe para o eixo Y poder ser desenhado como DOM, fora do SVG — que é o que permite
 * fixá-lo enquanto o gráfico rola na horizontal. Um `<YAxis>` dentro do rolador rolaria junto,
 * e um segundo gráfico sobreposto só para o eixo obrigaria a manter altura, margem e domínio
 * de dois gráficos em sincronia, que é o tipo de coisa que desanda na primeira mudança.
 *
 * A conta é a mesma que o Recharts faz internamente; aqui ela fica onde pode ser provada.
 *
 * Centavos entram, pixels saem: é **apresentação**. O rótulo continua passando por
 * `formatCentsCompact`, e nenhum valor em pixel volta a ser tratado como dinheiro
 * (invariante 1).
 */
export function tickOffsets(
  ticks: readonly number[],
  plotHeight: number,
  marginTop: number,
  marginBottom: number,
): { value: number; topPx: number }[] {
  const low = ticks[0]
  const high = ticks[ticks.length - 1]
  if (low === undefined || high === undefined) return []

  const area = plotHeight - marginTop - marginBottom
  // Domínio degenerado (série constante): tudo cai no meio, e não numa divisão por zero.
  if (high === low) return ticks.map((value) => ({ value, topPx: marginTop + area / 2 }))

  return ticks.map((value) => ({
    value,
    topPx: marginTop + ((high - value) / (high - low)) * area,
  }))
}

export interface CategoryDeviation {
  categoryId: string | null
  name: string
  color: string
  /** Média mensal no período consultado. */
  currentCents: number
  /** Média mensal no período de comparação. */
  baselineCents: number
  deltaCents: number
  /** Variação relativa. `null` quando não há base — categoria nova não tem "+∞%". */
  deltaRatio: number | null
  isNew: boolean
}

/**
 * Quanto cada categoria fugiu do próprio padrão.
 *
 * Responde "onde este período saiu da curva", que é diferente de "onde gastei mais" — o
 * ranking de categorias já responde a segunda. Uma categoria pequena que dobrou merece ser
 * vista; a maior de todas, estável, não é notícia.
 *
 * Os dois lados são normalizados para **média por mês** antes de comparar: sem isso, um
 * período de três meses contra uma base de doze acusaria queda em tudo. A divisão é de
 * apresentação — é uma média para comparar, nunca um total a reconciliar com lançamento
 * nenhum.
 *
 * Categoria sem histórico sai com `deltaRatio: null` e `isNew: true`. Dividir por zero daria
 * `Infinity`, que a tela mostraria como "+Infinity%".
 */
export function categoryDeviation(
  current: readonly CategorySlice[],
  baseline: readonly CategorySlice[],
  options: { currentMonths: number; baselineMonths: number },
): CategoryDeviation[] {
  const { currentMonths, baselineMonths } = options
  if (currentMonths < 1 || baselineMonths < 1) {
    throw new Error(`Número de meses inválido: ${currentMonths}/${baselineMonths}`)
  }

  const baselineByKey = new Map<string, CategorySlice>()
  for (const slice of baseline) baselineByKey.set(slice.categoryId ?? '', slice)

  const keys = new Set<string>([
    ...current.map((slice) => slice.categoryId ?? ''),
    ...baseline.map((slice) => slice.categoryId ?? ''),
  ])
  const currentByKey = new Map<string, CategorySlice>()
  for (const slice of current) currentByKey.set(slice.categoryId ?? '', slice)

  const rows: CategoryDeviation[] = []
  for (const key of keys) {
    const now = currentByKey.get(key)
    const before = baselineByKey.get(key)
    const identity = now ?? before
    if (!identity) continue

    const currentCents = Math.round((now?.totalCents ?? 0) / currentMonths)
    const baselineCents = Math.round((before?.totalCents ?? 0) / baselineMonths)

    // Categoria que não gastou nem antes nem agora não é informação.
    if (currentCents === 0 && baselineCents === 0) continue

    rows.push({
      categoryId: identity.categoryId,
      name: identity.name,
      color: identity.color,
      currentCents,
      baselineCents,
      deltaCents: currentCents - baselineCents,
      deltaRatio: baselineCents > 0 ? (currentCents - baselineCents) / baselineCents : null,
      isNew: baselineCents === 0,
    })
  }

  // O que mais fugiu primeiro, em reais — a variação percentual de um valor pequeno é ruído.
  return rows.sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents))
}

/** Chave de mês da data informada — ponte entre `ISODate` e `MonthKey`. */
export function monthKeyOf(date: ISODate): MonthKey {
  parseISODate(date)
  return monthKey(date)
}
