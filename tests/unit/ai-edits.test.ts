import { describe, expect, it } from 'vitest'
import { applyEdits, EDITABLE_FIELDS, isEditable, revalidateOperations } from '@/lib/ai/edits'
import type { Operation } from '@/lib/ai/proposal'

/**
 * Os ajustes na tela de confirmação. v1.0 — 2026-09-26.
 *
 * A metade de segurança destes testes é a que importa mais. `confirmProposal` deixou de
 * ser "nada vem do formulário" e passou a ser "só valores vêm do formulário", e o que
 * separa as duas coisas é a lista branca. Se ela vazar, a pessoa passa a poder reapontar
 * uma operação de apagar para outra linha — e a RLS não barraria, porque as duas linhas
 * são dela.
 */

const CATEGORIA_A = '11111111-1111-4111-8111-111111111111'
const CATEGORIA_B = '22222222-2222-4222-8222-222222222222'
const LANCAMENTO = '33333333-3333-4333-8333-333333333333'
const OUTRO_LANCAMENTO = '44444444-4444-4444-8444-444444444444'
const META = '55555555-5555-4555-8555-555555555555'

const validas = new Set([CATEGORIA_A, CATEGORIA_B])

const criarLancamento = (): Operation => ({
  op: 'create_entry',
  kind: 'expense',
  amount_cents: 8750,
  occurred_on: '2026-09-26',
  description: 'Mercado',
  is_settled: true,
  category_id: CATEGORIA_A,
  notes: null,
  category_name: null,
})

const apagarLancamento = (): Operation => ({ op: 'delete_entry', id: LANCAMENTO })

describe('applyEdits: o que uma pessoa digitaria', () => {
  it('ajusta valor, data, descrição e categoria, e o resultado continua válido', () => {
    const { operations, changed } = applyEdits(
      [criarLancamento()],
      [
        {
          index: 0,
          fields: {
            amount_cents: 25000,
            occurred_on: '2026-09-25',
            description: 'Feira',
            category_id: CATEGORIA_B,
          },
        },
      ],
      [],
      validas,
    )

    expect(changed).toBe(true)
    expect(revalidateOperations(operations).success).toBe(true)

    const [primeira] = operations as [Extract<Operation, { op: 'create_entry' }>]
    expect(primeira.amount_cents).toBe(25000)
    expect(primeira.occurred_on).toBe('2026-09-25')
    expect(primeira.description).toBe('Feira')
    expect(primeira.category_id).toBe(CATEGORIA_B)
  })

  it('ajuste igual ao original não conta como ajuste', () => {
    const { changed } = applyEdits(
      [criarLancamento()],
      [{ index: 0, fields: { amount_cents: 8750 } }],
      [],
      validas,
    )

    expect(changed).toBe(false)
  })

  it('escolher categoria à mão zera o nome que sobrou da proposta', () => {
    // Sem isto a execução recriaria a categoria antiga por nome e ignoraria a escolha.
    const comNome = { ...criarLancamento(), category_name: 'Alimentação' } as Operation
    const { operations } = applyEdits(
      [comNome],
      [{ index: 0, fields: { category_id: CATEGORIA_B } }],
      [],
      validas,
    )

    const [primeira] = operations as [Extract<Operation, { op: 'create_entry' }>]
    expect(primeira.category_id).toBe(CATEGORIA_B)
    expect(primeira.category_name).toBeNull()
  })
})

describe('applyEdits: a lista branca é a tranca', () => {
  it('NÃO deixa reapontar uma exclusão para outra linha', () => {
    // O teste mais importante do arquivo. A RLS barra um id de outra pessoa, mas as duas
    // linhas aqui são da MESMA pessoa: "apague o mercado" virando "apague o salário"
    // passaria por toda a autorização do banco sem um arranhão.
    const { operations, changed } = applyEdits(
      [apagarLancamento()],
      [{ index: 0, fields: { id: OUTRO_LANCAMENTO } }],
      [],
      validas,
    )

    expect(operations[0]).toEqual({ op: 'delete_entry', id: LANCAMENTO })
    expect(changed).toBe(false)
  })

  it('não deixa trocar a operação por outra', () => {
    const { operations } = applyEdits(
      [criarLancamento()],
      [{ index: 0, fields: { op: 'delete_entry' } }],
      [],
      validas,
    )

    expect(operations[0]?.op).toBe('create_entry')
  })

  it('não deixa trocar o alvo de um aporte nem de um cenário', () => {
    const aporte: Operation = {
      op: 'create_contribution',
      goal_id: META,
      amount_cents: 10000,
      is_withdrawal: false,
      occurred_on: '2026-09-26',
      note: null,
    }

    const { operations } = applyEdits(
      [aporte],
      [{ index: 0, fields: { goal_id: OUTRO_LANCAMENTO, amount_cents: 20000 } }],
      [],
      validas,
    )

    const [primeira] = operations as [Extract<Operation, { op: 'create_contribution' }>]
    expect(primeira.goal_id).toBe(META)
    // O valor, que é o que uma pessoa digitaria, passou.
    expect(primeira.amount_cents).toBe(20000)
  })

  it('ignora campo que não está na lista do tipo', () => {
    // `is_settled` não é ajustável num parcelamento.
    const plano: Operation = {
      op: 'create_installment_plan',
      description: 'Geladeira',
      total_amount_cents: 30000,
      installments_count: 3,
      first_due_on: '2026-10-10',
      category_id: null,
      category_name: null,
    }

    const { operations } = applyEdits(
      [plano],
      [{ index: 0, fields: { is_settled: true, installments_count: 4 } }],
      [],
      validas,
    )

    const [primeira] = operations as [Extract<Operation, { op: 'create_installment_plan' }>]
    expect(primeira.installments_count).toBe(4)
    expect('is_settled' in primeira).toBe(false)
  })

  it('categoria que não existe mais vira sem categoria, não erro', () => {
    const { operations } = applyEdits(
      [criarLancamento()],
      [{ index: 0, fields: { category_id: '99999999-9999-4999-8999-999999999999' } }],
      [],
      validas,
    )

    const [primeira] = operations as [Extract<Operation, { op: 'create_entry' }>]
    expect(primeira.category_id).toBeNull()
  })
})

describe('applyEdits: remoção', () => {
  it('remove o item e mantém os outros', () => {
    const { operations, changed } = applyEdits(
      [criarLancamento(), apagarLancamento()],
      [],
      [1],
      validas,
    )

    expect(operations).toHaveLength(1)
    expect(operations[0]?.op).toBe('create_entry')
    expect(changed).toBe(true)
  })

  it('remover tudo devolve lista vazia — quem chama recusa a confirmação', () => {
    const { operations } = applyEdits([criarLancamento()], [], [0], validas)

    expect(operations).toEqual([])
  })

  it('ajuste num item removido não ressuscita o item', () => {
    const { operations } = applyEdits(
      [criarLancamento()],
      [{ index: 0, fields: { amount_cents: 1 } }],
      [0],
      validas,
    )

    expect(operations).toEqual([])
  })
})

describe('applyEdits: entrada torta não derruba a mesclagem', () => {
  it('índice fora da faixa é ignorado', () => {
    const { operations } = applyEdits(
      [criarLancamento()],
      [{ index: 7, fields: { amount_cents: 1 } }],
      [],
      validas,
    )

    expect(operations).toHaveLength(1)
    expect((operations[0] as Extract<Operation, { op: 'create_entry' }>).amount_cents).toBe(8750)
  })

  it('dois ajustes na mesma posição: vale o último', () => {
    const { operations } = applyEdits(
      [criarLancamento()],
      [
        { index: 0, fields: { amount_cents: 100 } },
        { index: 0, fields: { amount_cents: 200 } },
      ],
      [],
      validas,
    )

    expect((operations[0] as Extract<Operation, { op: 'create_entry' }>).amount_cents).toBe(200)
  })

  it('sem ajuste nenhum, a proposta sai idêntica', () => {
    const original = [criarLancamento(), apagarLancamento()]
    const { operations, changed } = applyEdits(original, [], [], validas)

    expect(operations).toEqual(original)
    expect(changed).toBe(false)
  })
})

describe('revalidateOperations é o portão, e ele não perdoa', () => {
  it('recusa valor decimal em vez de arredondar', () => {
    // O invariante 1: `87.5` querendo dizer R$ 87,50 tem de ser recusado. Arredondar
    // criaria um lançamento de oitenta e sete centavos com cara de correto.
    const { operations } = applyEdits(
      [criarLancamento()],
      [{ index: 0, fields: { amount_cents: 87.5 } }],
      [],
      validas,
    )

    expect(revalidateOperations(operations).success).toBe(false)
  })

  it('recusa data que não é YYYY-MM-DD', () => {
    const { operations } = applyEdits(
      [criarLancamento()],
      [{ index: 0, fields: { occurred_on: '26/09/2026' } }],
      [],
      validas,
    )

    expect(revalidateOperations(operations).success).toBe(false)
  })

  it('recusa valor zero e descrição vazia', () => {
    for (const fields of [{ amount_cents: 0 }, { description: '' }]) {
      const { operations } = applyEdits([criarLancamento()], [{ index: 0, fields }], [], validas)
      expect(revalidateOperations(operations).success).toBe(false)
    }
  })
})

describe('isEditable: o que só pode ser removido', () => {
  it('operação que apaga não tem campo para ajustar', () => {
    for (const op of [
      'delete_entry',
      'delete_recurring',
      'delete_installment_plan',
      'delete_goal',
      'delete_contribution',
      'delete_scenario',
      'delete_scenario_entry',
    ] as const) {
      expect(isEditable(op)).toBe(false)
    }
  })

  it('operação que só liga ou desliga também não', () => {
    for (const op of [
      'settle_entry',
      'toggle_recurring_active',
      'materialize_recurring',
      'archive_goal',
      'archive_category',
      'activate_scenario',
      'update_balance_anchor',
    ] as const) {
      expect(isEditable(op)).toBe(false)
    }
  })

  it('lançar e alterar são ajustáveis', () => {
    expect(isEditable('create_entry')).toBe(true)
    expect(isEditable('update_entry')).toBe(true)
    expect(isEditable('create_installment_plan')).toBe(true)
  })

  it('nenhuma lista branca contém campo de identidade', () => {
    // A tranca conferida de fora: se alguém acrescentar `id` a uma lista um dia, este
    // teste cai antes de o código chegar em produção.
    for (const campos of Object.values(EDITABLE_FIELDS)) {
      for (const proibido of ['op', 'id', 'rule_id', 'goal_id', 'scenario_id']) {
        expect(campos).not.toContain(proibido)
      }
    }
  })
})
