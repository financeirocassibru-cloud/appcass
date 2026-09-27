import type { ISODate } from '@/lib/finance/date'
import { fold } from './dates'
import { counterpartyKey, squash, summarize } from './describe'
import type { EntryKind, ParsedRow } from './types'

/**
 * Montagem de uma linha, comum ao CSV e ao PDF. v1.0 — 2026-09-27.
 */

/** Palavras que, sem sinal nenhum no extrato, indicam dinheiro entrando. */
const INCOME_WORDS =
  /\b(recebid[oa]|recebimento|estorno|deposito|rendimento|salario|credito em conta|reembolso|devolucao|resgate de aplicacao|valor adicionado)\b/

/** Sentido deduzido pelo texto. Só vale quando o extrato não disse. */
export function inferKind(original: string): EntryKind {
  return INCOME_WORDS.test(fold(original)) ? 'income' : 'expense'
}

export interface RowInput {
  index: number
  occurredOn: ISODate
  /** Centavos com sinal quando o extrato deu sinal. */
  cents: number
  /** Sentido que o extrato declarou (sinal, coluna, grupo), ou `null` quando não declarou. */
  declaredKind: EntryKind | null
  original: string
}

/** `null` para valor zero — linha de extrato sem movimento não vira lançamento. */
export function buildRow({ index, occurredOn, cents, declaredKind, original }: RowInput): ParsedRow | null {
  if (cents === 0) return null

  const text = squash(original)
  const kind: EntryKind = declaredKind ?? inferKind(text)
  const description = summarize(text)

  return {
    index,
    occurredOn,
    kind,
    amountCents: Math.abs(cents),
    original: text,
    description,
    counterpartyKey: counterpartyKey(description),
    kindInferred: declaredKind === null,
  }
}

/** Linhas que o extrato mostra mas não são movimento: saldos e totais. */
export function isSummaryText(text: string): boolean {
  return /^(saldo|total|rendimento liquido|resumo|subtotal|lancamentos futuros)\b/.test(
    fold(squash(text)),
  )
}
