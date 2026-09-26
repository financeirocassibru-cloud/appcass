import { describe, expect, it } from 'vitest'
import { computeBalance } from '@/lib/finance/balance'
import { addDays, type ISODate } from '@/lib/finance/date'
import {
  entriesAheadOf,
  projectRange,
  projectWindow,
  rollOverdueTo,
} from '@/lib/finance/projection'
import type { Entry, Goal, RecurringRule, Scenario } from '@/lib/finance/types'

/**
 * `projectWindow` costura duas coisas que não podem se sobrepor: o histórico, que é fato, e a
 * projeção, que é previsão. A costura fica no dia de hoje, e o número dela é o saldo que a
 * pessoa vê no Início.
 *
 * Se as duas metades contassem o mesmo lançamento, ele entraria duas vezes no saldo — o erro
 * que destruiu o app antigo, e o mais perigoso que um app de finanças pode cometer, porque
 * mente justamente no número que orienta a decisão.
 */

const ANCORA: ISODate = '2026-01-01'
const ANCORA_CENTS = 500_000
const HOJE: ISODate = '2026-03-15'
const INICIO: ISODate = '2026-02-01'
const FIM: ISODate = '2026-06-30'

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  kind: 'expense',
  occurredOn: HOJE,
  description: 'Mercado',
  amountCents: 10_000,
  categoryId: null,
  isSettled: false,
  source: 'manual',
  sourceId: null,
  occurrenceKey: null,
  installmentNumber: null,
  installmentTotal: null,
  ...over,
})

const regra = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r1',
  kind: 'expense',
  description: 'Aluguel',
  amountCents: 150_000,
  categoryId: null,
  frequency: 'monthly',
  dayOfMonth: 10,
  startsOn: '2026-01-01',
  endsOn: null,
  isActive: true,
  ...over,
})

const meta = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  name: 'Viagem',
  targetAmountCents: 600_000,
  targetDate: '2026-06-30',
  monthlyContributionCents: null,
  savedCents: 0,
  archivedAt: null,
  ...over,
})

/** O saldo em `data`, do mesmo jeito que `getCurrentBalance(data)` calcula. */
function saldoEm(data: ISODate, entries: readonly Entry[]): number {
  return computeBalance({
    openingBalanceCents: ANCORA_CENTS,
    openingBalanceOn: ANCORA,
    today: data,
    entries,
  }).currentCents
}

describe('projectWindow — a costura entre fato e previsão', () => {
  it('o dia de hoje fecha no mesmo saldo que a tela mostra hoje', () => {
    const entries = [
      entry({ id: 'a', isSettled: true, occurredOn: '2026-02-10', amountCents: 20_000 }),
      entry({ id: 'b', isSettled: true, occurredOn: HOJE, amountCents: 5_000 }),
      entry({ id: 'c', isSettled: false, occurredOn: HOJE, amountCents: 7_000 }),
      entry({ id: 'd', isSettled: false, occurredOn: '2026-04-02', amountCents: 30_000 }),
      entry({ id: 'e', kind: 'income', isSettled: true, occurredOn: '2026-03-05', amountCents: 400_000 }),
    ]

    const dias = projectWindow({
      from: INICIO,
      to: FIM,
      today: HOJE,
      openingBalanceCents: saldoEm(addDays(INICIO, -1), entries),
      data: { entries, recurringRules: [], goals: [] },
    })

    const hoje = dias.find((dia) => dia.date === HOJE)
    // O saldo de hoje mais o que ainda vai acontecer hoje: o pendente 'c'.
    expect(hoje?.balanceCents).toBe(saldoEm(HOJE, entries) - 7_000)
  })

  it('no futuro, reproduz projectRange dia por dia', () => {
    // Se um dia alguém quiser unificar as duas funções, este teste é a rede.
    const entries = [
      entry({ id: 'a', isSettled: true, occurredOn: '2026-02-10' }),
      entry({ id: 'b', isSettled: true, occurredOn: HOJE }),
      entry({ id: 'c', isSettled: false, occurredOn: '2026-02-20', amountCents: 40_000 }),
      entry({ id: 'd', isSettled: false, occurredOn: '2026-05-01' }),
    ]
    const recurringRules = [regra()]
    const goals = [meta()]

    const doRange = projectRange({
      from: HOJE,
      to: FIM,
      openingBalanceCents: saldoEm(HOJE, entries),
      data: {
        entries: rollOverdueTo(entriesAheadOf(entries, HOJE), HOJE),
        recurringRules,
        goals,
      },
    })

    const daJanela = projectWindow({
      from: INICIO,
      to: FIM,
      today: HOJE,
      openingBalanceCents: saldoEm(addDays(INICIO, -1), entries),
      data: { entries, recurringRules, goals },
    }).filter((dia) => dia.date >= HOJE)

    // Os SALDOS batem dia por dia. É a garantia que importa: as duas funções não podem
    // divergir no número.
    expect(daJanela.map((dia) => dia.balanceCents)).toEqual(
      doRange.map((dia) => dia.balanceCents),
    )

    // A LISTA do dia de hoje difere, de propósito. `projectRange` recebe o saldo de hoje já
    // pronto e por isso não pode listar o que foi liquidado hoje — o lançamento estaria
    // embutido no ponto de partida e apareceria duas vezes. `projectWindow` parte do dia
    // anterior, então o liquidado de hoje cai no dia dele, onde a pessoa espera encontrá-lo ao
    // tocar no ponto do gráfico. O saldo continua o mesmo pelos dois caminhos.
    const chavesDeHoje = (dias: ReturnType<typeof projectRange>) =>
      dias.find((dia) => dia.date === HOJE)?.occurrences.map((o) => o.key) ?? []

    expect(chavesDeHoje(daJanela)).toContain('entry:b')
    expect(chavesDeHoje(doRange)).not.toContain('entry:b')

    // Fora de hoje, as listas são idênticas.
    const semHoje = (dias: ReturnType<typeof projectRange>) =>
      dias.filter((dia) => dia.date !== HOJE).map((dia) => dia.occurrences.map((o) => o.key))
    expect(semHoje(daJanela)).toEqual(semHoje(doRange))
  })

  it('dia no passado soma só o liquidado — pendente não é dinheiro que saiu', () => {
    const entries = [
      entry({ id: 'pago', isSettled: true, occurredOn: '2026-02-10', amountCents: 20_000 }),
      entry({ id: 'pendente', isSettled: false, occurredOn: '2026-02-11', amountCents: 90_000 }),
    ]

    const dias = projectWindow({
      from: INICIO,
      to: FIM,
      today: HOJE,
      openingBalanceCents: saldoEm(addDays(INICIO, -1), entries),
      data: { entries, recurringRules: [], goals: [] },
    })

    const dez = dias.find((dia) => dia.date === '2026-02-10')
    const onze = dias.find((dia) => dia.date === '2026-02-11')
    expect(dez?.occurrences.map((o) => o.key)).toEqual(['entry:pago'])
    // O pendente de 11/02 não aparece no dia dele: ele foi empurrado para hoje.
    expect(onze?.occurrences).toEqual([])
    expect(onze?.balanceCents).toBe(dez?.balanceCents)
  })

  it('não expande recorrência antes de hoje: o passado é fato, não previsão', () => {
    const dias = projectWindow({
      from: INICIO,
      to: FIM,
      today: HOJE,
      openingBalanceCents: ANCORA_CENTS,
      // A regra manda no dia 10 de todo mês, inclusive 10/02 — que já passou e nunca virou
      // lançamento. Se ela fosse expandida, o histórico mostraria um aluguel que não saiu.
      data: { entries: [], recurringRules: [regra()], goals: [] },
    })

    const fevereiro = dias.find((dia) => dia.date === '2026-02-10')
    expect(fevereiro?.occurrences).toEqual([])
    const abril = dias.find((dia) => dia.date === '2026-04-10')
    expect(abril?.occurrences).toHaveLength(1)
  })

  it('não espalha o aporte de meta pelos meses que já passaram', () => {
    // `plannedAmounts` divide o que falta pelos meses da JANELA. Com `from` no passado o
    // denominador cresce e cada aporte futuro sai menor — sem erro e sem aviso.
    const comum = {
      to: FIM,
      today: HOJE,
      openingBalanceCents: ANCORA_CENTS,
      data: { entries: [], recurringRules: [], goals: [meta()] },
    } as const

    const janelaLonga = projectWindow({ ...comum, from: INICIO })
    const janelaDeHoje = projectWindow({ ...comum, from: HOJE })

    const aportes = (dias: ReturnType<typeof projectWindow>) =>
      dias.flatMap((dia) => dia.occurrences).filter((o) => o.origin === 'goal')

    expect(aportes(janelaLonga).map((o) => o.amountCents)).toEqual(
      aportes(janelaDeHoje).map((o) => o.amountCents),
    )
    // Quatro meses de aporte (março a junho) para R$ 6.000,00: 150.000 em cada.
    expect(aportes(janelaLonga).map((o) => o.amountCents)).toEqual([
      150_000, 150_000, 150_000, 150_000,
    ])
  })

  it('cenário não alcança o passado: override de data não move ocorrência para trás', () => {
    const entries = [
      entry({ id: 'futuro', isSettled: false, occurredOn: '2026-04-20', amountCents: 50_000 }),
    ]
    const cenario: Scenario = {
      id: 's1',
      name: 'Adiar',
      startsOn: INICIO,
      endsOn: FIM,
      openingBalanceCents: 0,
      overrides: [
        {
          targetType: 'entry',
          targetId: 'futuro',
          occurrenceKey: null,
          isIncluded: true,
          amountCentsOverride: null,
          dateOverride: '2026-02-05',
        },
      ],
      entries: [
        {
          id: 'h1',
          kind: 'expense',
          description: 'Hipotético no passado',
          amountCents: 11_100,
          occursOn: '2026-02-07',
          categoryId: null,
        },
      ],
    }

    const dias = projectWindow({
      from: INICIO,
      to: FIM,
      today: HOJE,
      openingBalanceCents: ANCORA_CENTS,
      data: { entries, recurringRules: [], goals: [] },
      scenario: cenario,
    })

    const todas = dias.flatMap((dia) => dia.occurrences)
    // A data de destino está fora de [hoje, fim], então a ocorrência é descartada, não movida.
    expect(todas.find((o) => o.key === 'entry:futuro')).toBeUndefined()
    // E o item hipotético datado no passado não vira história.
    expect(todas.find((o) => o.key === 'scenario:h1')).toBeUndefined()
    expect(dias.every((dia) => dia.balanceCents === ANCORA_CENTS)).toBe(true)
  })

  it('vencido rola para hoje, nunca para um dia anterior a hoje', () => {
    const entries = [
      entry({ id: 'atrasado', isSettled: false, occurredOn: '2026-01-05', amountCents: 60_000 }),
    ]

    const dias = projectWindow({
      from: INICIO,
      to: FIM,
      today: HOJE,
      openingBalanceCents: ANCORA_CENTS,
      data: { entries, recurringRules: [], goals: [] },
    })

    const hoje = dias.find((dia) => dia.date === HOJE)
    expect(hoje?.occurrences.map((o) => o.key)).toEqual(['entry:atrasado'])
    expect(dias.find((dia) => dia.date === INICIO)?.occurrences).toEqual([])
  })

  it('janela inteiramente no passado descarta o vencido em vez de somá-lo num dia qualquer', () => {
    const entries = [
      entry({ id: 'pago', isSettled: true, occurredOn: '2026-02-10', amountCents: 20_000 }),
      entry({ id: 'atrasado', isSettled: false, occurredOn: '2026-02-12', amountCents: 60_000 }),
    ]

    const dias = projectWindow({
      from: INICIO,
      to: '2026-02-28',
      today: HOJE,
      openingBalanceCents: saldoEm(addDays(INICIO, -1), entries),
      data: { entries, recurringRules: [regra()], goals: [meta()] },
    })

    expect(dias.flatMap((dia) => dia.occurrences).map((o) => o.key)).toEqual(['entry:pago'])
    expect(dias.at(-1)?.balanceCents).toBe(saldoEm('2026-02-28', entries))
  })

  it('cada lançamento cai em exatamente um lado da partição', () => {
    const entries = [
      entry({ id: 'a', isSettled: true, occurredOn: '2026-02-10' }),
      entry({ id: 'b', isSettled: true, occurredOn: HOJE }),
      entry({ id: 'c', isSettled: true, occurredOn: '2026-04-01' }),
      entry({ id: 'd', isSettled: false, occurredOn: '2026-02-01' }),
      entry({ id: 'e', isSettled: false, occurredOn: HOJE }),
      entry({ id: 'f', isSettled: false, occurredOn: '2026-05-05' }),
    ]

    const chaves = projectWindow({
      from: INICIO,
      to: FIM,
      today: HOJE,
      openingBalanceCents: saldoEm(addDays(INICIO, -1), entries),
      data: { entries, recurringRules: [], goals: [] },
    })
      .flatMap((dia) => dia.occurrences)
      .map((o) => o.key)

    expect([...chaves].sort()).toEqual([
      'entry:a',
      'entry:b',
      'entry:c',
      'entry:d',
      'entry:e',
      'entry:f',
    ])
    expect(new Set(chaves).size).toBe(chaves.length)
  })

  it('devolve série vazia quando o intervalo está invertido', () => {
    expect(
      projectWindow({
        from: FIM,
        to: INICIO,
        today: HOJE,
        openingBalanceCents: 0,
        data: { entries: [], recurringRules: [], goals: [] },
      }),
    ).toEqual([])
  })
})
