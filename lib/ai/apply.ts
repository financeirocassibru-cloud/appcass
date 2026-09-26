import 'server-only'

import { archiveCategory, createCategory, renameCategory } from '@/lib/actions/categories'
import { createEntry, deleteEntry, toggleSettled, updateEntry } from '@/lib/actions/entries'
import {
  archiveGoal,
  createContribution,
  createGoal,
  deleteContribution,
  deleteGoal,
  updateGoal,
} from '@/lib/actions/goals'
import { createInstallmentPlan, deleteInstallmentPlan } from '@/lib/actions/installments'
import { updateBalanceAnchor } from '@/lib/actions/profile'
import {
  createRecurring,
  deleteRecurring,
  materializeRecurring,
  toggleRecurringActive,
  updateRecurring,
} from '@/lib/actions/recurring'
import {
  activateScenario,
  createScenario,
  createScenarioEntry,
  deleteScenario,
  deleteScenarioEntry,
  renameScenario,
} from '@/lib/actions/scenarios'
import { listActiveCategories } from '@/lib/db/queries/categories'
import {
  describeOperation,
  operationToFormData,
  type LabelIndex,
  type Operation,
} from './proposal'

/**
 * Execução da proposta confirmada. v1.0 — 2026-09-26.
 *
 * **Este módulo não escreve no banco.** Ele traduz cada operação em `FormData`
 * e chama a Server Action que a tela já usa. Tudo o que importa vem junto de
 * graça e continua tendo uma implementação só: a validação Zod, a exigência de
 * `settled_on` quando liquidado, as guardas `.eq()` + `.select()` com
 * verificação de linha casada (invariantes 3 e 17), e o `revalidatePath`.
 *
 * Duas consequências de desenho que vale deixar escritas:
 *
 * - **Só roda dentro do request de quem confirmou.** Toda action passa por
 *   `currentUserId()` → `cookies()`. Chamada de um cron, sem cookie, a metade
 *   que exige sessão lançaria e a outra metade rodaria como anônima, a RLS não
 *   casaria linha nenhuma e o resultado seria "não encontrado" — resposta
 *   ERRADA e silenciosa, pior que um erro. Por isso quem chama isto é o Server
 *   Action `confirmProposal`, nunca a varredura.
 * - **Nada aqui confere de quem é o dado.** Um id de outra pessoa na proposta
 *   simplesmente não casa linha, porque a RLS é quem autoriza (invariante 3).
 *   Uma checagem em JavaScript aqui seria a segunda fonte de verdade que o app
 *   antigo tinha, e que errava.
 *
 * O módulo mora em `lib/ai/` e não em `lib/actions/` de propósito: ele monta
 * `FormData`, e `tests/unit/write-filters.test.ts` varre `lib/actions/` atrás de
 * `.update(`/`.delete(` sem filtro — um `formData.delete(...)` ali dentro seria
 * acusado como escrita sem cláusula WHERE.
 */

/** Toda action deste app aceita `{}` como estado inicial. */
const INITIAL = {} as const

export interface AppliedOperation {
  /** A mesma frase em português que a pessoa confirmou. */
  description: string
  ok: boolean
  error?: string
}

export interface ApplyReport {
  applied: AppliedOperation[]
  okCount: number
  failedCount: number
}

/**
 * Resolve `category_name` para o id da categoria criada nesta mesma proposta.
 *
 * `createCategory` devolve só `{ error?, success? }` — não o id da linha nova.
 * Em vez de alterar a action só para servir a IA, releio as categorias depois
 * da primeira criação e caso pelo nome. A releitura acontece no máximo uma vez
 * por proposta, e só quando alguma operação de fato pediu categoria por nome.
 */
class CategoryResolver {
  private byName: Map<string, string> | null = null

  async idFor(name: string): Promise<string | null> {
    if (this.byName === null) {
      const categories = await listActiveCategories()
      this.byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]))
    }
    return this.byName.get(name.trim().toLowerCase()) ?? null
  }

  /** Força a próxima busca a reler — chamado depois de criar uma categoria. */
  invalidate(): void {
    this.byName = null
  }
}

/**
 * Qual categoria esta operação deve usar.
 *
 * Precedência: o nome, quando veio (é a categoria recém-criada); senão o id,
 * desde que ele exista de verdade. Id que o modelo inventou vira `null` — o
 * lançamento entra sem categoria em vez de falhar, e a pessoa corrige na tela.
 */
async function resolveCategory(
  op: Operation,
  resolver: CategoryResolver,
  validCategoryIds: ReadonlySet<string>,
): Promise<string | null | undefined> {
  if (!('category_id' in op)) return undefined

  const name = op.category_name?.trim()
  if (name) return await resolver.idFor(name)

  const id = op.category_id
  if (typeof id !== 'string' || id === '') return null

  return validCategoryIds.has(id) ? id : null
}

/** Executa uma operação chamando a action correspondente. */
async function runOperation(
  op: Operation,
  categoryId: string | null | undefined,
): Promise<{ error?: string; success?: string }> {
  const fd = operationToFormData(op, categoryId)

  switch (op.op) {
    case 'create_entry':
      return await createEntry(INITIAL, fd)
    case 'update_entry':
      return await updateEntry(INITIAL, fd)
    case 'delete_entry':
      return await deleteEntry(INITIAL, fd)
    case 'settle_entry':
      return await toggleSettled(INITIAL, fd)

    case 'create_recurring':
      return await createRecurring(INITIAL, fd)
    case 'update_recurring':
      return await updateRecurring(INITIAL, fd)
    case 'toggle_recurring_active':
      return await toggleRecurringActive(INITIAL, fd)
    case 'delete_recurring':
      return await deleteRecurring(INITIAL, fd)
    case 'materialize_recurring':
      return await materializeRecurring(INITIAL, fd)

    case 'create_installment_plan':
      return await createInstallmentPlan(INITIAL, fd)
    case 'delete_installment_plan':
      return await deleteInstallmentPlan(INITIAL, fd)

    case 'create_goal':
      return await createGoal(INITIAL, fd)
    case 'update_goal':
      return await updateGoal(INITIAL, fd)
    case 'archive_goal':
      return await archiveGoal(INITIAL, fd)
    case 'delete_goal':
      return await deleteGoal(INITIAL, fd)
    case 'create_contribution':
      return await createContribution(INITIAL, fd)
    case 'delete_contribution':
      return await deleteContribution(INITIAL, fd)

    case 'create_category':
      return await createCategory(INITIAL, fd)
    case 'rename_category':
      return await renameCategory(INITIAL, fd)
    case 'archive_category':
      return await archiveCategory(INITIAL, fd)

    case 'create_scenario':
      return await createScenario(INITIAL, fd)
    case 'rename_scenario':
      return await renameScenario(INITIAL, fd)
    case 'delete_scenario':
      return await deleteScenario(INITIAL, fd)
    case 'activate_scenario':
      return await activateScenario(INITIAL, fd)
    case 'create_scenario_entry':
      return await createScenarioEntry(INITIAL, fd)
    case 'delete_scenario_entry':
      return await deleteScenarioEntry(INITIAL, fd)

    case 'update_balance_anchor':
      return await updateBalanceAnchor(INITIAL, fd)
  }
}

/**
 * Executa a proposta inteira, na ordem em que a pessoa a confirmou.
 *
 * Uma operação que falha **não** aborta as demais: se a frase tinha três coisas
 * e a segunda não casou linha, as outras duas continuam certas e desfazê-las
 * seria pior. O relatório diz, item a item, o que entrou e o que não entrou —
 * e é esse relatório que a tela mostra, em vez de um "salvo" genérico.
 *
 * Também não há repetição automática: `createInstallmentPlan` não é idempotente,
 * e repetir criaria um segundo plano para a mesma compra.
 */
export async function applyProposal(
  operations: readonly Operation[],
  labels: LabelIndex,
  validCategoryIds: ReadonlySet<string>,
): Promise<ApplyReport> {
  const resolver = new CategoryResolver()
  const applied: AppliedOperation[] = []

  for (const op of operations) {
    const description = describeOperation(op, labels)

    try {
      const categoryId = await resolveCategory(op, resolver, validCategoryIds)
      const result = await runOperation(op, categoryId)

      // A categoria nova só aparece na releitura seguinte.
      if (op.op === 'create_category' && !result.error) resolver.invalidate()

      applied.push(
        result.error ? { description, ok: false, error: result.error } : { description, ok: true },
      )
    } catch (cause) {
      // As actions devolvem `{ error }` em vez de lançar, mas `currentUserId()`
      // lança `NotAuthenticatedError` quando a sessão expirou no meio da
      // confirmação. Sem este catch, uma operação levaria as seguintes junto.
      applied.push({
        description,
        ok: false,
        error: cause instanceof Error ? cause.message : 'Falha inesperada',
      })
    }
  }

  const okCount = applied.filter((a) => a.ok).length

  return { applied, okCount, failedCount: applied.length - okCount }
}
