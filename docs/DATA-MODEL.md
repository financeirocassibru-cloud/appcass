# Modelo de dados

Ver o "porquê" de cada decisão em [`ARCHITECTURE.md`](./ARCHITECTURE.md). Este documento é a
referência de schema para escrever as migrations em `supabase/migrations/`.

## Enums

```sql
create type entry_kind      as enum ('expense', 'income');
create type entry_source    as enum ('manual', 'recurring', 'installment', 'goal');
create type recurrence_freq as enum ('monthly', 'weekly', 'yearly');
create type override_target as enum ('entry', 'recurring_rule', 'installment_plan', 'goal');
create type invite_status   as enum ('pending', 'accepted', 'revoked');
create type app_role        as enum ('admin', 'member');
```

## Tabelas

```sql
-- Perfil espelhando auth.users (criado por trigger on_auth_user_created)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role app_role not null default 'member',
  timezone text not null default 'America/Sao_Paulo',
  -- Âncora do saldo. "Ajustar saldo atual" (ajustarSaldoAtual no app antigo) grava
  -- um novo par valor+data aqui; toda projeção parte dessa âncora, não de zero.
  opening_balance_cents bigint not null default 0,
  opening_balance_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Convite por código, sem e-mail. O admin gera o código em /ajustes/convites e
-- repassa por fora; quem resgata escolhe e-mail e senha em /entrar.
--
-- Guardamos só o sha256 do código. Determinístico, e não bcrypt, porque o
-- resgate busca PELO código; com ~116 bits de entropia, pré-computar é inútil.
create table invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null,
  label text,                       -- rótulo livre do admin; não é o e-mail
  invited_by uuid not null references profiles(id),
  status invite_status not null default 'pending',
  accepted_by uuid references profiles(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (status <> 'accepted' or accepted_at is not null)
);
create unique index invites_code_hash_uniq on invites (code_hash);

-- O resgate reivindica com UPDATE condicional, e é isso que garante uso único
-- e respeita o prazo, inclusive com duas pessoas tentando ao mesmo tempo:
--   update invites set status='accepted', accepted_at=now()
--    where code_hash=$1 and status='pending' and expires_at > now()
--   returning id;

-- Categorias POR USUÁRIO (corrige o compartilhamento global do app antigo)
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind entry_kind not null default 'expense',
  color text not null default '#6366f1',
  icon text,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lower(name), kind)
);

-- Lançamento: unifica Gastos + Rendas do app antigo
create table entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind entry_kind not null,
  occurred_on date not null,
  description text not null check (length(trim(description)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  category_id uuid references categories(id) on delete set null,
  notes text,
  is_settled boolean not null default false,   -- "Pago" / "Recebido"
  settled_on date,
  source entry_source not null default 'manual',
  source_id uuid,               -- recurring_rules.id | installment_plans.id | goals.id
  occurrence_key text,          -- 'YYYY-MM' para recorrência; nº da parcela para parcelamento
  installment_number smallint,
  installment_total smallint,
  import_key text,              -- sha256 da linha do extrato importado (0016); nulo se digitado
  -- v1.3 — 2026-09-27 (0019): palavras que, no extrato, liquidam este lançamento pendente.
  -- A parcela usa as do plano, e a ocorrência de conta fixa, as da regra.
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (is_settled = false or settled_on is not null),
  check (source = 'manual' or (source_id is not null and occurrence_key is not null))
);

-- Chave da idempotência: uma ocorrência gerada nunca duplica
create unique index entries_generated_uniq
  on entries (user_id, source, source_id, occurrence_key)
  where (source <> 'manual');
-- v1.1 — 2026-09-27: importar o mesmo extrato duas vezes não duplica (migration 0016).
-- Não parcial de propósito: NULL não colide, e o upsert do supabase-js precisa do índice
-- inteiro para usar `on_conflict=user_id,import_key`.
create unique index entries_import_key_uniq on entries (user_id, import_key);
create index entries_user_date_idx on entries (user_id, occurred_on desc);
create index entries_user_pending_idx on entries (user_id, occurred_on) where (is_settled = false);

-- Custos fixos + rendas recorrentes, unificados
create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind entry_kind not null,
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  category_id uuid references categories(id) on delete set null,
  frequency recurrence_freq not null default 'monthly',
  day_of_month smallint check (day_of_month between 1 and 31),
  starts_on date not null,
  ends_on date,
  is_active boolean not null default true,
  keywords text[] not null default '{}',   -- 0019: a linha do extrato que liquida a ocorrência
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

-- Compras parceladas. As N parcelas viram entries no momento da criação.
-- v1.2 — 2026-09-27: `create_installment_plan(..., p_paid_count)` (migration 0017) cadastra um
-- parcelamento já em andamento: as primeiras `p_paid_count` nascem liquidadas, cada uma com
-- `settled_on` = a própria data, na mesma transação do plano.
-- `set_installments_paid(plan, n)` (mesma 0017) declara isso num plano já existente: 1..n pagas
-- (as já pagas mantêm o `settled_on`), as seguintes pendentes.
create table installment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  category_id uuid references categories(id) on delete set null,
  total_amount_cents bigint not null check (total_amount_cents > 0),
  installments_count smallint not null check (installments_count between 1 and 360),
  first_due_on date not null,
  keywords text[] not null default '{}',   -- 0019: vale para todas as parcelas, sem cópia
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount_cents bigint not null check (target_amount_cents > 0),
  target_date date,
  monthly_contribution_cents bigint,   -- null = calcular a partir de target_date
  keywords text[] not null default '{}',   -- 0019: a saída do extrato que vira aporte
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Progresso da meta = SOMA de aportes, nunca um campo mutável (corrige o drift de valorAtual)
create table goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents bigint not null check (amount_cents <> 0),
  occurred_on date not null,
  -- v1.3 — 2026-09-27 (0019): `on delete cascade` e único. O aporte feito como saída (pelo
  -- [+] ou pela importação) é amarrado a ela: excluir a saída leva o aporte, e o trigger
  -- `sync_goal_contribution` mantém valor e data iguais aos dela.
  entry_id uuid references entries(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

-- "Planejamento" do app antigo, redesenhado como cenário de projeção
create table scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  opening_balance_cents bigint not null default 0,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

-- Só um cenário ativo por usuário — garantido pelo banco, não por await sequencial no cliente
create unique index scenarios_one_active_idx on scenarios (user_id) where (is_active);

-- Substitui o blob "dadosJSON" do app antigo: guarda apenas o DELTA sobre o dado real
create table scenario_overrides (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type override_target not null,
  target_id uuid not null,
  occurrence_key text,          -- null = vale para todas as ocorrências desse alvo
  is_included boolean not null default true,
  amount_cents_override bigint check (amount_cents_override > 0),
  date_override date,
  created_at timestamptz not null default now(),
  unique (scenario_id, target_type, target_id, occurrence_key)
);

-- Itens hipotéticos que só existem dentro do cenário ("e se eu comprar X?")
create table scenario_entries (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind entry_kind not null,
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  occurs_on date not null,
  category_id uuid references categories(id) on delete set null,
  created_at timestamptz not null default now()
);
```

> A aba `Ciclos` do app antigo não é reconstruída — era código morto (ver `ARCHITECTURE.md`).

## Conexão do extrato (migration 0019) — v1.3 — 2026-09-27

- `record_goal_contribution(goal, valor, data, nota?, import_key?, lote?)` — o aporte como
  saída: um lançamento `source = 'goal'` com `occurrence_key` = `YYYY-MM` (o mesmo do aporte
  previsto por `expandGoal`, que a projeção então descarta; o segundo do mês é `YYYY-MM:2`) e
  o `goal_contributions` amarrado por `entry_id`, numa transação.
- `reconcile_import_row(alvo, id, vencimento, data, tipo, valor, import_key, lote?, notas?)` —
  a linha do extrato liquida o item cadastrado em vez de virar lançamento novo. `entry`
  (avulso/parcela/conta fixa já materializada pendente), `recurring` (materializa a ocorrência
  do vencimento) ou `goal` (aporte). Vale o valor do extrato, menos na parcela; `occurred_on`
  vira a data do extrato, porque o saldo soma por ela. Devolve `null` quando o item já não está
  pendente — a importação então grava a linha como lançamento novo. O casamento em si é puro,
  no navegador: `lib/finance/reconcile.ts`.

## Cartões e empréstimos (migrations 0020/0021) — v1.4 — 2026-09-27

```sql
create type credit_account_kind as enum ('card', 'loan');
-- entry_source ganhou 'credit_bill' (pagamento da fatura) e 'credit_carry' (parcelamento da
-- fatura) — em arquivo próprio (0020): valor novo de enum não pode ser usado na transação em
-- que nasceu.

create table credit_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind credit_account_kind not null,
  name text not null,
  limit_cents bigint,          -- null = sem limite; só avisa, não bloqueia
  closing_day smallint,        -- cartão: fecha neste dia
  due_day smallint,            -- cartão: vence neste dia; empréstimo: dia fixo das parcelas
  due_on date,                 -- empréstimo de vencimento único
  keywords text[] not null default '{}',   -- a linha do extrato que paga a fatura
  archived_at timestamptz,
  unique (id, user_id)         -- alvo das FKs compostas
);

alter table entries
  add column credit_account_id uuid,       -- FK (credit_account_id, user_id): nunca a conta alheia
  add column charge_first_due_on date,     -- "será pago em": 1ª cobrança
  add column charge_count smallint not null default 1,   -- em quantas vezes
  add column interest_cents bigint not null default 0;   -- valor a pagar − valor
-- check: saída financiada nunca is_settled (quem conclui é a fatura, derivado)
-- installment_plans.credit_account_id e recurring_rules.credit_account_id: no cartão.
```

- Cobranças e faturas são **derivadas** em `lib/finance/credit.ts` (`chargesOf`, `buildBills`);
  nenhuma tabela de fatura.
- `pay_credit_bill(conta, vencimento, valor, pago_em, juros?, import_key?, lote?)` — o pagamento
  como saída liquidada `source = 'credit_bill'`, chave = vencimento (`:2`… para o segundo).
- `carry_credit_bill(conta, vencimento, restante, total, parcelas, 1º vencimento)` — o
  parcelamento do restante, `source = 'credit_carry'`, idempotente pelo vencimento.
- `set_installment_plan_credit(plano, conta?)` — põe/tira do cartão as parcelas pendentes.
- `credit_first_due(...)` — o ciclo do cartão em SQL, igual a `defaultFirstDue()`.
- `v_monthly_summary`, `v_category_breakdown`, `v_source_breakdown` seguem a **competência**: sem
  o principal de `credit_bill`/`credit_carry` e sem o dinheiro que veio de cartão/empréstimo;
  `interest_cents` soma como saída. `v_interest_by_month` alimenta "Juros e encargos".

## Views (dashboard)

Criar com `security_invoker = on` para que a RLS das tabelas-base seja respeitada por quem
consulta a view:

```sql
create view v_monthly_summary
  with (security_invoker = on) as
select user_id,
       date_trunc('month', occurred_on)::date as month,
       sum(amount_cents) filter (where kind = 'income')  as income_cents,
       sum(amount_cents) filter (where kind = 'expense') as expense_cents,
       sum(amount_cents) filter (where kind = 'income')
         - sum(amount_cents) filter (where kind = 'expense') as net_cents
from entries
group by user_id, date_trunc('month', occurred_on);
```

Views análogas: `v_category_breakdown` (por categoria e mês), `v_goal_progress` (meta vs.
`SUM(goal_contributions)`), `v_installment_progress` (parcelas pagas vs. total, a partir de
`entries` com `source = 'installment'`).

## Triggers

- `handle_new_user()` — `after insert on auth.users`: cria a linha em `profiles`, insere as 9
  categorias-semente do app antigo (Mercado, Farmácia, Alimentação, Transporte, Luz, Água,
  Internet, Celular, Outros) **só para aquele usuário**, e marca o `invites` correspondente
  como `accepted`.
- `set_updated_at()` — `before update`, aplicada em toda tabela que tem `updated_at`.

## RLS

Habilitar em todas as tabelas (`alter table ... enable row level security`). Padrão por
tabela, 4 policies:

```sql
create policy "own rows: select" on entries for select
  using (user_id = (select auth.uid()));
create policy "own rows: insert" on entries for insert
  with check (user_id = (select auth.uid()));
create policy "own rows: update" on entries for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows: delete" on entries for delete
  using (user_id = (select auth.uid()));
```

Usar `(select auth.uid())` — não `auth.uid()` sozinho — para que o Postgres avalie a função
uma vez por consulta (InitPlan) em vez de uma vez por linha.

Exceções ao padrão:
- `profiles`: cada usuário só lê/edita a própria linha.
- `invites`: leitura e escrita só para `role = 'admin'`, via função `is_admin()` (`stable`).
  v1.5 — 2026-09-27 (migration 0022): era `security definer` para evitar uma recursão que não
  existe — nenhuma policy de `profiles` chama `is_admin()`. Agora é `security invoker`: lê o
  próprio perfil pela policy "ler o próprio", com o mesmo resultado, e deixa de ser uma função
  que ignora a RLS exposta em `/rest/v1/rpc`. `rls_auto_enable()` (do event trigger
  `ensure_rls`, criado pelo Supabase) perdeu o EXECUTE de `anon`/`authenticated`.

## Motor de projeção

Substitui `calcularFluxoDiario` (`legacy/google-apps-script/Code.gs.md:913-1077`) e
`calculateDailyFlow`/`calculatePlanningProjection` do frontend legado. Vive em
`lib/finance/`, puro e sem I/O — a peça que mais precisa de testes automatizados.

```ts
// lib/finance/types.ts
export type Occurrence = {
  key: string;             // `${origin}:${sourceId}:${occurrenceKey}` — estável, serve de React key
  date: string;            // YYYY-MM-DD
  kind: 'income' | 'expense';
  amountCents: number;
  description: string;
  origin: 'entry' | 'recurring' | 'installment' | 'goal' | 'scenario';
  sourceId: string | null;
  categoryId: string | null;
  isRealized: boolean;     // já existe como entry
  isSettled: boolean;
};

export type DayProjection = {
  date: string;
  occurrences: Occurrence[];
  inflowCents: number;
  outflowCents: number;
  balanceCents: number;    // saldo acumulado ao fim do dia
};
```

Pipeline de `projectRange({ from, to, openingBalanceCents, data, scenario? }): DayProjection[]`:

1. **Materializados** — `entries` no intervalo viram ocorrências (`isRealized: true`).
2. **Expandir recorrências** — `expandRecurringRule(rule, from, to)` gera uma ocorrência por
   período, respeitando `starts_on`/`ends_on`/`is_active`.
3. **Deduplicar** — descartar a ocorrência projetada cujo `(source, source_id, occurrence_key)`
   já existe em `entries`. É o passo que impede a contagem em dobro que o app antigo cometia.
4. **Metas** — aporte mensal = `monthly_contribution_cents`, ou, se nulo e houver
   `target_date`, `splitCents(faltante, mesesRestantes)`. O app antigo dividia pelo tamanho do
   planejamento, ignorando o prazo real da meta.
5. **Cenário** (opcional) — aplicar `scenario_overrides` (excluir / trocar valor / trocar
   data) e somar `scenario_entries`.
6. **Acumular** — ordenar por data; `saldo = anterior + entradas − saídas`; preencher todos os
   dias do intervalo, inclusive os sem movimento.

Parcelamentos não entram na expansão: as N parcelas já são `entries` reais desde a criação do
plano — geradas com `splitCents` para que a soma bata exatamente com o total.

### Regras aritméticas que precisam de teste unitário

```ts
// lib/finance/money.ts
splitCents(totalCents: number, parts: number): number[]
// base = floor(total/parts); resto = total - base*parts;
// as primeiras `resto` parcelas recebem +1 centavo.
// Invariante obrigatória: sum(splitCents(t, n)) === t — sempre. (property test)

// lib/finance/date.ts
clampDayToMonth(day: number, year: number, month: number): number
// dia 31 em mês de 30 → 30; 29/30/31 em fevereiro → 28 ou 29.
// Reproduz `ajustarDiaAoMes` do app antigo (Code.gs.md:934-942), agora coberto por teste.
```
