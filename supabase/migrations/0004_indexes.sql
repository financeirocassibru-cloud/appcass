-- Índices. Dois deles não são otimização: são regras de negócio impostas pelo
-- banco, no lugar de código de aplicação que pode falhar no meio.

-- Impede que a mesma ocorrência gerada vire dois lançamentos. É o que faz
-- "marcar como pago" ser idempotente: no app antigo, marcar duas vezes criava
-- dois débitos.
create unique index entries_generated_uniq
  on public.entries (user_id, source, source_id, occurrence_key)
  where (source <> 'manual');

-- Um cenário ativo por usuário. O app antigo desativava os demais em `await`
-- sequenciais no cliente; uma falha no meio deixava dois ativos.
create unique index scenarios_one_active_idx
  on public.scenarios (user_id)
  where (is_active);

-- Leitura do extrato: sempre por usuário, ordenado por data decrescente.
create index entries_user_date_idx
  on public.entries (user_id, occurred_on desc);

-- Agenda de próximos eventos e contas em atraso.
create index entries_user_pending_idx
  on public.entries (user_id, occurred_on)
  where (is_settled = false);

-- Gráfico de gastos por categoria.
create index entries_user_category_idx
  on public.entries (user_id, category_id)
  where (category_id is not null);

-- Busca das parcelas de um plano, para a tela de parcelamentos.
create index entries_source_idx
  on public.entries (user_id, source, source_id)
  where (source <> 'manual');

create index categories_user_idx
  on public.categories (user_id)
  where (archived_at is null);

create index recurring_rules_user_active_idx
  on public.recurring_rules (user_id)
  where (is_active);

create index installment_plans_user_idx
  on public.installment_plans (user_id);

create index goals_user_active_idx
  on public.goals (user_id)
  where (archived_at is null);

create index goal_contributions_goal_idx
  on public.goal_contributions (goal_id);

create index scenario_overrides_scenario_idx
  on public.scenario_overrides (scenario_id);

create index scenario_entries_scenario_idx
  on public.scenario_entries (scenario_id);

-- Um override por alvo e ocorrência dentro do cenário.
create unique index scenario_overrides_target_uniq
  on public.scenario_overrides (scenario_id, target_type, target_id, coalesce(occurrence_key, ''));

-- O resgate busca o convite pelo hash do código; único impede colisão.
create unique index invites_code_hash_uniq
  on public.invites (code_hash);

create index invites_invited_by_idx
  on public.invites (invited_by);

-- Lista de convites na tela de ajustes, mais recentes primeiro.
create index invites_status_idx
  on public.invites (status, created_at desc);
