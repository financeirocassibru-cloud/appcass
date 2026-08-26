-- Tabelas do domínio. Ver docs/DATA-MODEL.md para o racional de cada decisão.
--
-- Duas regras valem para o schema inteiro:
--   1. Dinheiro é bigint de centavos, nunca numeric ou float.
--   2. Data de competência é `date` puro; carimbo de auditoria é `timestamptz`.

-- Perfil espelhando auth.users, criado pelo trigger on_auth_user_created.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role app_role not null default 'member',
  timezone text not null default 'America/Sao_Paulo',
  -- Âncora do saldo. "Ajustar saldo atual" grava um novo par valor+data aqui;
  -- toda projeção parte dessa âncora, não de zero.
  opening_balance_cents bigint not null default 0,
  opening_balance_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auditoria de convites. O convite em si sai por auth.admin.inviteUserByEmail().
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null,
  invited_by uuid not null references public.profiles (id),
  status invite_status not null default 'pending',
  accepted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- Um convite pendente por e-mail; reconvidar depois de aceito continua valendo.
create unique index invites_pending_email_uniq
  on public.invites (email)
  where (status = 'pending');

-- Categorias POR USUÁRIO. No app antigo a aba de categorias não tinha coluna
-- de usuário e a lista era compartilhada entre todos.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind entry_kind not null default 'expense',
  color text not null default '#7c3aed',
  icon text,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categories_user_name_kind_uniq
  on public.categories (user_id, lower(name), kind);

-- Lançamento: unifica as abas Gastos e Rendas do app antigo.
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind entry_kind not null,
  occurred_on date not null,
  description text not null check (length(trim(description)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  category_id uuid references public.categories (id) on delete set null,
  notes text,
  is_settled boolean not null default false,
  settled_on date,
  source entry_source not null default 'manual',
  -- Aponta para recurring_rules.id, installment_plans.id ou goals.id conforme
  -- `source`. Sem FK porque o alvo varia; a integridade vem do fluxo de escrita.
  source_id uuid,
  -- 'YYYY-MM' para recorrência; número da parcela para parcelamento.
  occurrence_key text,
  installment_number smallint,
  installment_total smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entries_settled_needs_date
    check (is_settled = false or settled_on is not null),
  constraint entries_generated_needs_source
    check (source = 'manual' or (source_id is not null and occurrence_key is not null)),
  constraint entries_installment_pair
    check (
      (installment_number is null and installment_total is null)
      or (installment_number between 1 and installment_total)
    )
);

-- Custos fixos e rendas recorrentes, unificados numa só tabela de regras.
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind entry_kind not null,
  description text not null check (length(trim(description)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  category_id uuid references public.categories (id) on delete set null,
  frequency recurrence_freq not null default 'monthly',
  day_of_month smallint check (day_of_month between 1 and 31),
  starts_on date not null,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_rules_window check (ends_on is null or ends_on >= starts_on)
);

-- Compras parceladas. As N parcelas viram entries no momento da criação, com
-- rateio cent-exato — não são recalculadas a cada leitura.
create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  description text not null check (length(trim(description)) > 0),
  category_id uuid references public.categories (id) on delete set null,
  total_amount_cents bigint not null check (total_amount_cents > 0),
  installments_count smallint not null check (installments_count between 1 and 360),
  first_due_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  target_amount_cents bigint not null check (target_amount_cents > 0),
  target_date date,
  -- Nulo = derivar o aporte a partir de target_date.
  monthly_contribution_cents bigint check (monthly_contribution_cents > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Progresso da meta é SEMPRE a soma dos aportes. O app antigo mantinha um campo
-- `valorAtual` mutável, que divergia do que havia sido guardado de fato.
create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents bigint not null check (amount_cents <> 0),
  occurred_on date not null,
  entry_id uuid references public.entries (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

-- "Planejamento" do app antigo, redesenhado como cenário de projeção.
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  starts_on date not null,
  ends_on date not null,
  opening_balance_cents bigint not null default 0,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenarios_window check (ends_on >= starts_on)
);

-- Substitui o blob "dadosJSON": guarda apenas o DELTA sobre o dado real,
-- nunca uma cópia dele.
create table public.scenario_overrides (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  target_type override_target not null,
  target_id uuid not null,
  -- Nulo vale para todas as ocorrências do alvo.
  occurrence_key text,
  is_included boolean not null default true,
  amount_cents_override bigint check (amount_cents_override > 0),
  date_override date,
  created_at timestamptz not null default now()
);

-- Itens hipotéticos que só existem dentro do cenário.
create table public.scenario_entries (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind entry_kind not null,
  description text not null check (length(trim(description)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  occurs_on date not null,
  category_id uuid references public.categories (id) on delete set null,
  created_at timestamptz not null default now()
);
