'use server'

import { revalidatePath } from 'next/cache'
import { currentUserId } from '@/lib/db/current-user'
import { todayISO } from '@/lib/finance/date'
import { createClient } from '@/lib/supabase/server'
import { updateBalanceAnchorSchema } from '@/lib/validation/profile'

/**
 * Escrita no próprio perfil.
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
      opening_balance_on: parsed.data.openingBalanceOn,
    })
    .eq('id', userId)
    .select('id')

  if (error) return { error: `Não foi possível salvar: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Perfil não encontrado.' }

  revalidatePath('/')
  revalidatePath('/ajustes/saldo')
  return { success: 'Saldo ajustado.' }
}
