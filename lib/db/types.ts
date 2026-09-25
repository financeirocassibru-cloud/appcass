import type { Enums, Tables, TablesInsert, TablesUpdate } from './types.generated'

/**
 * Apelidos do domínio sobre os tipos gerados.
 *
 * Existe para que o resto do código não escreva
 * `Tables<'entries'>` nem `Database['public']['Enums'][...]` espalhado: quando o
 * schema mudar, o `npm run db:types` atualiza `types.generated.ts` e o typecheck
 * aponta aqui, num lugar só.
 *
 * Não confundir com `lib/finance/types.ts`: lá estão os tipos do domínio puro,
 * em camelCase, sem I/O. Aqui é a forma das linhas do banco, em snake_case.
 */

export type EntryRow = Tables<'entries'>
export type EntryInsert = TablesInsert<'entries'>
export type EntryUpdate = TablesUpdate<'entries'>

export type CategoryRow = Tables<'categories'>
export type CategoryInsert = TablesInsert<'categories'>
export type CategoryUpdate = TablesUpdate<'categories'>

export type ProfileRow = Tables<'profiles'>
export type InviteRow = Tables<'invites'>

export type MonthlySummaryRow = Tables<'v_monthly_summary'>
export type CategoryBreakdownRow = Tables<'v_category_breakdown'>

export type EntryKind = Enums<'entry_kind'>
/** Mesmo enum de `EntryKind`: uma categoria é de despesa ou de receita. */
export type CategoryKind = EntryKind
export type EntrySource = Enums<'entry_source'>
export type AppRole = Enums<'app_role'>
export type InviteStatus = Enums<'invite_status'>

export type { Database } from './types.generated'
