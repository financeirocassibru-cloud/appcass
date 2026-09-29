import { describe, expect, it } from 'vitest'
import { computeBalance } from '@/lib/finance/balance'
import type { CreditBill } from '@/lib/finance/credit'
import {
  buildCardSheet,
  buildSheet,
  dateInSheetMonth,
  MAX_SHEET_MONTHS,
  overrideTargetOfItem,
  sheetMonths,
  sortRows,
  type SheetEntry,
  type SheetInput,
  type SheetRow,
} from '@/lib/finance/sheet'
import type { RecurringRule, Scenario } from '@/lib/finance/types'

/**
 * A planilha (Fase 14) — v1.0 — 28/09/2026.
 *
 * Cada teste é um jeito de a planilha mentir sem erro nenhum: somar a conta vencida em dois
 * meses, contar a compra no cartão como gasto de caixa, deixar o cenário alterar o passado, ou
 * o saldo de hoje discordar do Início.
 */

const HOJE = '2026-09-28'

let seq = 0
const entry = (over: Partial<SheetEntry> = {}): SheetEntry => ({
  id: `e${++seq}`,
  kind: 'expense',
  occurredOn: HOJE,
  description: 'Mercado',
  amountCents: 10_000,
  categoryId: 'cat-mercado',
  isSettled: true,
  source: 'manual',
  sourceId: null,
  occurrenceKey: null,
  installmentNumber: null,
  installmentTotal: null,
  createdAt: '2026-09-01T12:00:00Z',
  ...over,
})

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r-aluguel',
  kind: 'expense',
  description: 'Aluguel',
  amountCents: 200_000,
  categoryId: null,
  frequency: 'monthly',
  dayOfMonth: 10,
  startsOn: '2026-01-10',
  endsOn: null,
  isActive: true,
  ...over,
})

const input = (over: Partial<SheetInput> = {}): SheetInput => ({
  from: '2026-08-01',
  to: '2026-12-31',
  today: HOJE,
  entries: [],
  recurringRules: [],
  goals: [],
  bills: [],
  labels: {
    categories: { 'cat-mercado': 'Mercado', 'cat-salario': 'Salário' },
    rules: { 'r-aluguel': 'Aluguel' },
    plans: {},
    goals: {},
    accounts: { nubank: { name: 'Nubank', kind: 'card' }, banco: { name: 'Empréstimo do banco', kind: 'loan' } },
  },
  scenario: null,
  currentBalanceCents: 500_000,
  historyStartsOn: '2026-01-01',
  grouping: 'category',
  sort: 'alpha',
  ...over,
})

const rows = (section: { groups: { rows: SheetRow[] }[] }): SheetRow[] => section.groups.flatMap((g) => g.rows)
const rowByKey = (section: { groups: { rows: SheetRow[] }[] }, key: string) => rows(section).find((r) => r.key === key)

describe('sheetMonths', () => {
  it('um mês por coluna, inteiros, com passado e atual marcados', () => {
    const months = sheetMonths('2026-08-15', '2026-10-03', HOJE)
    expect(months.map((m) => m.key)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(months.map((m) => m.label)).toEqual(['ago/26', 'set/26', 'out/26'])
    expect(months.map((m) => [m.isPast, m.isCurrent])).toEqual([
      [true, false],
      [false, true],
      [false, false],
    ])
    expect(months[0]?.from).toBe('2026-08-01')
    expect(months[2]?.to).toBe('2026-10-31')
  })

  it('para no teto de colunas', () => {
    expect(sheetMonths('2020-01-01', '2030-12-31', HOJE)).toHaveLength(MAX_SHEET_MONTHS)
  })
})

describe('buildSheet — cada coisa no mês dela, uma vez', () => {
  it('a conta vencida e não paga fica no mês dela, e não é somada de novo em hoje', () => {
    const vencida = entry({ occurredOn: '2026-08-20', isSettled: false, amountCents: 7_000 })
    const sheet = buildSheet(input({ entries: [vencida] }))
    const mercado = rowByKey(sheet.expense, 'expense:category:cat-mercado')!
    expect(mercado.cells['2026-08']?.cents).toBe(7_000)
    expect(mercado.cells['2026-08']?.hasPending).toBe(true)
    expect(mercado.cells['2026-09']).toBeUndefined()
    expect(mercado.totalCents).toBe(7_000)
  })

  it('a conta fixa é prevista de hoje em diante e some quando já virou lançamento', () => {
    const paga = entry({
      source: 'recurring',
      sourceId: 'r-aluguel',
      occurrenceKey: '2026-10',
      occurredOn: '2026-10-10',
      amountCents: 210_000,
      categoryId: null,
      isSettled: false,
    })
    const sheet = buildSheet(input({ entries: [paga], recurringRules: [rule()] }))
    const aluguel = rowByKey(sheet.expense, 'expense:recurring:r-aluguel')!
    // Agosto e setembro (dia 10 já passou) não ressuscitam; outubro é o real; nov e dez previstos.
    expect(aluguel.cells['2026-08']).toBeUndefined()
    expect(aluguel.cells['2026-09']).toBeUndefined()
    expect(aluguel.cells['2026-10']?.cents).toBe(210_000)
    expect(aluguel.cells['2026-10']?.items).toHaveLength(1)
    expect(aluguel.cells['2026-11']?.cents).toBe(200_000)
    expect(aluguel.cells['2026-11']?.hasProjected).toBe(true)
    expect(aluguel.label).toBe('Aluguel')
  })

  it('quanto sobrou = receitas − despesas, mês a mês', () => {
    const sheet = buildSheet(
      input({
        entries: [
          entry({ kind: 'income', categoryId: 'cat-salario', amountCents: 300_000, occurredOn: '2026-08-05' }),
          entry({ amountCents: 40_000, occurredOn: '2026-08-06' }),
        ],
      }),
    )
    expect(sheet.income.totals['2026-08']?.cents).toBe(300_000)
    expect(sheet.expense.totals['2026-08']?.cents).toBe(40_000)
    expect(sheet.leftover['2026-08']?.cents).toBe(260_000)
    expect(sheet.leftover['2026-09']?.cents).toBe(0)
  })
})

describe('buildSheet — cartão e empréstimo', () => {
  const fatura = (over: Partial<CreditBill> = {}): CreditBill => ({
    accountId: 'nubank',
    accountName: 'Nubank',
    accountKind: 'card',
    dueOn: '2026-10-10',
    remainingCents: 3_000,
    status: 'open',
    closingOn: '2026-10-03',
    chargesCents: 3_000,
    carryInCents: 0,
    totalCents: 3_000,
    paidCents: 0,
    charges: [],
    payments: [],
    ...over,
  })

  it('a compra no cartão não entra na categoria; a conta é uma linha só, no vencimento', () => {
    const uber = entry({ creditAccountId: 'nubank', chargeFirstDueOn: '2026-10-10', amountCents: 3_000, isSettled: false })
    const pagamento = entry({
      source: 'credit_bill',
      sourceId: 'nubank',
      occurrenceKey: '2026-09-10',
      occurredOn: '2026-09-10',
      amountCents: 50_000,
      categoryId: null,
    })
    const sheet = buildSheet(input({ entries: [uber, pagamento], bills: [fatura()] }))
    expect(rowByKey(sheet.expense, 'expense:category:cat-mercado')).toBeUndefined()
    const nubank = rowByKey(sheet.expense, 'expense:credit:nubank')!
    expect(nubank.label).toBe('Fatura Nubank')
    expect(nubank.cells['2026-09']?.cents).toBe(50_000)
    expect(nubank.cells['2026-10']?.cents).toBe(3_000)
    expect(rows(sheet.expense).filter((r) => r.kind === 'credit')).toHaveLength(1)
  })

  it('o dinheiro do empréstimo entra em Receitas, na linha da conta, e não como renda', () => {
    const dinheiro = entry({ kind: 'income', creditAccountId: 'banco', amountCents: 500_000, categoryId: 'cat-salario' })
    const sheet = buildSheet(input({ entries: [dinheiro] }))
    const linha = rowByKey(sheet.income, 'income:credit:banco')!
    expect(linha.label).toBe('Empréstimo do banco')
    expect(linha.cells['2026-09']?.cents).toBe(500_000)
    expect(rowByKey(sheet.income, 'income:category:cat-salario')).toBeUndefined()
  })

  it('a planilha do cartão põe cada cobrança na fatura em que cai, com a situação dela', () => {
    const uber = entry({ id: 'uber', creditAccountId: 'nubank', chargeFirstDueOn: '2026-10-10', amountCents: 3_000, isSettled: false })
    const card = buildCardSheet({
      from: '2026-09-01',
      to: '2026-12-31',
      today: HOJE,
      bills: [
        fatura({
          charges: [
            {
              accountId: 'nubank',
              dueOn: '2026-10-10',
              amountCents: 3_000,
              entryId: 'uber',
              ruleId: null,
              occurredOn: HOJE,
              description: 'Uber',
              categoryId: 'cat-mercado',
              kind: 'expense',
              source: 'manual',
              number: 1,
              total: 1,
            },
          ],
        }),
      ],
      fundedEntries: [uber],
      labels: input().labels,
      grouping: 'category',
      sort: 'alpha',
    })
    const compras = card.groups.find((g) => g.key === 'variable')!
    expect(compras.rows[0]?.label).toBe('Mercado')
    expect(compras.rows[0]?.cells['2026-10']?.cents).toBe(3_000)
    expect(card.bills['2026-10']?.status).toBe('open')
    expect(card.bills['2026-09']).toBeNull()
  })
})

describe('buildSheet — agrupar e ordenar', () => {
  const lancamentos = [
    entry({ id: 'b', description: 'Padaria', occurredOn: '2026-08-20', createdAt: '2026-08-01T00:00:00Z' }),
    entry({ id: 'a', description: 'Feira', occurredOn: '2026-08-25', createdAt: '2026-08-30T00:00:00Z' }),
    entry({ id: 'c', description: 'Açougue', occurredOn: '2026-09-02', createdAt: '2026-08-15T00:00:00Z' }),
  ]

  it('agrupado, os avulsos da mesma categoria somam numa linha', () => {
    const sheet = buildSheet(input({ entries: lancamentos }))
    const mercado = rowByKey(sheet.expense, 'expense:category:cat-mercado')!
    expect(mercado.cells['2026-08']?.cents).toBe(20_000)
    expect(mercado.cells['2026-08']?.items).toHaveLength(2)
  })

  it('desagrupado, cada lançamento é uma linha, e as três ordens funcionam', () => {
    const labels = (sort: SheetInput['sort']) =>
      rows(buildSheet(input({ entries: lancamentos, grouping: 'none', sort })).expense).map((r) => r.label)
    expect(labels('alpha')).toEqual(['Açougue', 'Feira', 'Padaria'])
    expect(labels('occurred')).toEqual(['Padaria', 'Feira', 'Açougue'])
    expect(labels('created')).toEqual(['Padaria', 'Açougue', 'Feira'])
  })

  it('sortRows manda o que não tem data para o fim', () => {
    const sorted = sortRows(
      [
        { label: 'B', firstCreatedAt: null, firstDate: null },
        { label: 'A', firstCreatedAt: '2026-01-01', firstDate: '2026-01-01' },
      ],
      'created',
    )
    expect(sorted.map((r) => r.label)).toEqual(['A', 'B'])
  })
})

describe('buildSheet — cenário só do futuro', () => {
  const cenario = (over: Partial<Scenario> = {}): Scenario => ({
    id: 's1',
    name: 'E se',
    startsOn: HOJE,
    endsOn: '2026-12-31',
    openingBalanceCents: 0,
    overrides: [],
    entries: [],
    ...over,
  })

  it('o override muda a célula do futuro, guarda o real ao lado e não toca no passado', () => {
    const agosto = entry({ source: 'recurring', sourceId: 'r-aluguel', occurrenceKey: '2026-08', occurredOn: '2026-08-10', amountCents: 200_000, categoryId: null })
    const sheet = buildSheet(
      input({
        entries: [agosto],
        recurringRules: [rule()],
        scenario: cenario({
          overrides: [
            { targetType: 'recurring_rule', targetId: 'r-aluguel', occurrenceKey: '2026-08', isIncluded: false, amountCentsOverride: null, dateOverride: null },
            { targetType: 'recurring_rule', targetId: 'r-aluguel', occurrenceKey: '2026-11', isIncluded: true, amountCentsOverride: 150_000, dateOverride: null },
          ],
          entries: [{ id: 'x', kind: 'expense', description: 'Viagem', amountCents: 80_000, occursOn: '2026-12-05', categoryId: 'cat-mercado' }],
        }),
      }),
    )
    const aluguel = rowByKey(sheet.expense, 'expense:recurring:r-aluguel')!
    expect(aluguel.cells['2026-08']?.cents).toBe(200_000)
    expect(aluguel.cells['2026-11']).toMatchObject({ cents: 150_000, realCents: 200_000 })
    expect(aluguel.cells['2026-12']).toMatchObject({ cents: 200_000, realCents: 200_000 })
    const mercado = rowByKey(sheet.expense, 'expense:category:cat-mercado')!
    expect(mercado.cells['2026-12']).toMatchObject({ cents: 80_000, realCents: 0 })
    expect(sheet.hasScenario).toBe(true)
  })
})

describe('buildSheet — saldo no fim do mês', () => {
  it('o saldo de hoje é o do Início, e nada conta duas vezes na costura', () => {
    const entries = [
      entry({ kind: 'income', categoryId: 'cat-salario', amountCents: 300_000, occurredOn: '2026-08-05' }),
      entry({ amountCents: 40_000, occurredOn: '2026-09-10' }),
      entry({ amountCents: 5_000, occurredOn: HOJE }),
      entry({ amountCents: 9_000, occurredOn: '2026-08-15', isSettled: false }),
      entry({ amountCents: 20_000, occurredOn: '2026-10-05', isSettled: false }),
    ]
    const anchor = { openingBalanceCents: 100_000, openingBalanceOn: '2026-07-31' }
    const current = computeBalance({
      ...anchor,
      today: HOJE,
      entries: entries.map((e) => ({ kind: e.kind, amountCents: e.amountCents, occurredOn: e.occurredOn, isSettled: e.isSettled })),
    }).currentCents

    const sheet = buildSheet(
      input({ entries, currentBalanceCents: current, historyStartsOn: anchor.openingBalanceOn }),
    )
    // Fim de agosto: âncora + salário. Setembro (mês de hoje): o saldo de hoje menos a vencida.
    expect(sheet.closingBalance['2026-08']?.cents).toBe(400_000)
    expect(sheet.closingBalance['2026-09']?.cents).toBe(current - 9_000)
    expect(sheet.closingBalance['2026-10']?.cents).toBe(current - 9_000 - 20_000)
  })

  it('antes da âncora o saldo é desconhecido', () => {
    const sheet = buildSheet(input({ historyStartsOn: '2026-09-15' }))
    expect(sheet.closingBalance['2026-08']).toBeNull()
    expect(sheet.closingBalance['2026-09']).not.toBeNull()
  })
})

describe('overrideTargetOfItem', () => {
  it('é o mesmo alvo que a projeção usa', () => {
    const sheet = buildSheet(input({ recurringRules: [rule()] }))
    const item = rowByKey(sheet.expense, 'expense:recurring:r-aluguel')!.cells['2026-11']!.items[0]!
    expect(overrideTargetOfItem(item)).toEqual({
      targetType: 'recurring_rule',
      targetId: 'r-aluguel',
      occurrenceKey: '2026-11',
    })
  })
})

describe('dateInSheetMonth', () => {
  it('hoje no mês atual; o mesmo dia, ajustado, nos outros', () => {
    expect(dateInSheetMonth({ from: '2026-09-01' }, HOJE)).toBe(HOJE)
    expect(dateInSheetMonth({ from: '2026-11-01' }, HOJE)).toBe('2026-11-28')
    expect(dateInSheetMonth({ from: '2027-02-01' }, '2026-10-31')).toBe('2027-02-28')
  })
})
