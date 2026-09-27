import { APP_TIMEZONE, todayISO, type ISODate } from '@/lib/finance/date'

/**
 * "Ver lançamentos": o que foi cadastrado, na ordem em que foi gravado.
 *
 * v1.0 — 2026-09-27.
 *
 * O Histórico ordena pela data de competência — quando o dinheiro entrou ou saiu. Aqui a
 * pergunta é outra: "o que eu registrei ontem?". Três tabelas respondem juntas (lançamento
 * avulso, regra de conta/renda fixa e plano de parcelamento), e cada uma é lida já ordenada
 * por `created_at desc`; este módulo só as intercala.
 *
 * Puro: o dia de criação é calculado no fuso do app a partir do instante gravado, via
 * `todayISO(fuso, instante)` — nunca com `toISOString().split('T')[0]`, que devolveria o dia
 * em UTC e jogaria para amanhã tudo o que foi lançado depois das 21h (invariante 2).
 */

export type FeedItemType = 'entry' | 'recurring' | 'installment'

export interface FeedItemBase {
  type: FeedItemType
  id: string
  /** `timestamptz` como o PostgREST devolve (ISO-8601 com fuso). */
  createdAt: string
}

/**
 * Chave ordenável de um instante, com precisão de microssegundo.
 *
 * O Postgres grava microssegundos e o `Date` só guarda milissegundos: duas linhas criadas no
 * mesmo milissegundo empatariam aqui e desempatariam de outro jeito no banco, e o cursor da
 * página seguinte pularia ou repetiria uma delas. O `toISOString()` aqui é só o prefixo UTC
 * até o milissegundo — nunca a data de calendário, que sai de `createdDay`.
 */
export function instantKey(createdAt: string): string {
  const micro = /\.(\d+)/.exec(createdAt)?.[1]?.padEnd(6, '0').slice(3, 6) ?? '000'
  return `${new Date(Date.parse(createdAt)).toISOString().slice(0, 23)}${micro}`
}

/** A ordem do feed: mais recente primeiro; no mesmo instante, `id` decrescente — como no banco. */
export function compareFeed(a: FeedItemBase, b: FeedItemBase): number {
  const ka = instantKey(a.createdAt)
  const kb = instantKey(b.createdAt)
  if (ka !== kb) return ka < kb ? 1 : -1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

/** Intercala listas já ordenadas por `createdAt desc` e corta nas `limit` mais recentes. */
export function mergeByCreatedAt<T extends FeedItemBase>(
  lists: readonly (readonly T[])[],
  limit: number,
): T[] {
  return lists.flat().sort(compareFeed).slice(0, limit)
}

/**
 * O cursor da próxima página: instante e `id` do último item exibido.
 *
 * Só o instante não basta: uma importação de extrato grava dezenas de lançamentos no mesmo
 * `insert`, com o mesmo `created_at`, e `created_at < cursor` pularia os que sobraram.
 */
export function feedCursor(item: FeedItemBase): string {
  return `${item.createdAt}~${item.id}`
}

export function parseFeedCursor(value: string | undefined): { createdAt: string; id: string } | null {
  if (!value) return null
  const [createdAt, id] = value.split('~')
  if (!createdAt || !id || Number.isNaN(Date.parse(createdAt))) return null
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  return { createdAt, id }
}

/** O dia, no fuso do app, em que o instante gravado aconteceu. */
export function createdDay(createdAt: string, timeZone: string = APP_TIMEZONE): ISODate {
  return todayISO(timeZone, new Date(createdAt))
}

/** `HH:mm` no fuso do app. */
export function createdTime(createdAt: string, timeZone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(createdAt))
}
