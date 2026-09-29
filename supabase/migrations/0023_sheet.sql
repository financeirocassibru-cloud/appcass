-- Fase 14 — "Ver como planilha". v1.0 — 28/09/2026.
--
-- Três coisas que a planilha precisa e o schema ainda não sabia fazer. As migrations anteriores
-- não são tocadas (invariante 16): tudo aqui é acréscimo ou `drop`/`add` de constraint.
--
-- 1. `profiles.analysis_period` passa a aceitar `last_12m` e `next_12m` — os 12 meses que a
--    planilha usa como padrão e que a Análise também oferece (lib/finance/periods.ts).
--
-- 2. `goal_plan_overrides`: o aporte previsto de UM mês de uma meta, fixado pela pessoa na
--    planilha ("Só este mês"). O aporte previsto é derivado (`expandGoal`), e derivado continua:
--    a tabela guarda só o valor escolhido para aquele mês, e o motor rateia o que falta pelos
--    outros meses. Não é contador nem cópia (invariantes 6 e 7) — é uma escolha da pessoa, que
--    não existe em lugar nenhum mais.
--
-- 3. `update_installment_plan`: mudar o parcelamento INTEIRO — descrição, categoria e valor — de
--    uma vez. Editar uma parcela sozinha desfaria a soma exata que `splitCents` garantiu na
--    criação; na planilha a pessoa é avisada de que mudar uma muda todas, e é isto que executa.
--    Plano e parcelas mudam na mesma transação, e a soma é conferida de novo aqui, como a 0010
--    faz: o cliente calcula, o banco não acredita.

-- 1. Período salvo ---------------------------------------------------------------------------

alter table public.profiles
  drop constraint profiles_analysis_period_known,
  add constraint profiles_analysis_period_known check (
    analysis_period is null or analysis_period in (
      'last_30d', 'next_30d', 'last_month', 'next_month', 'last_90d', 'next_90d',
      'last_3m', 'next_3m', 'last_6m', 'next_6m', 'last_12m', 'next_12m', 'this_year', 'custom'
    )
  );

-- 2. Mês fixado de uma meta ------------------------------------------------------------------

-- Alvo da FK composta abaixo: o mês fixado nunca aponta para a meta de outra pessoa. Uma FK só
-- por `goal_id` seria conferida sem RLS, e aceitaria o id alheio.
alter table public.goals
  add constraint goals_id_user_uniq unique (id, user_id);

create table public.goal_plan_overrides (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Sempre o 1º dia do mês: o aporte previsto cai no último dia, mas o mês é a unidade.
  month date not null check (extract(day from month) = 1),
  -- Zero é válido: "este mês não guardo nada", e o que falta vai para os outros meses.
  amount_cents bigint not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_plan_overrides_goal_fkey
    foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade,
  constraint goal_plan_overrides_month_uniq unique (goal_id, month)
);

create index goal_plan_overrides_user_idx on public.goal_plan_overrides (user_id);

create trigger set_updated_at
  before update on public.goal_plan_overrides
  for each row execute function public.set_updated_at();

alter table public.goal_plan_overrides enable row level security;

create policy "own rows: select" on public.goal_plan_overrides
  for select using (user_id = (select auth.uid()));
create policy "own rows: insert" on public.goal_plan_overrides
  for insert with check (user_id = (select auth.uid()));
create policy "own rows: update" on public.goal_plan_overrides
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows: delete" on public.goal_plan_overrides
  for delete using (user_id = (select auth.uid()));

-- Invariante 15: RLS decide a LINHA, GRANT decide a COLUNA. Depois de criado, só o valor muda;
-- trocar a meta, o mês ou o dono é apagar e criar de novo.
revoke update on public.goal_plan_overrides from anon, authenticated;
grant update (amount_cents) on public.goal_plan_overrides to authenticated;
revoke all on public.goal_plan_overrides from anon;

-- Gravar o mês fixado. Função pelo mesmo motivo da 0011: o `upsert()` do supabase-js mandaria
-- todas as colunas no `do update`, e o privilégio acima só deixa mudar o valor.
create function public.set_goal_month_plan(p_goal_id uuid, p_month date, p_amount_cents bigint)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_id      uuid;
begin
  -- A RLS de `goals` decide se a meta é visível: a de outra pessoa não é encontrada.
  select user_id into v_user_id from public.goals where id = p_goal_id;
  if not found then
    raise exception 'Meta não encontrada' using errcode = 'no_data_found';
  end if;

  insert into public.goal_plan_overrides (goal_id, user_id, month, amount_cents)
  values (p_goal_id, v_user_id, date_trunc('month', p_month)::date, p_amount_cents)
  on conflict (goal_id, month) do update set amount_cents = excluded.amount_cents
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.set_goal_month_plan(uuid, date, bigint) from public, anon;
grant execute on function public.set_goal_month_plan(uuid, date, bigint) to authenticated;

-- 3. O parcelamento inteiro ------------------------------------------------------------------

create function public.update_installment_plan(
  p_plan_id            uuid,
  p_description        text,
  p_total_amount_cents bigint,
  -- O valor de cada parcela, na ordem: `p_amounts[n]` é a parcela n.
  p_amounts            bigint[],
  p_category_id        uuid default null
)
returns int
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_plan    public.installment_plans;
  v_count   int;
  v_sum     bigint;
  v_updated int;
begin
  select * into v_plan from public.installment_plans where id = p_plan_id;
  if not found then
    raise exception 'Parcelamento não encontrado' using errcode = 'no_data_found';
  end if;

  if length(trim(coalesce(p_description, ''))) = 0 then
    raise exception 'Informe a descrição' using errcode = 'check_violation';
  end if;

  v_count := coalesce(array_length(p_amounts, 1), 0);
  if v_count <> v_plan.installments_count then
    raise exception 'Esperadas % parcelas, recebidas %', v_plan.installments_count, v_count
      using errcode = 'check_violation';
  end if;

  select coalesce(sum(a), 0) into v_sum from unnest(p_amounts) as a;
  if v_sum <> p_total_amount_cents then
    raise exception 'A soma das parcelas (%) não bate com o total (%)', v_sum, p_total_amount_cents
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from unnest(p_amounts) as a where a is null or a <= 0) then
    raise exception 'Parcela com valor não positivo' using errcode = 'check_violation';
  end if;

  update public.installment_plans
     set description = p_description,
         category_id = p_category_id,
         total_amount_cents = p_total_amount_cents
   where id = p_plan_id;

  -- A descrição de cada parcela segue a de `planInstallments` (lib/finance/installments.ts):
  -- "Sofá (1/3)".
  update public.entries as e
     set description = p_description || ' (' || e.installment_number || '/' || v_plan.installments_count || ')',
         category_id = p_category_id,
         amount_cents = p_amounts[e.installment_number]
   where e.source = 'installment'
     and e.source_id = p_plan_id
     and e.installment_number between 1 and v_count;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function public.update_installment_plan(uuid, text, bigint, bigint[], uuid)
  from public, anon;
grant execute on function public.update_installment_plan(uuid, text, bigint, bigint[], uuid)
  to authenticated;
