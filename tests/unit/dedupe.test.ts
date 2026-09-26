import { describe, expect, it } from 'vitest'
import { dedupeAgainstEntries } from '@/lib/finance/projection'
import type { Entry } from '@/lib/finance/types'

/**
 * A deduplicação é o passo que impede a contagem em dobro do app antigo: lá o
 * custo fixo marcado como pago continuava aparecendo como previsto, e o mês
 * fechava com o aluguel cobrado duas vezes.
 *
 * A mesma função serve a projeção e a agenda do Início. Estes testes descrevem o
 * contrato das duas.
 */

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  kind: 'expense',
  occurredOn: '2026-03-10',
  description: 'Aluguel',
  amountCents: 180_000,
  categoryId: null,
  isSettled: true,
  source: 'recurring',
  sourceId: 'regra-1',
  occurrenceKey: '2026-03',
  installmentNumber: null,
  installmentTotal: null,
  ...over,
})

const prevista = (key: string) => ({ key })

describe('dedupeAgainstEntries', () => {
  it('descarta a prevista que já virou lançamento', () => {
    const resto = dedupeAgainstEntries([prevista('recurring:regra-1:2026-03')], [entry()])
    expect(resto).toEqual([])
  })

  it('mantém a prevista de outro mês da mesma regra', () => {
    const resto = dedupeAgainstEntries(
      [prevista('recurring:regra-1:2026-03'), prevista('recurring:regra-1:2026-04')],
      [entry()],
    )
    expect(resto).toEqual([prevista('recurring:regra-1:2026-04')])
  })

  it('mantém a prevista de outra regra no mesmo mês', () => {
    const resto = dedupeAgainstEntries([prevista('recurring:regra-2:2026-03')], [entry()])
    expect(resto).toEqual([prevista('recurring:regra-2:2026-03')])
  })

  it('deduplica também o que foi materializado como pendente', () => {
    // Materializar não é o mesmo que liquidar: se a linha existe, a previsão
    // correspondente sai da lista de qualquer forma, senão apareceria duas vezes.
    const resto = dedupeAgainstEntries(
      [prevista('recurring:regra-1:2026-03')],
      [entry({ isSettled: false })],
    )
    expect(resto).toEqual([])
  })

  it('lançamento manual nunca deduplica nada', () => {
    // Um gasto avulso de "Aluguel" digitado à mão não é a ocorrência da regra —
    // não tem `source_id`, e casá-los por descrição seria adivinhação.
    const manual = entry({ source: 'manual', sourceId: null, occurrenceKey: null })
    const resto = dedupeAgainstEntries([prevista('recurring:regra-1:2026-03')], [manual])
    expect(resto).toEqual([prevista('recurring:regra-1:2026-03')])
  })

  it('ignora lançamento gerado com a tripla incompleta', () => {
    const semChave = entry({ occurrenceKey: null })
    const semFonte = entry({ sourceId: null })
    const resto = dedupeAgainstEntries(
      [prevista('recurring:regra-1:2026-03')],
      [semChave, semFonte],
    )
    expect(resto).toHaveLength(1)
  })

  it('deduplica parcelas pela mesma regra de chave', () => {
    const parcela = entry({ source: 'installment', sourceId: 'plano-1', occurrenceKey: '3' })
    const resto = dedupeAgainstEntries(
      [prevista('installment:plano-1:3'), prevista('installment:plano-1:4')],
      [parcela],
    )
    expect(resto).toEqual([prevista('installment:plano-1:4')])
  })

  it('sem lançamentos, devolve tudo', () => {
    const previstas = [prevista('recurring:regra-1:2026-03')]
    expect(dedupeAgainstEntries(previstas, [])).toEqual(previstas)
  })

  it('sem previstas, devolve vazio', () => {
    expect(dedupeAgainstEntries([], [entry()])).toEqual([])
  })

  it('preserva a ordem das que sobram', () => {
    const resto = dedupeAgainstEntries(
      [
        prevista('recurring:regra-1:2026-01'),
        prevista('recurring:regra-1:2026-03'),
        prevista('recurring:regra-1:2026-02'),
      ],
      [entry()],
    )
    expect(resto.map((o) => o.key)).toEqual([
      'recurring:regra-1:2026-01',
      'recurring:regra-1:2026-02',
    ])
  })
})
