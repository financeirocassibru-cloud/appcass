import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatCents } from '@/lib/finance/money'
import { TOOLS, TOOL_NAMES } from '@/lib/ai/tools'
import {
  ACTION_FOR_OPERATION,
  describeOperation,
  formatISODateBR,
  hasFunctionCall,
  isDestructive,
  operationSchema,
  operationToFormData,
  parseFunctionCalls,
  type Operation,
} from '@/lib/ai/proposal'

/** Atalho: monta um passo de resposta do modelo. */
function call(name: string, args: unknown) {
  return { type: 'function_call', name, id: 'c1', arguments: args }
}

describe('o vocabulário do modelo e o do app são o mesmo', () => {
  it('toda ferramenta declarada tem variante na proposta', () => {
    const variants = Object.keys(ACTION_FOR_OPERATION).sort()
    expect([...TOOL_NAMES].sort()).toEqual(variants)
  })

  it('toda ferramenta aponta para uma action que existe', () => {
    // A varredura é de texto de propósito: o que precisa pegar é o nome exportado
    // sumindo de lib/actions, e isso é visível no texto.
    const fontes = [
      'entries',
      'categories',
      'recurring',
      'installments',
      'goals',
      'scenarios',
      'profile',
    ]
      .map((nome) => readFileSync(join(process.cwd(), 'lib', 'actions', `${nome}.ts`), 'utf8'))
      .join('\n')

    for (const action of Object.values(ACTION_FOR_OPERATION)) {
      expect(fontes, `a action ${action} sumiu de lib/actions/`).toContain(
        `export async function ${action}(`,
      )
    }
  })

  it('nenhuma ferramenta exige um campo que o schema não aceita', () => {
    for (const tool of TOOLS) {
      for (const required of tool.parameters.required) {
        expect(
          Object.keys(tool.parameters.properties),
          `${tool.name} exige ${required} sem declará-lo`,
        ).toContain(required)
      }
    }
  })
})

describe('parseFunctionCalls', () => {
  it('lê uma chamada bem formada', () => {
    const { operations, rejected } = parseFunctionCalls([
      call('create_entry', {
        kind: 'expense',
        amount_cents: 8750,
        occurred_on: '2026-09-26',
        description: 'Mercado',
        is_settled: true,
      }),
    ])

    expect(rejected).toEqual([])
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({ op: 'create_entry', amount_cents: 8750 })
  })

  it('aceita argumentos que vieram como string JSON', () => {
    const { operations } = parseFunctionCalls([
      call(
        'create_entry',
        JSON.stringify({
          kind: 'expense',
          amount_cents: 1000,
          occurred_on: '2026-09-26',
          description: 'Pão',
          is_settled: false,
        }),
      ),
    ])
    expect(operations).toHaveLength(1)
  })

  it('recusa valor decimal — 87.5 não é "R$ 87,50", é o bug de float', () => {
    const { operations, rejected } = parseFunctionCalls([
      call('create_entry', {
        kind: 'expense',
        amount_cents: 87.5,
        occurred_on: '2026-09-26',
        description: 'Mercado',
        is_settled: true,
      }),
    ])

    expect(operations).toEqual([])
    expect(rejected[0]?.name).toBe('create_entry')
  })

  it('recusa data fora do formato ISO', () => {
    const { operations } = parseFunctionCalls([
      call('create_entry', {
        kind: 'expense',
        amount_cents: 100,
        occurred_on: '26/09/2026',
        description: 'Mercado',
        is_settled: true,
      }),
    ])
    expect(operations).toEqual([])
  })

  it('uma chamada torta não derruba as boas', () => {
    const { operations, rejected } = parseFunctionCalls([
      call('create_entry', {
        kind: 'expense',
        amount_cents: 100,
        occurred_on: '2026-09-26',
        description: 'Boa',
        is_settled: true,
      }),
      call('create_entry', { kind: 'nonsense' }),
    ])

    expect(operations).toHaveLength(1)
    expect(rejected).toHaveLength(1)
  })

  it('ignora passos que não são chamada de função', () => {
    const { operations, rejected } = parseFunctionCalls([
      { type: 'text', name: undefined, arguments: undefined },
    ])
    expect(operations).toEqual([])
    expect(rejected).toEqual([])
  })

  it('ferramenta desconhecida é recusada, não executada', () => {
    const { operations, rejected } = parseFunctionCalls([call('drop_database', { tudo: true })])
    expect(operations).toEqual([])
    expect(rejected).toHaveLength(1)
  })

  it('não explode com resposta em formato inesperado', () => {
    expect(parseFunctionCalls(null)).toEqual({ operations: [], rejected: [] })
    expect(parseFunctionCalls('texto solto')).toEqual({ operations: [], rejected: [] })
  })

  it('ignora um id de outro usuário sem tratamento especial — quem barra é a RLS', () => {
    // O id passa na validação de formato; casar linha é trabalho do banco.
    const { operations } = parseFunctionCalls([
      call('delete_entry', { id: '99999999-9999-4999-8999-999999999999' }),
    ])
    expect(operations).toHaveLength(1)
  })
})

describe('describeOperation', () => {
  const labels = {
    categories: { 'c0000000-0000-4000-8000-000000000001': 'Mercado' },
    entries: { 'e0000000-0000-4000-8000-000000000001': 'Padaria' },
    recurring: { 'aa000000-0000-4000-8000-000000000001': 'Aluguel' },
    installments: {},
    goals: { 'bb000000-0000-4000-8000-000000000001': 'Viagem' },
    scenarios: {},
  }

  it('descreve um gasto com valor, data e estado, em português', () => {
    const op = operationSchema.parse({
      op: 'create_entry',
      kind: 'expense',
      amount_cents: 8750,
      occurred_on: '2026-09-26',
      description: 'Mercado',
      category_id: 'c0000000-0000-4000-8000-000000000001',
      is_settled: true,
    })

    const texto = describeOperation(op, labels)
    expect(texto).toContain('Registrar despesa')
    expect(texto).toContain(formatCents(8750))
    expect(texto).toContain('26/09/2026')
    expect(texto).toContain('Mercado')
    expect(texto).toContain('pago')
  })

  it('fala do registro pelo nome, nunca pelo UUID', () => {
    const op = operationSchema.parse({
      op: 'delete_entry',
      id: 'e0000000-0000-4000-8000-000000000001',
    })
    const texto = describeOperation(op, labels)
    expect(texto).toContain('Padaria')
    expect(texto).not.toContain('e0000000')
  })

  it('avisa quando o alvo não está no contexto, em vez de mostrar um id cru', () => {
    const op = operationSchema.parse({
      op: 'delete_goal',
      id: '00000000-0000-4000-8000-000000000000',
    })
    expect(describeOperation(op, labels)).toContain('não encontrado')
  })

  it('conta fixa mensal diz o dia do vencimento', () => {
    const op = operationSchema.parse({
      op: 'create_recurring',
      kind: 'expense',
      description: 'Aluguel',
      amount_cents: 240000,
      frequency: 'monthly',
      day_of_month: 10,
      starts_on: '2026-10-01',
    })
    const texto = describeOperation(op, labels)
    expect(texto).toContain(formatCents(240000))
    expect(texto).toContain('todo dia 10')
  })

  it('parcelamento mostra o total e o valor aproximado da parcela', () => {
    const op = operationSchema.parse({
      op: 'create_installment_plan',
      description: 'Geladeira',
      total_amount_cents: 30000,
      installments_count: 3,
      first_due_on: '2026-10-05',
    })
    const texto = describeOperation(op, labels)
    expect(texto).toContain(formatCents(30000))
    expect(texto).toContain('3x')
  })

  it('toda operação produz texto não vazio', () => {
    // Um `switch` sem um dos casos devolveria undefined e a tela mostraria vazio
    // logo antes de escrever no banco — o pior lugar para um silêncio.
    const exemplos: Operation[] = [
      { op: 'settle_entry', id: 'e0000000-0000-4000-8000-000000000001', is_settled: true },
      { op: 'toggle_recurring_active', id: 'aa000000-0000-4000-8000-000000000001', is_active: false },
      { op: 'delete_contribution', id: 'a0000000-0000-4000-8000-000000000001' },
      { op: 'activate_scenario', id: 'cc000000-0000-4000-8000-000000000001' },
      { op: 'delete_scenario_entry', id: 'cc000000-0000-4000-8000-000000000002' },
      { op: 'update_balance_anchor', opening_balance_cents: 150000, opening_balance_on: '2026-09-26', is_negative: true },
      { op: 'create_category', name: 'Pets', kind: 'expense' },
      { op: 'archive_category', id: 'c0000000-0000-4000-8000-000000000001', archive: true },
    ]
    for (const op of exemplos) {
      expect(describeOperation(op, labels).length, op.op).toBeGreaterThan(5)
    }
  })

  it('saldo negativo aparece com o sinal', () => {
    const op = operationSchema.parse({
      op: 'update_balance_anchor',
      opening_balance_cents: 150000,
      opening_balance_on: '2026-09-26',
      is_negative: true,
    })
    expect(describeOperation(op)).toContain(`-${formatCents(150000)}`)
  })
})

describe('formatISODateBR', () => {
  it('converte sem passar por Date — em fuso negativo isso deslocaria o dia', () => {
    expect(formatISODateBR('2026-03-01')).toBe('01/03/2026')
    expect(formatISODateBR('2026-12-31')).toBe('31/12/2026')
  })

  it('devolve a entrada quando ela não é uma data', () => {
    expect(formatISODateBR('nada')).toBe('nada')
  })
})

describe('isDestructive', () => {
  it('marca as exclusões', () => {
    expect(isDestructive({ op: 'delete_entry', id: 'x' } as Operation)).toBe(true)
    expect(isDestructive({ op: 'delete_goal', id: 'x' } as Operation)).toBe(true)
  })

  it('não marca criação nem arquivamento', () => {
    expect(isDestructive({ op: 'archive_goal', id: 'x', archive: true } as Operation)).toBe(false)
  })
})

describe('operationToFormData', () => {
  it('manda os nomes de campo exatos que createEntry lê', () => {
    const op = operationSchema.parse({
      op: 'create_entry',
      kind: 'expense',
      amount_cents: 8750,
      occurred_on: '2026-09-26',
      description: 'Mercado',
      is_settled: true,
    })
    const fd = operationToFormData(op)

    expect(fd.get('kind')).toBe('expense')
    expect(fd.get('amountCents')).toBe('8750')
    expect(fd.get('occurredOn')).toBe('2026-09-26')
    expect(fd.get('description')).toBe('Mercado')
    expect(fd.get('isSettled')).toBe('true')
    expect(fd.get('categoryId')).toBe('')
  })

  it('tudo vai como string — vários schemas fazem transform sobre string', () => {
    const op = operationSchema.parse({
      op: 'create_installment_plan',
      description: 'Geladeira',
      total_amount_cents: 30000,
      installments_count: 3,
      first_due_on: '2026-10-05',
    })
    const fd = operationToFormData(op)
    for (const [, value] of fd.entries()) {
      expect(typeof value).toBe('string')
    }
    expect(fd.get('installmentsCount')).toBe('3')
  })

  it('booleano estrito nunca é omitido', () => {
    // archive, isActive, isWithdrawal e o isSettled de toggleSettled usam
    // z.union([z.literal('true'), z.literal('false')]): omitir não é `false`,
    // é "Dados inválidos" sem dizer qual campo.
    const estritos: [Operation, string][] = [
      [{ op: 'settle_entry', id: 'x', is_settled: false }, 'isSettled'],
      [{ op: 'archive_goal', id: 'x', archive: false }, 'archive'],
      [{ op: 'archive_category', id: 'x', archive: false }, 'archive'],
      [{ op: 'toggle_recurring_active', id: 'x', is_active: false }, 'isActive'],
      [
        {
          op: 'create_contribution',
          goal_id: 'x',
          amount_cents: 100,
          is_withdrawal: false,
          occurred_on: '2026-09-26',
        },
        'isWithdrawal',
      ],
    ]

    for (const [op, campo] of estritos) {
      expect(operationToFormData(op).get(campo), `${op.op}.${campo}`).toBe('false')
    }
  })

  it('dia do mês só viaja em regra mensal', () => {
    const semanal = operationSchema.parse({
      op: 'create_recurring',
      kind: 'expense',
      description: 'Feira',
      amount_cents: 12000,
      frequency: 'weekly',
      day_of_month: 10,
      starts_on: '2026-10-01',
    })
    // O schema da action recusa dia do mês em regra não mensal; mandar vazio é
    // o que a tela faz quando o campo nem aparece.
    expect(operationToFormData(semanal).get('dayOfMonth')).toBe('')

    const mensal = operationSchema.parse({
      op: 'create_recurring',
      kind: 'expense',
      description: 'Aluguel',
      amount_cents: 240000,
      frequency: 'monthly',
      day_of_month: 10,
      starts_on: '2026-10-01',
    })
    expect(operationToFormData(mensal).get('dayOfMonth')).toBe('10')
  })

  it('opcional ausente vira string vazia, que os schemas traduzem para null', () => {
    const op = operationSchema.parse({
      op: 'create_goal',
      name: 'Viagem',
      target_amount_cents: 1000000,
    })
    const fd = operationToFormData(op)
    expect(fd.get('targetDate')).toBe('')
    expect(fd.get('monthlyContributionCents')).toBe('')
  })

  it('cor ausente é omitida, para o schema aplicar o padrão', () => {
    const op = operationSchema.parse({ op: 'create_category', name: 'Pets', kind: 'expense' })
    expect(operationToFormData(op).has('color')).toBe(false)
  })

  it('a categoria resolvida de fora ganha da que veio do modelo', () => {
    // Categoria criada na mesma proposta: quem sabe o id novo é o apply.
    const op = operationSchema.parse({
      op: 'create_entry',
      kind: 'expense',
      amount_cents: 100,
      occurred_on: '2026-09-26',
      description: 'Ração',
      category_name: 'Pets',
      is_settled: true,
    })
    const fd = operationToFormData(op, 'c0000000-0000-4000-8000-000000000009')
    expect(fd.get('categoryId')).toBe('c0000000-0000-4000-8000-000000000009')
  })

  it('exclusão manda só o id', () => {
    const fd = operationToFormData({ op: 'delete_entry', id: 'abc' } as Operation)
    expect([...fd.keys()]).toEqual(['id'])
  })

  it('materialize usa ruleId e occursOn, não id', () => {
    const op = operationSchema.parse({
      op: 'materialize_recurring',
      rule_id: 'aa000000-0000-4000-8000-000000000001',
      occurs_on: '2026-09-10',
    })
    const fd = operationToFormData(op)
    expect(fd.get('ruleId')).toBe('aa000000-0000-4000-8000-000000000001')
    expect(fd.get('occursOn')).toBe('2026-09-10')
    expect(fd.has('id')).toBe(false)
  })

  it('toda operação produz pelo menos um campo', () => {
    const todas: Operation[] = [
      { op: 'delete_recurring', id: 'x' },
      { op: 'delete_installment_plan', id: 'x' },
      { op: 'delete_scenario', id: 'x' },
      { op: 'rename_scenario', id: 'x', name: 'Novo' },
      { op: 'rename_category', id: 'x', name: 'Novo' },
      { op: 'create_scenario', name: 'A', starts_on: '2026-01-01', ends_on: '2026-06-30' },
      {
        op: 'create_scenario_entry',
        scenario_id: 'x',
        kind: 'income',
        description: 'Bônus',
        amount_cents: 500000,
        occurs_on: '2026-02-01',
      },
    ]
    for (const op of todas) {
      expect([...operationToFormData(op).keys()].length, op.op).toBeGreaterThan(0)
    }
  })
})

/**
 * `hasFunctionCall` — o sinal que substituiu o status do provedor.
 *
 * Uma interação com ferramentas para em `requires_action`, não em `completed`, porque
 * espera o retorno das chamadas. Este app nunca devolve esse retorno: ele manda a
 * operação para a tela de confirmação. Então a presença da chamada é o que diz que há
 * o que colher.
 */
describe('hasFunctionCall', () => {
  it('reconhece a chamada de ferramenta', () => {
    expect(hasFunctionCall([{ type: 'function_call', name: 'create_entry', arguments: {} }])).toBe(
      true,
    )
  })

  it('acha a chamada mesmo no meio de passos de texto', () => {
    expect(
      hasFunctionCall([
        { type: 'reasoning' },
        { type: 'message', name: 'assistant' },
        { type: 'function_call', name: 'create_entry', arguments: {} },
      ]),
    ).toBe(true)
  })

  it('resposta só de texto não tem o que colher', () => {
    expect(hasFunctionCall([{ type: 'message' }])).toBe(false)
    expect(hasFunctionCall([])).toBe(false)
  })

  it('chamada sem nome não conta — não daria para saber que ferramenta é', () => {
    expect(hasFunctionCall([{ type: 'function_call' }])).toBe(false)
  })

  it('não explode com entrada torta', () => {
    expect(hasFunctionCall(null)).toBe(false)
    expect(hasFunctionCall(undefined)).toBe(false)
    expect(hasFunctionCall('texto solto')).toBe(false)
    expect(hasFunctionCall({ steps: [] })).toBe(false)
  })
})
