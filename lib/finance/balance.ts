import { isWithin, type ISODate } from './date'
import type { EntryKind } from './types'

/**
 * Saldo atual a partir de uma âncora.
 *
 * O app antigo tinha um `ajustarSaldoAtual` que gravava um número solto e
 * esperava que nada mais o contradissesse. Aqui a âncora é um par
 * valor + data — "eu tinha tanto neste dia" — e o saldo é derivado dela:
 *
 *     saldo = âncora
 *           + Σ entradas liquidadas em [âncora, hoje]
 *           − Σ saídas   liquidadas em [âncora, hoje]
 *
 * Duas decisões que valem explicação:
 *
 * **Só liquidados.** Um gasto pendente é um compromisso, não dinheiro que já
 * saiu da conta. Contá-lo mostraria como gasto o que ainda está lá. O que
 * vence aparece na agenda, não no saldo.
 *
 * **A janela começa na âncora.** Lançamento anterior a ela já está embutido no
 * valor informado; somá-lo de novo contaria a mesma coisa duas vezes.
 *
 * Função pura: a data de hoje entra por parâmetro (invariante 9).
 */

/** O mínimo que um lançamento precisa ter para entrar no saldo. */
export interface BalanceEntry {
  kind: EntryKind
  amountCents: number
  occurredOn: ISODate
  isSettled: boolean
}

export interface BalanceInput {
  openingBalanceCents: number
  openingBalanceOn: ISODate
  today: ISODate
  entries: readonly BalanceEntry[]
}

export interface BalanceBreakdown {
  /** O saldo em si. Pode ser negativo. */
  currentCents: number
  openingBalanceCents: number
  openingBalanceOn: ISODate
  /** Entradas liquidadas dentro da janela. */
  settledIncomeCents: number
  /** Saídas liquidadas dentro da janela. */
  settledExpenseCents: number
  /** Quantos lançamentos a janela considerou — serve ao estado vazio. */
  countedEntries: number
}

export function computeBalance(input: BalanceInput): BalanceBreakdown {
  let settledIncomeCents = 0
  let settledExpenseCents = 0
  let countedEntries = 0

  for (const entry of input.entries) {
    if (!entry.isSettled) continue
    // Uma âncora no futuro deixa a janela vazia — `isWithin` já devolve false
    // quando `from > to`, então nada entra e o saldo é a própria âncora. Sem
    // isso, tratar a janela como "tudo até hoje" faria o saldo despencar.
    if (!isWithin(entry.occurredOn, input.openingBalanceOn, input.today)) continue

    countedEntries += 1
    if (entry.kind === 'income') settledIncomeCents += entry.amountCents
    else settledExpenseCents += entry.amountCents
  }

  return {
    currentCents: input.openingBalanceCents + settledIncomeCents - settledExpenseCents,
    openingBalanceCents: input.openingBalanceCents,
    openingBalanceOn: input.openingBalanceOn,
    settledIncomeCents,
    settledExpenseCents,
    countedEntries,
  }
}
