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

// v1.1 — 2026-09-26: fase 7, assistente de IA.
export type AiJobRow = Tables<'ai_jobs'>
export type AiJobInsert = TablesInsert<'ai_jobs'>
export type AiJobUpdate = TablesUpdate<'ai_jobs'>
export type PushSubscriptionRow = Tables<'push_subscriptions'>

/**
 * As únicas colunas de `profiles` que a tela de IA escreve.
 *
 * Recorta `TablesUpdate<'profiles'>` de propósito: a migration 0012 concedeu
 * `update` só nestas três, e um tipo mais largo deixaria passar no typecheck um
 * `patch` que o Postgres recusaria em tempo de execução.
 */
export type AiSettingsPatch = Pick<
  TablesUpdate<'profiles'>,
  'ai_insights_enabled' | 'ai_notifications_enabled' | 'ai_model'
>

export type MonthlySummaryRow = Tables<'v_monthly_summary'>
export type CategoryBreakdownRow = Tables<'v_category_breakdown'>

export type EntryKind = Enums<'entry_kind'>
/** Mesmo enum de `EntryKind`: uma categoria é de despesa ou de receita. */
export type CategoryKind = EntryKind
export type EntrySource = Enums<'entry_source'>
export type AppRole = Enums<'app_role'>
export type InviteStatus = Enums<'invite_status'>
export type AiJobKind = Enums<'ai_job_kind'>
export type AiJobStatus = Enums<'ai_job_status'>

export type { Database } from './types.generated'
