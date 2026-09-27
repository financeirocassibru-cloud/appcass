import { daysBetween, type ISODate } from './date'
import { matchKeyword } from './keywords'
import type { EntryKind } from './types'

/**
 * A linha do extrato é o item que a pessoa já cadastrou? v1.0 — 2026-09-27.
 *
 * O que foi cadastrado no [+] — avulso pendente, conta fixa, renda fixa, parcela, meta —
 * fica pendente até alguém marcar. Quando o extrato chega, a mesma movimentação aparece nele;
 * sem esta ponte, ela entrava como lançamento novo, e o saldo contava o salário duas vezes
 * (uma recebido, outra "a receber").
 *
 * A ponte é a **palavra-chave do item**: a pessoa escreve "Empresa X" na renda fixa Salário, e
 * a linha "Pix recebido de Empresa X" liquida o salário daquele mês. O casamento:
 *
 * - **mesmo tipo** (saída só liquida saída);
 * - **palavra-chave no texto** da linha (a descrição curta e o texto original do banco), com
 *   a regra de `matchKeyword` — sem acento, sem caixa, palavra curta só inteira;
 * - **vencimento perto da data da linha**: até `windowDays` (15) para um lado ou para o outro.
 *   Salário cai antes, conta é paga depois; mais que meio mês já é o item do mês vizinho.
 *   Meta não tem vencimento: todo aporte com a palavra-chave vale.
 *
 * Cada linha liquida no máximo um item, e cada item é liquidado por no máximo uma linha —
 * menos a meta, que recebe quantos aportes o extrato mostrar. Quando vários servem, vence,
 * nesta ordem: a palavra-chave mais longa (a mais específica), o vencimento mais perto, o
 * valor mais perto. A atribuição é gulosa sobre essa ordem global, e por isso determinística.
 *
 * **Reserva sem palavra-chave:** um avulso pendente de mesmo tipo, mesmo dia e mesmo valor
 * exatos também casa, com prioridade abaixo de qualquer palavra-chave. Era o "parece já ter
 * sido lançado à mão" da importação, que só desmarcava a linha; agora ele liquida o avulso.
 *
 * O valor que vale é o do extrato — o que aconteceu —, **menos na parcela**: a soma das
 * parcelas é o total do plano (invariante 1). `keepsAmount` diz isso à tela, que mostra a
 * diferença; quem grava é `reconcile_import_row` (migration 0019).
 *
 * **Puro** (invariante 9): sem I/O e sem data implícita. Roda no navegador, porque o texto
 * original do extrato não sai do aparelho.
 */

export type ReconcileTarget = 'entry' | 'recurring' | 'goal'

export type ReconcileOrigin = 'avulso' | 'parcela' | 'conta fixa' | 'renda fixa' | 'meta'

/** Um item cadastrado que ainda espera acontecer. */
export interface ReconcileCandidate {
  target: ReconcileTarget
  /** `entries.id`, `recurring_rules.id` ou `goals.id`, conforme `target`. */
  id: string
  kind: EntryKind
  /** Vencimento. `null` só na meta, que não vence. */
  dueOn: ISODate | null
  /** Valor previsto. Na meta, o aporte mensal quando houver; senão 0. */
  amountCents: number
  keywords: readonly string[]
  /** Como a tela nomeia o item: "Salário", "Sofá (2/12)", "Meta: Viagem". */
  label: string
  origin: ReconcileOrigin
}

/** Uma linha do extrato, com o texto em que se procura a palavra-chave. */
export interface ReconcileRow {
  importKey: string
  occurredOn: ISODate
  kind: EntryKind
  amountCents: number
  /** Descrição curta + texto original do banco. */
  text: string
}

export interface ReconcileLink {
  target: ReconcileTarget
  id: string
  dueOn: ISODate | null
  label: string
  origin: ReconcileOrigin
  /** A palavra-chave que decidiu, como a pessoa a escreveu. `null` na reserva por valor. */
  keyword: string | null
  /** Valor previsto do item. */
  expectedCents: number
  /** O item mantém o próprio valor (parcela); a diferença é só aviso. */
  keepsAmount: boolean
  /** Extrato menos previsto. Zero na meta sem aporte definido. */
  amountDiffCents: number
}

/** Até quantos dias entre vencimento e data da linha. */
export const RECONCILE_WINDOW_DAYS = 15

interface Pair {
  rowIndex: number
  candidateIndex: number
  /** 0 = palavra-chave; 1 = reserva por valor e dia exatos. */
  tier: 0 | 1
  keyword: string | null
  keywordLength: number
  distance: number
  amountGap: number
}

/**
 * Para cada linha que casa com um item, a conexão, por `importKey`. Linha sem par não
 * aparece — segue como lançamento novo.
 */
export function matchStatementRows(
  rows: readonly ReconcileRow[],
  candidates: readonly ReconcileCandidate[],
  windowDays: number = RECONCILE_WINDOW_DAYS,
): Record<string, ReconcileLink> {
  const pairs: Pair[] = []

  rows.forEach((row, rowIndex) => {
    candidates.forEach((candidate, candidateIndex) => {
      if (candidate.kind !== row.kind) return

      const found = matchKeyword(row.text, candidate.keywords)
      const amountGap = Math.abs(row.amountCents - candidate.amountCents)

      if (candidate.dueOn === null) {
        // Meta: só pela palavra-chave, sem janela.
        if (!found) return
        pairs.push({
          rowIndex,
          candidateIndex,
          tier: 0,
          keyword: found.keyword,
          keywordLength: found.length,
          distance: 0,
          amountGap,
        })
        return
      }

      const distance = Math.abs(daysBetween(candidate.dueOn, row.occurredOn))

      if (found && distance <= windowDays) {
        pairs.push({
          rowIndex,
          candidateIndex,
          tier: 0,
          keyword: found.keyword,
          keywordLength: found.length,
          distance,
          amountGap,
        })
      } else if (
        !found &&
        candidate.origin === 'avulso' &&
        distance === 0 &&
        amountGap === 0
      ) {
        pairs.push({
          rowIndex,
          candidateIndex,
          tier: 1,
          keyword: null,
          keywordLength: 0,
          distance,
          amountGap,
        })
      }
    })
  })

  pairs.sort(
    (a, b) =>
      a.tier - b.tier ||
      b.keywordLength - a.keywordLength ||
      a.distance - b.distance ||
      a.amountGap - b.amountGap ||
      a.rowIndex - b.rowIndex ||
      a.candidateIndex - b.candidateIndex,
  )

  const usedRows = new Set<number>()
  const usedCandidates = new Set<number>()
  const links: Record<string, ReconcileLink> = {}

  for (const pair of pairs) {
    if (usedRows.has(pair.rowIndex)) continue
    const candidate = candidates[pair.candidateIndex]
    const row = rows[pair.rowIndex]
    if (!candidate || !row) continue

    const manyToOne = candidate.target === 'goal'
    if (!manyToOne && usedCandidates.has(pair.candidateIndex)) continue

    usedRows.add(pair.rowIndex)
    if (!manyToOne) usedCandidates.add(pair.candidateIndex)

    links[row.importKey] = {
      target: candidate.target,
      id: candidate.id,
      dueOn: candidate.dueOn,
      label: candidate.label,
      origin: candidate.origin,
      keyword: pair.keyword,
      expectedCents: candidate.amountCents,
      keepsAmount: candidate.origin === 'parcela',
      amountDiffCents:
        candidate.target === 'goal' && candidate.amountCents === 0
          ? 0
          : row.amountCents - candidate.amountCents,
    }
  }

  return links
}
