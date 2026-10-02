'use server'

import { revalidatePath } from 'next/cache'
import { currentUserId } from '@/lib/db/current-user'
import { getCurrentBalance } from '@/lib/db/queries/balance'
import { balanceAdjustment } from '@/lib/finance/balance'
import { todayISO, type ISODate } from '@/lib/finance/date'
import { revalidateEntryViews } from '@/lib/revalidate'
import { createClient } from '@/lib/supabase/server'
import {
  adjustBalanceSchema,
  resetBalanceSchema,
  saveAnalysisPeriodSchema,
  updateBalanceAnchorSchema,
} from '@/lib/validation/profile'

/**
 * Escrita no próprio perfil. v1.2 — 02/10/2026.
 *
 * v1.2 (02/10/2026): o ajuste de saldo ganhou dois caminhos além da âncora pura —
 * `adjustBalanceWithEntry`, que registra a diferença como um lançamento liquidado (aparece no
 * histórico, com nome e categoria se a pessoa quiser), e `resetBalance`, o "Zerar", que move a
 * âncora sem explicar a diferença e, se pedido com a frase de confirmação, apaga os
 * lançamentos anteriores. `updateBalanceAnchor` continua igual: o assistente o usa.
 *
 * v1.1: `saveAnalysisPeriod`, o último período escolhido na Análise, nas colunas
 * `analysis_*` que a migration 0018 concedeu nominalmente.
 *
 * Só toca colunas que o `grant update (...)` da migration 0008 concede a
 * `authenticated`: `display_name`, `timezone`, `opening_balance_cents` e
 * `opening_balance_on`. `role` e `id` ficam de fora do privilégio de coluna — é
 * o invariante 15, e foi por não observá-lo que qualquer usuário conseguia se
 * promover a admin. Tentar escrever `role` daqui falharia no banco, e é
 * exatamente o que se quer.
 */

export interface ProfileActionState {
  error?: string
  success?: string
}

export async function updateBalanceAnchor(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = updateBalanceAnchorSchema.safeParse({
    openingBalanceCents: formData.get('openingBalanceCents'),
    openingBalanceOn: formData.get('openingBalanceOn'),
    isNegative: formData.get('isNegative'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  // O campo de valor só produz dígitos, então o sinal chega separado. Aplicar o
  // sinal aqui, e não no cliente, evita que um valor já negativo com o botão
  // marcado acabe positivo de novo.
  const magnitude = Math.abs(parsed.data.openingBalanceCents)
  const cents = parsed.data.isNegative ? -magnitude : magnitude

  // Uma âncora no futuro tornaria o saldo inverificável: nenhum lançamento
  // entraria na janela, e o número mostrado seria o informado, sempre.
  if (parsed.data.openingBalanceOn > todayISO()) {
    return { error: 'A data do saldo não pode estar no futuro.' }
  }

  const failure = await writeAnchor(cents, parsed.data.openingBalanceOn)
  if (failure) return { error: failure }

  revalidatePath('/')
  revalidatePath('/ajustes/saldo')
  return { success: 'Saldo ajustado.' }
}

/**
 * Grava a âncora. Devolve a mensagem de erro, ou `null` se gravou. v1.2 — 02/10/2026: extraída
 * de `updateBalanceAnchor` para o "Zerar" usar o mesmo update, com os mesmos cuidados.
 */
async function writeAnchor(cents: number, openingBalanceOn: ISODate): Promise<string | null> {
  const userId = await currentUserId()
  const supabase = await createClient()

  // O `.eq('id', ...)` não é redundante com a RLS, e não tê-lo quebrava a tela:
  // o PostgREST **recusa** UPDATE e DELETE sem filtro, com
  // "UPDATE requires a WHERE clause". É uma proteção dele contra o update sem
  // cláusula que atualiza a tabela inteira, e ela vem antes da RLS — não
  // adianta a policy restringir a linha se o comando nem chega a ser montado.
  //
  // Ou seja: a RLS continua sendo quem autoriza (invariante 3), e o filtro aqui
  // é o que faz o pedido ser aceito. As duas coisas, não uma no lugar da outra.
  //
  // `.select()` e checagem do resultado (invariante 17): sem isso, um update que
  // não casa linha nenhuma volta como sucesso, e a tela diria "salvo" sem ter
  // salvado — o silêncio que deixou a primeira conta sem virar admin.
  const { data, error } = await supabase
    .from('profiles')
    .update({
      opening_balance_cents: cents,
      opening_balance_on: openingBalanceOn,
    })
    .eq('id', userId)
    .select('id')

  if (error) return `Não foi possível salvar: ${error.message}`
  if (!data || data.length === 0) return 'Perfil não encontrado.'
  return null
}

/**
 * Ajuste de saldo que vira lançamento. v1.2 — 02/10/2026.
 *
 * A pessoa diz quanto tem agora; a diferença para o saldo calculado entra no histórico como
 * um lançamento **liquidado hoje** — saída se ela tem menos ("Gastei sem ver"), entrada se tem
 * mais. A âncora não se move: o saldo bate porque o lançamento existe, e o histórico explica
 * o salto em vez de escondê-lo.
 *
 * A diferença é recalculada aqui, com o saldo do banco, e não lida da tela: entre abrir a
 * página e salvar, outro aparelho pode ter registrado algo.
 */
export async function adjustBalanceWithEntry(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = adjustBalanceSchema.safeParse({
    targetCents: formData.get('targetCents'),
    isNegative: formData.get('isNegative'),
    expectedKind: formData.get('expectedKind'),
    description: formData.get('description'),
    categoryId: formData.get('categoryId'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const magnitude = Math.abs(parsed.data.targetCents)
  const targetCents = parsed.data.isNegative ? -magnitude : magnitude

  const today = todayISO()
  const balance = await getCurrentBalance(today)
  const adjustment = balanceAdjustment(balance.currentCents, targetCents)

  if (!adjustment) return { error: 'O saldo já é esse — não há diferença para lançar.' }
  // A categoria escolhida na tela é do tipo que a tela mostrou. Se o tipo virou, gravar
  // misturaria categoria de saída numa entrada; melhor pedir para conferir.
  if (adjustment.kind !== parsed.data.expectedKind) {
    return { error: 'O saldo mudou desde que a tela abriu. Confira a diferença e tente de novo.' }
  }

  const userId = await currentUserId()
  const supabase = await createClient()

  const { error } = await supabase.from('entries').insert({
    user_id: userId,
    kind: adjustment.kind,
    amount_cents: adjustment.amountCents,
    occurred_on: today,
    description: parsed.data.description ?? 'Ajuste de saldo',
    category_id: parsed.data.categoryId,
    // Liquidado: é dinheiro que já saiu (ou entrou), e só liquidado conta no saldo.
    is_settled: true,
    settled_on: today,
    source: 'manual',
  })

  if (error) return { error: `Não foi possível lançar o ajuste: ${error.message}` }

  revalidateEntryViews()
  revalidatePath('/ajustes/saldo')
  return {
    success:
      adjustment.kind === 'expense'
        ? 'Ajuste lançado como saída.'
        : 'Ajuste lançado como entrada.',
  }
}

/**
 * "Zerar": recomeça o acompanhamento a partir de uma data. v1.2 — 02/10/2026.
 *
 * Move a âncora para o valor e a data informados, sem lançar a diferença — como quem parou de
 * registrar e voltou sem saber explicar o que aconteceu. Com `wipeHistory`, apaga todos os
 * lançamentos anteriores à data (inclusive parcelas e contas fixas já lançadas; os cadastros
 * ficam). A frase de confirmação é conferida de novo aqui, pelo schema.
 *
 * Ordem: âncora primeiro, exclusão depois. Se a exclusão falhar, o saldo já está certo —
 * lançamento anterior à âncora não entra na conta — e basta tentar de novo.
 */
export async function resetBalance(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = resetBalanceSchema.safeParse({
    openingBalanceCents: formData.get('openingBalanceCents'),
    openingBalanceOn: formData.get('openingBalanceOn'),
    isNegative: formData.get('isNegative'),
    wipeHistory: formData.get('wipeHistory'),
    confirmation: formData.get('confirmation'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const magnitude = Math.abs(parsed.data.openingBalanceCents)
  const cents = parsed.data.isNegative ? -magnitude : magnitude

  if (parsed.data.openingBalanceOn > todayISO()) {
    return { error: 'A data do saldo não pode estar no futuro.' }
  }

  const failure = await writeAnchor(cents, parsed.data.openingBalanceOn)
  if (failure) return { error: failure }

  revalidatePath('/')
  revalidatePath('/ajustes/saldo')

  if (!parsed.data.wipeHistory) {
    return { success: 'Saldo zerado. O histórico foi mantido.' }
  }

  const supabase = await createClient()

  // O `.lt` é o filtro que o PostgREST exige para aceitar o DELETE (invariante 3); a RLS
  // restringe às linhas da própria pessoa. `.select('id')` para contar o que saiu.
  const { data, error } = await supabase
    .from('entries')
    .delete()
    .lt('occurred_on', parsed.data.openingBalanceOn)
    .select('id')

  if (error) {
    return { error: `Saldo zerado, mas o histórico não foi apagado: ${error.message}` }
  }

  revalidateEntryViews()
  // Parcelas pagas e progresso de meta são derivados dos lançamentos (invariante 7): apagar
  // os antigos muda essas telas também.
  revalidatePath('/parcelas', 'layout')
  revalidatePath('/metas', 'layout')
  revalidatePath('/compromissos', 'layout')
  revalidatePath('/rendas', 'layout')
  const deleted = data?.length ?? 0
  return {
    success:
      deleted === 0
        ? 'Saldo zerado. Não havia lançamentos anteriores para apagar.'
        : `Saldo zerado. ${deleted} ${deleted === 1 ? 'lançamento apagado' : 'lançamentos apagados'}.`,
  }
}

/**
 * Guarda o período escolhido na Análise como o padrão da pessoa. v1.0 — 2026-09-27.
 *
 * Chamada sem esperar resposta, ao lado da navegação: se falhar, a tela já mostrou o período
 * pedido e o único efeito é o padrão não mudar — por isso devolve o erro em vez de lançar.
 * Não revalida nada: o período atual está na URL, e o padrão só vale na próxima visita.
 */
export async function saveAnalysisPeriod(input: unknown): Promise<ProfileActionState> {
  const parsed = saveAnalysisPeriodSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Período inválido' }
  }

  const userId = await currentUserId()
  const supabase = await createClient()

  const patch =
    parsed.data.period === 'custom'
      ? { analysis_period: 'custom', analysis_from: parsed.data.from, analysis_to: parsed.data.to }
      : { analysis_period: parsed.data.period, analysis_from: null, analysis_to: null }

  // Filtro e `.select()` pelos mesmos motivos de `updateBalanceAnchor` (invariantes 3 e 17).
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('id')

  if (error) return { error: `Não foi possível guardar o período: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Perfil não encontrado.' }

  return { success: 'Período guardado.' }
}
