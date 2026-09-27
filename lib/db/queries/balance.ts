import { computeBalance, type BalanceBreakdown, type BalanceEntry } from '@/lib/finance/balance'
import { todayISO, type ISODate } from '@/lib/finance/date'
import type { EntryKind } from '@/lib/db/types'
import { createClient } from '@/lib/supabase/server'

/**
 * Saldo atual e a âncora de onde ele parte.
 *
 * A soma acontece em JavaScript, em `computeBalance`, e não no banco. Duas
 * razões:
 *
 * - `v_monthly_summary` **não** serve: ela soma liquidado e pendente juntos.
 *   Somar pendente ao saldo mostraria como gasto o dinheiro que ainda está na
 *   conta. A view serve aos gráficos, onde o total do mês é o que interessa.
 * - Somar via `select` exigiria uma função no banco, e portanto uma migration
 *   nova nesta fase. O `select` aqui é estreito (quatro colunas, só liquidados,
 *   só dentro da janela) e cai no índice `entries_user_date_idx`. Se um dia a
 *   janela crescer a ponto de pesar, a saída é uma RPC de agregação — não
 *   espalhar a regra pelo SQL.
 */

/** Âncora do saldo, como está em `profiles`. */
export interface BalanceAnchor {
  openingBalanceCents: number
  openingBalanceOn: ISODate
  /**
   * `false` quando a pessoa nunca informou quanto tem: convida a ajustar.
   *
   * v1.1 — 2026-09-27: vem de `opening_balance_set_at` (migration 0015), não mais de
   * `opening_balance_cents !== 0`. Salvar saldo zero é informar que não tem nada, e o
   * convite tem de sumir.
   */
  isConfigured: boolean
}

export interface CurrentBalance extends BalanceBreakdown {
  today: ISODate
  isAnchorConfigured: boolean
  /**
   * Se existe ao menos um lançamento, em qualquer data e situação. v1.1 — 2026-09-27.
   *
   * `countedEntries` não serve para isto: conta só os liquidados dentro da janela da
   * âncora. Quem já registrou qualquer coisa não está no primeiro uso, e o convite para
   * informar o saldo deixa de ser o assunto da tela.
   */
  hasEntries: boolean
}

export async function getBalanceAnchor(): Promise<BalanceAnchor> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('opening_balance_cents, opening_balance_on, opening_balance_set_at')
    .maybeSingle()

  if (error) throw new Error(`Falha ao ler a âncora do saldo: ${error.message}`)

  // A RLS já restringe `profiles` à própria linha; ausência aqui significa que o
  // trigger de criação não rodou, o que é um estado quebrado e não um zero.
  if (!data) throw new Error('Perfil não encontrado.')

  return {
    // `bigint` chega como number no supabase-js; os valores deste app estão
    // muito abaixo de 2^53, e `amount_cents` tem teto validado em 9.999.999.999.
    openingBalanceCents: Number(data.opening_balance_cents),
    openingBalanceOn: data.opening_balance_on,
    isConfigured: data.opening_balance_set_at !== null,
  }
}

/**
 * O saldo de hoje.
 *
 * `today` entra por parâmetro para que a página possa reaproveitar a mesma data
 * que já usou em outro bloco — duas leituras do relógio na mesma renderização
 * podem cair em dias diferentes na virada da meia-noite.
 */
export async function getCurrentBalance(today: ISODate = todayISO()): Promise<CurrentBalance> {
  const [anchor, hasEntries] = await Promise.all([getBalanceAnchor(), hasAnyEntry()])
  const supabase = await createClient()

  // Âncora no futuro: a janela é vazia, então não há o que buscar. Sem esta
  // saída o `gte`/`lte` invertido devolveria zero linhas de qualquer forma, mas
  // pagando uma ida ao banco para descobrir isso.
  if (anchor.openingBalanceOn > today) {
    return {
      ...computeBalance({ ...anchor, today, entries: [] }),
      today,
      isAnchorConfigured: anchor.isConfigured,
      hasEntries,
    }
  }

  const { data, error } = await supabase
    .from('entries')
    .select('kind, amount_cents, occurred_on, is_settled')
    .eq('is_settled', true)
    .gte('occurred_on', anchor.openingBalanceOn)
    .lte('occurred_on', today)

  if (error) throw new Error(`Falha ao calcular o saldo: ${error.message}`)

  const entries: BalanceEntry[] = (data ?? []).map((row) => ({
    kind: row.kind as EntryKind,
    amountCents: Number(row.amount_cents),
    occurredOn: row.occurred_on,
    isSettled: row.is_settled,
  }))

  return {
    ...computeBalance({
      openingBalanceCents: anchor.openingBalanceCents,
      openingBalanceOn: anchor.openingBalanceOn,
      today,
      entries,
    }),
    today,
    isAnchorConfigured: anchor.isConfigured,
    hasEntries,
  }
}

/**
 * Há algum lançamento? v1.1 — 2026-09-27.
 *
 * Uma linha basta para responder, e `limit(1)` para no primeiro índice que casar. A
 * RLS restringe `entries` à própria pessoa (invariante 3), então não há filtro de
 * usuário aqui — leitura não precisa de `.eq(...)`, só escrita.
 */
async function hasAnyEntry(): Promise<boolean> {
  const supabase = await createClient()

  const { data, error } = await supabase.from('entries').select('id').limit(1)

  if (error) throw new Error(`Falha ao verificar os lançamentos: ${error.message}`)

  return (data ?? []).length > 0
}
