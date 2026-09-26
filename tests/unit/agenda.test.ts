import { describe, expect, it } from 'vitest'
import { DateError } from '@/lib/finance/date'
import { daysOverdue, splitAgenda, sumAgendaCents } from '@/lib/finance/agenda'

/**
 * `today` entra por parâmetro em tudo aqui. Sem isso estes testes passariam hoje
 * e falhariam amanhã, que é o pior tipo de teste: verde quando foi escrito,
 * vermelho no dia em que ninguém mexeu em nada.
 */

const HOJE = '2026-03-15'

const item = (occurredOn: string, amountCents = 10_000, id = occurredOn) => ({
  id,
  occurredOn,
  amountCents,
})

describe('splitAgenda', () => {
  it('separa atrasados, hoje e próximos', () => {
    const { overdue, upcoming, dueToday } = splitAgenda(
      [item('2026-03-10'), item('2026-03-15'), item('2026-03-20')],
      HOJE,
    )

    expect(overdue.map((i) => i.occurredOn)).toEqual(['2026-03-10'])
    expect(upcoming.map((i) => i.occurredOn)).toEqual(['2026-03-15', '2026-03-20'])
    expect(dueToday.map((i) => i.occurredOn)).toEqual(['2026-03-15'])
  })

  it('o que vence hoje não é atraso', () => {
    const { overdue, upcoming } = splitAgenda([item(HOJE)], HOJE)
    expect(overdue).toHaveLength(0)
    expect(upcoming).toHaveLength(1)
  })

  it('ordena atrasados do mais antigo para o mais recente', () => {
    const { overdue } = splitAgenda(
      [item('2026-03-14'), item('2026-01-05'), item('2026-02-28')],
      HOJE,
    )
    expect(overdue.map((i) => i.occurredOn)).toEqual(['2026-01-05', '2026-02-28', '2026-03-14'])
  })

  it('descarta o que vence além do horizonte', () => {
    const { upcoming } = splitAgenda([item('2026-04-14'), item('2026-04-15')], HOJE, 30)
    // 15/03 + 30 dias = 14/04. O dia 15/04 fica fora.
    expect(upcoming.map((i) => i.occurredOn)).toEqual(['2026-04-14'])
  })

  it('respeita um horizonte diferente', () => {
    const { upcoming } = splitAgenda([item('2026-03-20'), item('2026-03-22')], HOJE, 5)
    expect(upcoming.map((i) => i.occurredOn)).toEqual(['2026-03-20'])
  })

  it('atravessa a virada de mês sem perder item', () => {
    const { overdue, upcoming } = splitAgenda(
      [item('2026-02-28'), item('2026-03-01')],
      '2026-03-01',
    )
    expect(overdue.map((i) => i.occurredOn)).toEqual(['2026-02-28'])
    expect(upcoming.map((i) => i.occurredOn)).toEqual(['2026-03-01'])
  })

  it('atravessa a virada de ano', () => {
    const { overdue, upcoming } = splitAgenda(
      [item('2025-12-31'), item('2026-01-10')],
      '2026-01-01',
    )
    expect(overdue.map((i) => i.occurredOn)).toEqual(['2025-12-31'])
    expect(upcoming.map((i) => i.occurredOn)).toEqual(['2026-01-10'])
  })

  it('lista vazia devolve três listas vazias, e não um silêncio', () => {
    // A agenda do app antigo sumia inteira quando não havia ciclo ativo. Aqui o
    // vazio é uma resposta explícita: três listas, todas vazias.
    const split = splitAgenda([], HOJE)
    expect(split).toEqual({ overdue: [], upcoming: [], dueToday: [] })
  })

  it('recusa data fora do formato em vez de classificá-la por acidente', () => {
    expect(() => splitAgenda([item('15/03/2026')], HOJE)).toThrow(DateError)
    expect(() => splitAgenda([item('2026-02-30')], HOJE)).toThrow(DateError)
    expect(() => splitAgenda([item(HOJE)], '2026-13-01')).toThrow(DateError)
  })
})

describe('daysOverdue', () => {
  it('conta os dias de atraso', () => {
    expect(daysOverdue('2026-03-14', HOJE)).toBe(1)
    expect(daysOverdue('2026-03-05', HOJE)).toBe(10)
  })

  it('devolve zero para hoje e para o futuro', () => {
    expect(daysOverdue(HOJE, HOJE)).toBe(0)
    expect(daysOverdue('2026-03-20', HOJE)).toBe(0)
  })

  it('atravessa mês, ano e fevereiro bissexto', () => {
    expect(daysOverdue('2026-02-28', '2026-03-01')).toBe(1)
    expect(daysOverdue('2025-12-31', '2026-01-01')).toBe(1)
    expect(daysOverdue('2024-02-29', '2024-03-01')).toBe(1)
    expect(daysOverdue('2024-02-28', '2024-03-01')).toBe(2)
  })
})

describe('sumAgendaCents', () => {
  it('soma em centavos inteiros', () => {
    expect(sumAgendaCents([item('2026-03-10', 33), item('2026-03-11', 34)])).toBe(67)
  })

  it('devolve zero para lista vazia', () => {
    expect(sumAgendaCents([])).toBe(0)
  })
})
