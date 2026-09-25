import { compareISO, parseISODate, type ISODate } from './date'

/**
 * Agrupamento de itens datados por dia, para o extrato.
 *
 * Fica em `lib/finance` porque é lógica pura e testável — e porque o app antigo
 * errava exatamente aqui: agrupava convertendo a data para `Date` e lendo o dia
 * do fuso local, o que jogava lançamentos do dia 1º para o dia 28 do mês
 * anterior em UTC−3. Aqui o agrupamento acontece sobre a string `YYYY-MM-DD`,
 * onde não existe fuso para errar.
 */

export interface DayGroup<T> {
  date: ISODate
  items: T[]
}

/**
 * Agrupa por dia, preservando a ordem em que cada item chegou dentro do dia.
 *
 * `order` controla a ordem dos dias: `desc` (padrão) coloca o mais recente
 * primeiro, que é como um extrato se lê.
 */
export function groupByDay<T>(
  items: readonly T[],
  getDate: (item: T) => ISODate,
  order: 'asc' | 'desc' = 'desc',
): DayGroup<T>[] {
  const byDate = new Map<ISODate, T[]>()

  for (const item of items) {
    const date = getDate(item)
    // Valida cedo: uma data fora do formato viraria um grupo fantasma que o
    // usuário veria como um dia sem sentido no meio da lista.
    parseISODate(date)

    const bucket = byDate.get(date)
    if (bucket) bucket.push(item)
    else byDate.set(date, [item])
  }

  const groups: DayGroup<T>[] = [...byDate.entries()].map(([date, groupItems]) => ({
    date,
    items: groupItems,
  }))

  groups.sort((a, b) => (order === 'desc' ? compareISO(b.date, a.date) : compareISO(a.date, b.date)))

  return groups
}

const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  timeZone: 'UTC',
})

/**
 * Rótulo do cabeçalho de um dia: "hoje", "ontem", ou "seg, 05 de março".
 *
 * `timeZone: 'UTC'` no formatador não é descuido: a data já é um dia de
 * calendário sem hora, e montá-la como meia-noite UTC e formatar em UTC é o que
 * garante que o dia formatado seja o mesmo dia da string, em qualquer máquina.
 */
export function formatDayLabel(date: ISODate, today: ISODate): string {
  if (date === today) return 'Hoje'

  const { year, month, day } = parseISODate(date)
  const asUtc = new Date(Date.UTC(year, month - 1, day))

  const { year: ty, month: tm, day: td } = parseISODate(today)
  const todayUtc = new Date(Date.UTC(ty, tm - 1, td))
  const diffDays = Math.round((todayUtc.getTime() - asUtc.getTime()) / 86_400_000)

  if (diffDays === 1) return 'Ontem'
  if (diffDays === -1) return 'Amanhã'

  const weekday = WEEKDAY.format(asUtc).replace('.', '')
  return `${weekday}, ${DAY_MONTH.format(asUtc)}`
}
