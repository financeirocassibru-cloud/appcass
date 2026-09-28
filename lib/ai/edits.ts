import { z } from 'zod'
import { operationSchema, type Operation, type OperationKind } from './proposal'

/**
 * Os ajustes que a pessoa faz na tela de confirmação. v1.1 — 2026-09-27.
 *
 * v1.1 (Fase 13 no assistente): no lançamento, o "Pago com" (`credit_account_id`) e o "Será
 * pago em" (`charge_first_due_on`) são ajustáveis — a IA pode ter lido "no débito" como "no
 * cartão". No pagamento de fatura, valor e data; a fatura em si (`account_id` + `due_on`) é o
 * ALVO e entra na lista de nunca-editáveis. Trocar a conta sem mexer no vencimento zera o
 * vencimento, que volta a ser o do ciclo da conta nova (`withCreditDefaults`).
 *
 * Módulo **puro** (invariante 9): sem I/O, sem Supabase, sem relógio.
 *
 * ## O problema que este arquivo resolve sem abrir uma porta
 *
 * `confirmProposal` relia a proposta do banco e **não confiava no corpo do formulário**,
 * de propósito — é o que tornava verdadeira a frase "foi isto que a IA propôs, e foi
 * isto que executou". Deixar a pessoa corrigir um valor errado parece exigir jogar isso
 * fora. Não exige.
 *
 * A divisão que mantém as duas coisas:
 *
 *  - **a identidade continua vindo do banco.** Qual operação é, e em que linha ela mexe,
 *    sai de `ai_jobs.result` e não do formulário. `op`, `id`, `rule_id`, `goal_id` e
 *    `scenario_id` não são editáveis, por lista branca;
 *  - **só o que uma pessoa digitaria muda.** Valor, data, descrição, categoria,
 *    liquidado — e tudo revalidado pelo `operationSchema` depois da mesclagem.
 *
 * Por que a lista branca e não uma checagem de dono: a RLS barra um id de outra pessoa,
 * mas **não** barraria reapontar a operação para outra linha da própria pessoa. "Apague
 * o lançamento do mercado" virando "apague o salário" passaria por toda a autorização do
 * banco sem um arranhão. Quem impede isso é a lista, aqui.
 */

/**
 * O que é editável em cada tipo de operação.
 *
 * Ausência é decisão, não esquecimento. `delete_*`, `settle_entry`,
 * `toggle_recurring_active`, `materialize_recurring`, `archive_*`, `activate_scenario` e
 * `update_balance_anchor` ficam de fora inteiros: neles não há "valor errado" para
 * corrigir — há um alvo, e editar o alvo é a única coisa que nunca se deve poder fazer
 * daqui. O que a pessoa faz com eles é **remover da proposta**.
 */
export const EDITABLE_FIELDS: Partial<Record<OperationKind, readonly string[]>> = {
  create_entry: [
    'amount_cents',
    'occurred_on',
    'description',
    'category_id',
    'is_settled',
    'credit_account_id',
    'charge_first_due_on',
  ],
  update_entry: [
    'amount_cents',
    'occurred_on',
    'description',
    'category_id',
    'is_settled',
    'credit_account_id',
    'charge_first_due_on',
  ],
  create_recurring: [
    'amount_cents',
    'description',
    'frequency',
    'day_of_month',
    'starts_on',
    'category_id',
  ],
  update_recurring: [
    'amount_cents',
    'description',
    'frequency',
    'day_of_month',
    'starts_on',
    'category_id',
  ],
  create_installment_plan: [
    'description',
    'total_amount_cents',
    'installments_count',
    'first_due_on',
    'category_id',
  ],
  create_contribution: ['amount_cents', 'occurred_on', 'note'],
  create_goal: ['name', 'target_amount_cents', 'target_date'],
  update_goal: ['name', 'target_amount_cents', 'target_date'],
  create_scenario_entry: ['amount_cents', 'description', 'occurs_on'],
  // v1.1 — 2026-09-27: quanto e quando pagou; qual fatura, não.
  pay_credit_bill: ['amount_cents', 'paid_on'],
}

/** Esta operação aceita ajuste, ou só pode ser removida? */
export function isEditable(op: OperationKind): boolean {
  return (EDITABLE_FIELDS[op]?.length ?? 0) > 0
}

/**
 * Campos que NUNCA são editáveis, em nenhum tipo.
 *
 * Redundante com a lista branca de propósito. Uma lista branca protege por omissão, e
 * omissão é frágil: basta alguém acrescentar um campo à lista errada, um dia, com a
 * melhor das intenções. Esta é a segunda tranca, e ela falha fechada.
 */
const NUNCA_EDITAVEL: ReadonlySet<string> = new Set([
  'op',
  'id',
  'rule_id',
  'goal_id',
  'scenario_id',
  // v1.1 — 2026-09-27: a fatura que se paga é o alvo do pagamento.
  'account_id',
  'due_on',
])

export const editSchema = z.object({
  index: z.number().int().min(0).max(99),
  fields: z.record(z.string(), z.unknown()),
})

export type Edit = z.infer<typeof editSchema>

export const editsPayloadSchema = z.object({
  edits: z.array(editSchema).max(100).nullish().transform((value) => value ?? []),
  removed: z
    .array(z.number().int().min(0).max(99))
    .max(100)
    .nullish()
    .transform((value) => value ?? []),
})

export interface AppliedEdits {
  operations: Operation[]
  /** A pessoa mexeu em algo? A tela usa para dizer "com meus ajustes" no botão. */
  changed: boolean
}

/**
 * Mescla os ajustes na proposta e devolve a lista final.
 *
 * Não valida o resultado: quem chama revalida tudo pelo `operationSchema`, e é lá que um
 * valor decimal ou uma data torta é recusado. Aqui só se decide **o que pode** mudar.
 *
 * `validCategoryIds` é conferido agora porque a pessoa pode ter escolhido uma categoria
 * que outra aba apagou no meio. Id que não está na lista vira `null` — sem categoria é
 * um estado legítimo; apontar para uma categoria que não existe não é.
 */
export function applyEdits(
  operations: readonly Operation[],
  edits: readonly Edit[],
  removed: readonly number[],
  validCategoryIds: ReadonlySet<string>,
  /** v1.1 — 2026-09-27: cartões e empréstimos da pessoa. Sem a lista, nenhum é aceito. */
  validCreditAccountIds: ReadonlySet<string> = new Set(),
): AppliedEdits {
  const remover = new Set(removed)
  let changed = remover.size > 0

  // Índice do último ajuste de cada posição: dois ajustes para a mesma linha é o caso do
  // duplo envio, e o que vale é o mais recente, não a soma dos dois.
  const porIndice = new Map<number, Edit['fields']>()
  for (const edit of edits) porIndice.set(edit.index, edit.fields)

  const resultado: Operation[] = []

  operations.forEach((operation, indice) => {
    if (remover.has(indice)) return

    const ajuste = porIndice.get(indice)
    if (!ajuste) {
      resultado.push(operation)
      return
    }

    const permitidos = EDITABLE_FIELDS[operation.op] ?? []
    const mesclado: Record<string, unknown> = { ...operation }

    for (const [campo, valor] of Object.entries(ajuste)) {
      // Silêncio, e não erro: um campo a mais no corpo é ruído de cliente, não uma
      // tentativa que mereça mensagem. O que interessa é que ele não entre.
      if (NUNCA_EDITAVEL.has(campo)) continue
      if (!permitidos.includes(campo)) continue

      if (campo === 'category_id' && typeof valor === 'string' && !validCategoryIds.has(valor)) {
        mesclado.category_id = null
        mesclado.category_name = null
        changed = true
        continue
      }

      // v1.1 — 2026-09-27: conta que não é da lista não entra — o ajuste é ignorado, e fica
      // o que a proposta trazia. Virar "do saldo" em silêncio mudaria de onde saiu o dinheiro.
      if (
        campo === 'credit_account_id' &&
        typeof valor === 'string' &&
        valor !== '' &&
        !validCreditAccountIds.has(valor)
      ) {
        continue
      }

      // Conta trocada sem vencimento escolhido: o vencimento antigo era do ciclo da outra
      // conta. Zerar faz a execução calcular o da conta nova.
      if (
        campo === 'credit_account_id' &&
        (mesclado[campo] ?? null) !== valor &&
        !Object.hasOwn(ajuste, 'charge_first_due_on')
      ) {
        mesclado.charge_first_due_on = null
      }

      if (mesclado[campo] !== valor) changed = true
      mesclado[campo] = valor
    }

    // Categoria escolhida à mão manda: um `category_name` que sobrou da proposta faria a
    // execução recriar a categoria antiga por nome e ignorar a escolha.
    if (Object.hasOwn(ajuste, 'category_id') && permitidos.includes('category_id')) {
      mesclado.category_name = null
    }

    resultado.push(mesclado as Operation)
  })

  return { operations: resultado, changed }
}

/** Revalida a lista inteira depois da mesclagem. Nada executa sem passar por aqui. */
export function revalidateOperations(operations: readonly Operation[]) {
  return z.array(operationSchema).safeParse(operations)
}
