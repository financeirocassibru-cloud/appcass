import 'server-only'

import { z } from 'zod'
import { getAgendaItems } from '@/lib/db/queries/agenda'
import { getBalanceAnchor, getCurrentBalance } from '@/lib/db/queries/balance'
import { listGoals } from '@/lib/db/queries/goals'
import { getProjection } from '@/lib/db/queries/projection'
import { getCategoryBreakdown, getMonthlySeries } from '@/lib/db/queries/summary'
import { DEFAULT_HORIZON_DAYS, splitAgenda } from '@/lib/finance/agenda'
import { todayISO, type ISODate } from '@/lib/finance/date'
import { formatCents } from '@/lib/finance/money'

/**
 * Resumo da situação financeira e dicas. v1.0 — 2026-09-26.
 *
 * **Só sob demanda.** Nada aqui roda ao abrir uma tela: o resumo nasce quando a
 * pessoa toca em "Ver resumo". Foi uma decisão explícita — um resumo gerado a
 * cada carregamento do Início custaria uma chamada por visita para dizer quase
 * sempre a mesma coisa, e ainda atrasaria a tela que mais se abre.
 *
 * O modelo não recebe lançamento nenhum bruto: recebe um retrato já **derivado**
 * pelas mesmas queries que as telas usam — saldo, entradas e saídas do mês,
 * ranking de categorias, o que vence adiante, metas e os dias em que a projeção
 * fica negativa. Ele interpreta; a conta continua sendo do app.
 */

const PROJECTION_DAYS = 90
const TOP_CATEGORIES = 5

/** O formato fixo da resposta. Sem isso seria preciso adivinhar texto livre. */
export const INSIGHTS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description:
        'Dois a quatro parágrafos curtos, em português do Brasil, resumindo a situação financeira. Fale com a pessoa, não sobre ela.',
    },
    tips: {
      type: 'array',
      description: 'De 2 a 4 dicas práticas e específicas, cada uma em uma frase.',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'tips'],
} as const

/** A resposta do modelo, validada. */
export const insightsSchema = z.object({
  summary: z.string().trim().min(1),
  tips: z.array(z.string().trim().min(1)).max(6),
})

export type Insights = z.infer<typeof insightsSchema>

/**
 * Lê a resposta do modelo.
 *
 * `output_text` vem como string JSON por causa do `response_format`. Se vier
 * torta, devolve `null` e quem chama trata como falha — melhor do que mostrar
 * um resumo pela metade num app de dinheiro.
 */
export function parseInsights(outputText: string | undefined): Insights | null {
  if (!outputText) return null

  let raw: unknown
  try {
    raw = JSON.parse(outputText)
  } catch {
    return null
  }

  const parsed = insightsSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/**
 * O retrato derivado que vai no prompt.
 *
 * Em português e já formatado: o modelo lê melhor "R$ 2.400,00 em Mercado" do
 * que um JSON de centavos, e o risco de ele reapresentar um número cru errado
 * na resposta cai.
 */
export async function buildInsightsInput(today: ISODate = todayISO()): Promise<string> {
  const [balance, anchor, breakdown, monthly, agendaItems, goals, projection] = await Promise.all([
    getCurrentBalance(today),
    getBalanceAnchor(),
    getCategoryBreakdown(today),
    getMonthlySeries(today, 6),
    getAgendaItems(today, DEFAULT_HORIZON_DAYS),
    listGoals(),
    getProjection(PROJECTION_DAYS, today),
  ])

  const agenda = splitAgenda(agendaItems, today, DEFAULT_HORIZON_DAYS)
  const linhas: string[] = [`Data de hoje: ${today}.`]

  linhas.push(
    anchor.isConfigured
      ? `Saldo atual: ${formatCents(balance.currentCents)}.`
      : `Saldo atual: ${formatCents(balance.currentCents)} — ATENÇÃO: a pessoa nunca informou quanto tem de verdade, então este número parte de zero e provavelmente está errado. Sugira que ela ajuste o saldo em Ajustes.`,
  )
  linhas.push(
    `Neste mês, já liquidado: ${formatCents(balance.settledIncomeCents)} de entradas e ${formatCents(balance.settledExpenseCents)} de saídas.`,
  )

  if (monthly.length > 0) {
    linhas.push(
      'Últimos meses (entradas / saídas):',
      ...monthly.map(
        (m) => `  ${m.month}: ${formatCents(m.incomeCents)} / ${formatCents(m.expenseCents)}`,
      ),
    )
  }

  if (breakdown.slices.length > 0) {
    linhas.push(
      `Para onde foi o dinheiro em ${breakdown.month} (total ${formatCents(breakdown.totalCents)}):`,
      ...breakdown.slices
        .slice(0, TOP_CATEGORIES)
        .map((s) => `  ${s.name}: ${formatCents(s.totalCents)}`),
    )
  }

  if (agenda.overdue.length > 0) {
    linhas.push(
      `EM ATRASO (${agenda.overdue.length}):`,
      ...agenda.overdue
        .slice(0, 10)
        .map((i) => `  ${i.description}: ${formatCents(i.amountCents)} venceu em ${i.occurredOn}`),
    )
  }

  if (agenda.upcoming.length > 0) {
    linhas.push(
      `A vencer nos próximos ${DEFAULT_HORIZON_DAYS} dias (${agenda.upcoming.length}):`,
      ...agenda.upcoming
        .slice(0, 10)
        .map((i) => `  ${i.description}: ${formatCents(i.amountCents)} em ${i.occurredOn}`),
    )
  }

  if (goals.length > 0) {
    linhas.push(
      'Metas:',
      ...goals.map(
        (g) =>
          `  ${g.name}: ${formatCents(g.savedCents)} de ${formatCents(g.targetAmountCents)} (${g.pct}%)${g.targetDate ? `, até ${g.targetDate}` : ''}`,
      ),
    )
  }

  linhas.push(
    projection.firstNegativeDay
      ? `PROJEÇÃO: mantido o ritmo atual, o saldo fica NEGATIVO a partir de ${projection.firstNegativeDay}.`
      : `PROJEÇÃO: o saldo não fica negativo nos próximos ${PROJECTION_DAYS} dias.`,
  )

  if (projection.overdueCents > 0) {
    linhas.push(`Contas vencidas e não pagas somam ${formatCents(projection.overdueCents)}.`)
  }

  return linhas.join('\n')
}

export const INSIGHTS_SYSTEM_INSTRUCTION = `Você analisa a situação financeira de uma pessoa a partir de um retrato já calculado pelo app dela. Responda em português do Brasil.

O QUE FAZER:
- No resumo, comece pelo que mais importa: contas em atraso, saldo que vai ficar negativo, ou um gasto muito acima do padrão dos meses anteriores. Se nada disso existe, diga que está sob controle e explique por quê.
- Fale com a pessoa ("você gastou"), não sobre ela.
- Nas dicas, seja específico e use os números do retrato. "Reduza gastos" não ajuda; "as duas contas em atraso somam R$ 340,00 e resolvê-las antes do dia 10 evita que o saldo fique negativo" ajuda.

O QUE NÃO FAZER:
- Não invente número, data ou categoria que não esteja no retrato.
- Não recalcule nada: os valores já vêm somados, copie-os como estão.
- Nada de conselho de investimento, de produto financeiro ou de crédito.
- Sem moralizar e sem elogio vazio. A pessoa quer saber onde está, não ser parabenizada.
- Se o retrato tiver pouca informação, diga isso e sugira o que registrar para o próximo resumo valer mais.`
