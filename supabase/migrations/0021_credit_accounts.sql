-- Fase 13 — cartões e empréstimos como forma de pagamento.
--
-- v1.0 — 2026-09-27. As migrations 0001–0020 já rodaram no projeto real e são imutáveis
-- (invariante 16); o que falta vira migration nova. Os valores de enum usados aqui nasceram
-- na 0020 — ver lá por que em arquivo separado.
--
-- O problema: até aqui `entries.occurred_on` era ao mesmo tempo a data do gasto, a do
-- vencimento e a do caixa. Um gasto no cartão só tinha duas saídas ruins: lançar cada compra
-- com a data futura da fatura (perdendo a data real) ou lançar só "Cartão" genérico (perdendo
-- a categoria). Separamos duas leituras do mesmo lançamento:
--
-- - COMPETÊNCIA: o que foi gasto, em quê, quando. A compra no cartão conta na categoria, na
--   data do gasto. O pagamento da fatura NÃO conta de novo — a fatura é a soma das compras.
-- - CAIXA: quando o dinheiro sai do saldo. A compra no cartão não sai; sai a fatura, no dia
--   em que é paga. O dinheiro que VEIO de um empréstimo entra no saldo agora, e a dívida sai
--   nos vencimentos.
--
-- O que muda no schema:
--
-- 1. `credit_accounts` — os cartões e empréstimos da pessoa, com limite opcional e o ciclo
--    (fechamento + vencimento no cartão; vencimento único ou dia fixo no empréstimo).
-- 2. Em `entries`: `credit_account_id` (de onde veio), `charge_first_due_on` (quando será
--    pago — a 1ª cobrança), `charge_count` (em quantas vezes) e `interest_cents` (valor a
--    pagar − valor; e, no pagamento da fatura, o que foi pago acima do total calculado).
--    As cobranças e as faturas são DERIVADAS em `lib/finance/credit.ts` (invariante 7):
--    nenhuma tabela de fatura, nenhum total gravado.
-- 3. Parcelamentos e contas fixas no cartão (`credit_account_id` no plano e na regra).
-- 4. Funções: `pay_credit_bill`, `carry_credit_bill`, `set_installment_plan_credit`, e as
--    versões novas de `create_installment_plan`, `materialize_recurring_occurrence`,
--    `set_installments_paid` e `reconcile_import_row`.
-- 5. As views de competência passam a seguir a regra acima, e `v_interest_by_month` expõe
--    os juros.

-- 1. Cartões e empréstimos ---------------------------------------------------------------

create table public.credit_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.credit_account_kind not null,
  name text not null check (length(trim(name)) > 0 and length(name) <= 60),
  -- Nulo = sem limite determinado. Só informa: gastar acima do limite avisa, não bloqueia.
  limit_cents bigint check (limit_cents is null or limit_cents > 0),
  -- Cartão: compra até o dia de fechamento entra na fatura que fecha naquele mês.
  closing_day smallint check (closing_day between 1 and 31),
  -- Cartão: dia de vencimento da fatura. Empréstimo: dia fixo mensal das parcelas.
  due_day smallint check (due_day between 1 and 31),
  -- Empréstimo de vencimento único ("pago à vista" numa data).
  due_on date,
  -- A linha do extrato que paga a fatura (lib/finance/reconcile.ts). Mesmo teto da 0018.
  keywords text[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_accounts_card_cycle
    check (kind <> 'card' or (closing_day is not null and due_day is not null and due_on is null)),
  constraint credit_accounts_loan_due
    check (kind <> 'loan' or (closing_day is null and (due_day is null or due_on is null))),
  constraint credit_accounts_keywords_size check (
    cardinality(keywords) <= 30 and length(array_to_string(keywords, '')) <= 1200
  ),
  -- Alvo das FKs compostas abaixo.
  constraint credit_accounts_id_user_uniq unique (id, user_id)
);

create index credit_accounts_user_idx on public.credit_accounts (user_id);

create trigger set_updated_at
  before update on public.credit_accounts
  for each row execute function public.set_updated_at();

alter table public.credit_accounts enable row level security;

-- Mesmo padrão de quatro policies das demais tabelas do dono (0005, 0012).
do $$
declare
  t text;
begin
  foreach t in array array['credit_accounts']
  loop
    execute format(
      'create policy %I on public.%I for select using (user_id = (select auth.uid()))',
      'own rows: select', t
    );
    execute format(
      'create policy %I on public.%I for insert with check (user_id = (select auth.uid()))',
      'own rows: insert', t
    );
    execute format(
      'create policy %I on public.%I for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      'own rows: update', t
    );
    execute format(
      'create policy %I on public.%I for delete using (user_id = (select auth.uid()))',
      'own rows: delete', t
    );
  end loop;
end
$$;

-- 2. Lançamento financiado ------------------------------------------------------------------
--
-- FK COMPOSTA `(credit_account_id, user_id)`: uma FK comum é conferida pelo Postgres sem
-- passar pela RLS, e deixaria Ana apontar o lançamento dela para o cartão de Bruno sabendo o
-- uuid. Com o `user_id` no par, o cartão precisa ser do mesmo dono da linha.
-- `on delete restrict`: cartão com lançamento não some — arquiva.

alter table public.entries
  add column credit_account_id uuid,
  add column charge_first_due_on date,
  add column charge_count smallint not null default 1,
  add column interest_cents bigint not null default 0,
  add constraint entries_credit_account_fkey
    foreign key (credit_account_id, user_id)
    references public.credit_accounts (id, user_id) on delete restrict,
  -- De onde veio e quando será pago andam juntos.
  add constraint entries_credit_pair
    check ((credit_account_id is null) = (charge_first_due_on is null)),
  add constraint entries_charge_count_range
    check (charge_count between 1 and 360 and (credit_account_id is not null or charge_count = 1)),
  add constraint entries_interest_nonneg check (interest_cents >= 0),
  -- Juros só existem na dívida (lançamento financiado) ou no pagamento dela.
  add constraint entries_interest_scope
    check (interest_cents = 0 or credit_account_id is not null or source = 'credit_bill'),
  -- A SAÍDA financiada nunca é liquidada pelo próprio lançamento: quem a conclui é o
  -- pagamento da fatura, e esse estado é derivado (invariante 7), não gravado. É isto que
  -- impede o extrato de "pagar" uma compra do cartão — e o saldo de contá-la.
  add constraint entries_credit_expense_open
    check (credit_account_id is null or kind = 'income' or not is_settled),
  -- O parcelamento da fatura é, por definição, uma dívida no cartão.
  add constraint entries_credit_carry_funded
    check (source <> 'credit_carry' or credit_account_id is not null),
  -- O pagamento da fatura sai do saldo; ele não é financiado por outra conta.
  add constraint entries_credit_bill_cash
    check (source <> 'credit_bill' or (credit_account_id is null and kind = 'expense' and is_settled));

create index entries_user_credit_idx
  on public.entries (user_id, credit_account_id)
  where credit_account_id is not null;

comment on column public.entries.credit_account_id is
  'Cartão/empréstimo de onde veio o dinheiro. Saída financiada não sai do saldo: sai a fatura.';
comment on column public.entries.charge_first_due_on is
  'Quando a dívida é paga: vencimento da 1ª cobrança (as demais, mês a mês).';
comment on column public.entries.charge_count is
  'Em quantas cobranças mensais a dívida é paga (empréstimo parcelado, parcelamento da fatura).';
comment on column public.entries.interest_cents is
  'Valor a pagar − valor; no pagamento da fatura, o que passou do total calculado. Vira "Juros e encargos".';

-- 3. Parcelamento e conta fixa no cartão ----------------------------------------------------

alter table public.installment_plans
  add column credit_account_id uuid,
  add constraint installment_plans_credit_account_fkey
    foreign key (credit_account_id, user_id)
    references public.credit_accounts (id, user_id) on delete restrict;

alter table public.recurring_rules
  add column credit_account_id uuid,
  add constraint recurring_rules_credit_account_fkey
    foreign key (credit_account_id, user_id)
    references public.credit_accounts (id, user_id) on delete restrict;

-- 4. Funções --------------------------------------------------------------------------------

-- O vencimento da primeira cobrança de um gasto feito em `p_on`. A MESMA regra de
-- `defaultFirstDue()` em lib/finance/credit.ts — escrita nos dois lados, como a chave de
-- ocorrência da 0009. Se divergirem, a conta fixa no cartão cai numa fatura no banco e noutra
-- na tela. `tests/unit/credit.test.ts` e o 01_rls_proof.sql conferem os mesmos casos.
--
-- Cartão: a fatura fecha no `closing_day` (ajustado ao fim do mês). Compra até o fechamento
-- entra nela; depois, na seguinte. Vence no `due_day` do mesmo mês do fechamento se o dia for
-- maior que o do fechamento, senão no mês seguinte — e nunca no próprio dia do fechamento.
-- Empréstimo: o vencimento único (se ainda não passou), ou o próximo `due_day` depois do gasto.
create function public.credit_first_due(
  p_kind        public.credit_account_kind,
  p_closing_day smallint,
  p_due_day     smallint,
  p_due_on      date,
  p_on          date
)
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_month   date;
  v_closing date;
  v_due     date;
begin
  if p_on is null then
    return null;
  end if;

  if p_kind = 'card' then
    if p_closing_day is null or p_due_day is null then
      return null;
    end if;

    v_month := date_trunc('month', p_on)::date;
    v_closing := v_month + (least(p_closing_day,
      extract(day from (v_month + interval '1 month - 1 day'))::int) - 1);
    if p_on > v_closing then
      v_month := (v_month + interval '1 month')::date;
      v_closing := v_month + (least(p_closing_day,
        extract(day from (v_month + interval '1 month - 1 day'))::int) - 1);
    end if;

    if p_due_day <= p_closing_day then
      v_month := (v_month + interval '1 month')::date;
    end if;
    v_due := v_month + (least(p_due_day,
      extract(day from (v_month + interval '1 month - 1 day'))::int) - 1);

    -- Fevereiro com fechamento 30 e vencimento 31: os dois viram 28. Vence no mês seguinte.
    if v_due <= v_closing then
      v_month := (date_trunc('month', v_due) + interval '1 month')::date;
      v_due := v_month + (least(p_due_day,
        extract(day from (v_month + interval '1 month - 1 day'))::int) - 1);
    end if;

    return v_due;
  end if;

  if p_due_on is not null then
    return case when p_due_on >= p_on then p_due_on end;
  end if;

  if p_due_day is not null then
    v_month := date_trunc('month', p_on)::date;
    v_due := v_month + (least(p_due_day,
      extract(day from (v_month + interval '1 month - 1 day'))::int) - 1);
    if v_due <= p_on then
      v_month := (v_month + interval '1 month')::date;
      v_due := v_month + (least(p_due_day,
        extract(day from (v_month + interval '1 month - 1 day'))::int) - 1);
    end if;
    return v_due;
  end if;

  return null;
end;
$$;

revoke execute on function public.credit_first_due(public.credit_account_kind, smallint, smallint, date, date)
  from public, anon;
grant execute on function public.credit_first_due(public.credit_account_kind, smallint, smallint, date, date)
  to authenticated;

-- 4.1 Pagar a fatura ---------------------------------------------------------------------
--
-- O pagamento é um lançamento real: saída liquidada, `source = 'credit_bill'`,
-- `source_id` = a conta e `occurrence_key` = o vencimento pago (`YYYY-MM-DD`). Pagar a mesma
-- fatura de novo (o mínimo agora, o resto depois) ganha `YYYY-MM-DD:2`, `:3`… — o mesmo
-- desenho do aporte de meta (0019), porque `entries_generated_uniq` não aceita duas chaves
-- iguais. `occurred_on` é o dia do pagamento: é por ele que o saldo soma.
--
-- `p_interest_cents` é quanto deste pagamento passou do total calculado da fatura — os
-- juros do rotativo, IOF, anuidade. Quem calcula é a action, com `buildBills`; aqui ele só é
-- registrado, e as views o contam como "Juros e encargos".
--
-- Com `p_import_key`, a chave já usada devolve `null`: reimportar o extrato não paga duas
-- vezes (invariante 8).
create function public.pay_credit_bill(
  p_account_id      uuid,
  p_due_on          date,
  p_amount_cents    bigint,
  p_paid_on         date,
  p_interest_cents  bigint default 0,
  p_import_key      text default null,
  p_import_batch_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_account public.credit_accounts;
  v_base    text := to_char(p_due_on, 'YYYY-MM-DD');
  v_key     text;
  v_n       int := 1;
  v_id      uuid;
begin
  if v_user_id is null then
    raise exception 'Sem sessão' using errcode = 'insufficient_privilege';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Pagamento com valor não positivo' using errcode = 'check_violation';
  end if;

  if p_due_on is null or p_paid_on is null then
    raise exception 'Vencimento e data do pagamento são obrigatórios' using errcode = 'check_violation';
  end if;

  if p_interest_cents is null or p_interest_cents < 0 or p_interest_cents > p_amount_cents then
    raise exception 'Juros fora do intervalo (%)', p_interest_cents using errcode = 'check_violation';
  end if;

  -- Pela RLS: a conta de outra pessoa simplesmente não é encontrada.
  select * into v_account from public.credit_accounts where id = p_account_id;
  if not found then
    raise exception 'Cartão ou empréstimo não encontrado' using errcode = 'no_data_found';
  end if;

  if p_import_key is not null
     and exists (select 1 from public.entries where import_key = p_import_key) then
    return null;
  end if;

  v_key := v_base;
  while exists (
    select 1 from public.entries
     where source = 'credit_bill' and source_id = p_account_id and occurrence_key = v_key
  ) loop
    v_n := v_n + 1;
    v_key := v_base || ':' || v_n;
  end loop;

  insert into public.entries (
    user_id, kind, occurred_on, description, amount_cents, interest_cents,
    is_settled, settled_on, source, source_id, occurrence_key,
    import_key, import_batch_id
  )
  values (
    v_user_id, 'expense', p_paid_on,
    left(case when v_account.kind = 'card' then 'Fatura ' else 'Pagamento ' end
         || v_account.name || ' (' || to_char(p_due_on, 'DD/MM') || ')', 120),
    p_amount_cents, p_interest_cents,
    true, p_paid_on, 'credit_bill', p_account_id, v_key,
    p_import_key, p_import_batch_id
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    if p_import_key is not null then
      return null;
    end if;
    raise;
end;
$$;

revoke execute on function public.pay_credit_bill(uuid, date, bigint, date, bigint, text, uuid)
  from public, anon;
grant execute on function public.pay_credit_bill(uuid, date, bigint, date, bigint, text, uuid)
  to authenticated;

-- 4.2 Parcelar o restante da fatura -------------------------------------------------------
--
-- O restante vira uma dívida nova no próprio cartão: saída financiada com
-- `source = 'credit_carry'`, valor = o restante, `interest_cents` = total parcelado −
-- restante, cobrada em `p_installments` vezes a partir de `p_first_due_on`. O principal não
-- conta na competência (as compras já contaram); os juros contam.
--
-- `occurrence_key` = o vencimento de origem: a mesma fatura não é parcelada duas vezes
-- (idempotente, invariante 8). Desfazer é excluir o lançamento.
create function public.carry_credit_bill(
  p_account_id      uuid,
  p_due_on          date,
  p_remaining_cents bigint,
  p_total_cents     bigint,
  p_installments    smallint,
  p_first_due_on    date
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_account public.credit_accounts;
  v_id      uuid;
begin
  if v_user_id is null then
    raise exception 'Sem sessão' using errcode = 'insufficient_privilege';
  end if;

  if p_remaining_cents is null or p_remaining_cents <= 0 then
    raise exception 'Nada a parcelar' using errcode = 'check_violation';
  end if;

  if p_total_cents is null or p_total_cents < p_remaining_cents then
    raise exception 'O total parcelado não pode ser menor que o restante' using errcode = 'check_violation';
  end if;

  if p_installments is null or p_installments < 1 or p_installments > 360 then
    raise exception 'Número de parcelas inválido' using errcode = 'check_violation';
  end if;

  if p_first_due_on is null or p_first_due_on <= p_due_on then
    raise exception 'A primeira parcela vence depois da fatura parcelada' using errcode = 'check_violation';
  end if;

  select * into v_account from public.credit_accounts where id = p_account_id;
  if not found then
    raise exception 'Cartão ou empréstimo não encontrado' using errcode = 'no_data_found';
  end if;

  insert into public.entries (
    user_id, kind, occurred_on, description, amount_cents, interest_cents,
    is_settled, settled_on, source, source_id, occurrence_key,
    credit_account_id, charge_first_due_on, charge_count
  )
  values (
    v_user_id, 'expense', p_due_on,
    left('Parcelamento da fatura ' || v_account.name || ' (' || to_char(p_due_on, 'DD/MM') || ')', 120),
    p_remaining_cents, p_total_cents - p_remaining_cents,
    false, null, 'credit_carry', p_account_id, to_char(p_due_on, 'YYYY-MM-DD'),
    p_account_id, p_first_due_on, p_installments
  )
  on conflict (user_id, source, source_id, occurrence_key) where source <> 'manual'
  do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.carry_credit_bill(uuid, date, bigint, bigint, smallint, date)
  from public, anon;
grant execute on function public.carry_credit_bill(uuid, date, bigint, bigint, smallint, date)
  to authenticated;

-- 4.3 Parcelamento no cartão --------------------------------------------------------------
--
-- Mesma troca de assinatura da 0017: derrubar e recriar, uma assinatura só — duas
-- sobrecargas fazem o PostgREST recusar a chamada sem o parâmetro novo.
--
-- Com `p_credit_account_id`, cada parcela PENDENTE nasce financiada: `charge_first_due_on`
-- = o `charge_due_on` do item (calculado por `planInstallments` na tela), ou, sem ele, a
-- fatura em que a data da parcela cai. As já pagas (`p_paid_count`) nascem liquidadas e sem
-- cartão, como antes: são passado, e cobrá-las numa fatura antiga criaria uma fatura
-- vencida que nunca existiu.

drop function public.create_installment_plan(text, bigint, smallint, date, jsonb, uuid, smallint);

create function public.create_installment_plan(
  p_description        text,
  p_total_amount_cents bigint,
  p_installments_count smallint,
  p_first_due_on       date,
  -- [{ "number": "1", "amount_cents": 3334, "due_on": "2026-03-10", "description": "Sofá (1/3)",
  --    "charge_due_on": "2026-04-10" }, ...]   (charge_due_on é opcional)
  p_installments       jsonb,
  p_category_id        uuid default null,
  p_paid_count         smallint default 0,
  p_credit_account_id  uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_plan_id uuid;
  v_count   int;
  v_sum     bigint;
  v_account public.credit_accounts;
begin
  if v_user_id is null then
    raise exception 'Sem sessão' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(p_installments) <> 'array' then
    raise exception 'Parcelas em formato inválido' using errcode = 'invalid_parameter_value';
  end if;

  if p_paid_count is null or p_paid_count < 0 or p_paid_count >= p_installments_count then
    raise exception 'Parcelas já pagas deve ficar entre 0 e % (recebido %)',
      p_installments_count - 1, p_paid_count
      using errcode = 'check_violation';
  end if;

  if p_credit_account_id is not null then
    -- Pela RLS: o cartão de outra pessoa não é encontrado (e a FK composta barraria de novo).
    select * into v_account from public.credit_accounts where id = p_credit_account_id;
    if not found then
      raise exception 'Cartão não encontrado' using errcode = 'no_data_found';
    end if;
  end if;

  select count(*), coalesce(sum((item->>'amount_cents')::bigint), 0)
    into v_count, v_sum
    from jsonb_array_elements(p_installments) as item;

  if v_count <> p_installments_count then
    raise exception 'Esperadas % parcelas, recebidas %', p_installments_count, v_count
      using errcode = 'check_violation';
  end if;

  if v_sum <> p_total_amount_cents then
    raise exception 'A soma das parcelas (%) não bate com o total (%)', v_sum, p_total_amount_cents
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_installments) as item
     where (item->>'amount_cents')::bigint <= 0
  ) then
    raise exception 'Parcela com valor não positivo' using errcode = 'check_violation';
  end if;

  insert into public.installment_plans (
    user_id, description, category_id, total_amount_cents, installments_count, first_due_on,
    credit_account_id
  )
  values (
    v_user_id, p_description, p_category_id, p_total_amount_cents, p_installments_count,
    p_first_due_on, p_credit_account_id
  )
  returning id into v_plan_id;

  insert into public.entries (
    user_id, kind, occurred_on, description, amount_cents, category_id,
    is_settled, settled_on, source, source_id, occurrence_key,
    installment_number, installment_total,
    credit_account_id, charge_first_due_on
  )
  select
    v_user_id,
    'expense',
    (item->>'due_on')::date,
    item->>'description',
    (item->>'amount_cents')::bigint,
    p_category_id,
    (item->>'number')::int <= p_paid_count,
    case when (item->>'number')::int <= p_paid_count then (item->>'due_on')::date end,
    'installment',
    v_plan_id,
    item->>'number',
    (item->>'number')::smallint,
    p_installments_count,
    case when p_credit_account_id is not null and (item->>'number')::int > p_paid_count
         then p_credit_account_id end,
    case when p_credit_account_id is not null and (item->>'number')::int > p_paid_count
         then coalesce(
           (item->>'charge_due_on')::date,
           public.credit_first_due(v_account.kind, v_account.closing_day, v_account.due_day,
                                   v_account.due_on, (item->>'due_on')::date),
           (item->>'due_on')::date
         ) end
  from jsonb_array_elements(p_installments) as item;

  return v_plan_id;
end;
$$;

revoke execute on function public.create_installment_plan(text, bigint, smallint, date, jsonb, uuid, smallint, uuid)
  from public, anon;
grant execute on function public.create_installment_plan(text, bigint, smallint, date, jsonb, uuid, smallint, uuid)
  to authenticated;

-- Pôr (ou tirar) um parcelamento já cadastrado no cartão. Só as parcelas PENDENTES mudam:
-- as pagas já saíram do saldo e não podem entrar numa fatura. Uma função, e não um `update`
-- do cliente, porque cada parcela recebe o SEU vencimento — o que um `update` do supabase-js
-- não exprime (mesmo motivo da 0017).
create function public.set_installment_plan_credit(p_plan_id uuid, p_credit_account_id uuid)
returns int
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_plan    public.installment_plans;
  v_account public.credit_accounts;
  v_changed int;
begin
  select * into v_plan from public.installment_plans where id = p_plan_id;
  if not found then
    raise exception 'Parcelamento não encontrado' using errcode = 'no_data_found';
  end if;

  if p_credit_account_id is not null then
    select * into v_account from public.credit_accounts where id = p_credit_account_id;
    if not found then
      raise exception 'Cartão não encontrado' using errcode = 'no_data_found';
    end if;
  end if;

  update public.installment_plans
     set credit_account_id = p_credit_account_id
   where id = p_plan_id;

  with mudadas as (
    update public.entries
       set credit_account_id   = p_credit_account_id,
           charge_first_due_on = case when p_credit_account_id is not null then coalesce(
             public.credit_first_due(v_account.kind, v_account.closing_day, v_account.due_day,
                                     v_account.due_on, occurred_on),
             occurred_on) end,
           charge_count  = 1,
           interest_cents = 0
     where source = 'installment'
       and source_id = p_plan_id
       and not is_settled
    returning 1
  )
  select count(*) into v_changed from mudadas;

  return v_changed;
end;
$$;

revoke execute on function public.set_installment_plan_credit(uuid, uuid) from public, anon;
grant execute on function public.set_installment_plan_credit(uuid, uuid) to authenticated;

-- "Quantas já foram pagas?" não vale para parcelamento no cartão: ali quem paga é a fatura.
-- Mesma assinatura, `create or replace`; o resto é a 0017 sem mudança.
create or replace function public.set_installments_paid(p_plan_id uuid, p_paid_count smallint)
returns int
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_plan    public.installment_plans;
  v_changed int;
begin
  select * into v_plan from public.installment_plans where id = p_plan_id;

  if not found then
    raise exception 'Parcelamento não encontrado' using errcode = 'no_data_found';
  end if;

  if v_plan.credit_account_id is not null then
    raise exception 'Parcelamento no cartão é pago pela fatura' using errcode = 'check_violation';
  end if;

  if p_paid_count is null or p_paid_count < 0 or p_paid_count > v_plan.installments_count then
    raise exception 'Parcelas pagas deve ficar entre 0 e % (recebido %)',
      v_plan.installments_count, p_paid_count
      using errcode = 'check_violation';
  end if;

  with mudadas as (
    update public.entries
       set is_settled = installment_number <= p_paid_count,
           settled_on = case
             when installment_number <= p_paid_count then coalesce(settled_on, occurred_on)
           end
     where source = 'installment'
       and source_id = p_plan_id
       and is_settled is distinct from (installment_number <= p_paid_count)
    returning 1
  )
  select count(*) into v_changed from mudadas;

  return v_changed;
end;
$$;

-- 4.4 Conta fixa no cartão ----------------------------------------------------------------
--
-- Mesma assinatura da 0009, `create or replace`. Se a regra está num cartão, a ocorrência
-- nasce financiada e ABERTA (a fatura a conclui), com a primeira cobrança na fatura em que a
-- data cai — pela mesma `credit_first_due` que a tela usa.
create or replace function public.materialize_recurring_occurrence(
  p_rule_id uuid,
  p_occurs_on date,
  p_settled boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rule    public.recurring_rules;
  v_account public.credit_accounts;
  v_key     text;
  v_id      uuid;
  v_settled boolean := p_settled;
  v_due     date;
begin
  select * into v_rule from public.recurring_rules where id = p_rule_id;

  if not found then
    raise exception 'Conta fixa não encontrada' using errcode = 'no_data_found';
  end if;

  if not v_rule.is_active then
    raise exception 'Conta fixa desativada' using errcode = 'check_violation';
  end if;

  if p_occurs_on < v_rule.starts_on
     or (v_rule.ends_on is not null and p_occurs_on > v_rule.ends_on) then
    raise exception 'Data fora da vigência da conta fixa' using errcode = 'check_violation';
  end if;

  v_key := case
    when v_rule.frequency = 'monthly' then to_char(p_occurs_on, 'YYYY-MM')
    else to_char(p_occurs_on, 'YYYY-MM-DD')
  end;

  if v_rule.credit_account_id is not null then
    select * into v_account from public.credit_accounts where id = v_rule.credit_account_id;
    if not found then
      raise exception 'Cartão da conta fixa não encontrado' using errcode = 'no_data_found';
    end if;
    v_due := coalesce(
      public.credit_first_due(v_account.kind, v_account.closing_day, v_account.due_day,
                              v_account.due_on, p_occurs_on),
      p_occurs_on);
    if v_rule.kind = 'expense' then
      v_settled := false;
    end if;
  end if;

  insert into public.entries (
    user_id, kind, occurred_on, description, amount_cents, category_id,
    is_settled, settled_on, source, source_id, occurrence_key,
    credit_account_id, charge_first_due_on
  )
  values (
    v_rule.user_id,
    v_rule.kind,
    p_occurs_on,
    v_rule.description,
    v_rule.amount_cents,
    v_rule.category_id,
    v_settled,
    case when v_settled then p_occurs_on else null end,
    'recurring',
    v_rule.id,
    v_key,
    v_rule.credit_account_id,
    v_due
  )
  on conflict (user_id, source, source_id, occurrence_key) where source <> 'manual'
  do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- 4.5 O extrato não liquida o que foi pago no cartão ----------------------------------------
--
-- Mesma assinatura da 0019, `create or replace`. Duas guardas novas, a terceira barreira
-- (as outras duas: o candidato nem é carregado em lib/db/queries/reconcile.ts, e o casamento
-- sem palavra-chave não o alcança):
--
-- - `entry`: lançamento financiado, pagamento de fatura e parcelamento de fatura não são
--   liquidados por linha do extrato. Quem paga a compra no cartão é a fatura, e a fatura se
--   paga por `pay_credit_bill`.
-- - `recurring`: conta fixa no cartão não é paga pelo extrato — ela entra na fatura.
create or replace function public.reconcile_import_row(
  p_target          text,
  p_target_id       uuid,
  p_due_on          date,
  p_occurred_on     date,
  p_kind            public.entry_kind,
  p_amount_cents    bigint,
  p_import_key      text,
  p_import_batch_id uuid default null,
  p_notes           text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rule    public.recurring_rules;
  v_entry   public.entries;
  v_key     text;
  v_id      uuid;
begin
  if v_user_id is null then
    raise exception 'Sem sessão' using errcode = 'insufficient_privilege';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor não positivo' using errcode = 'check_violation';
  end if;

  if p_import_key is null or p_import_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Chave de importação inválida' using errcode = 'invalid_parameter_value';
  end if;

  if exists (select 1 from public.entries where import_key = p_import_key) then
    return null;
  end if;

  if p_target = 'goal' then
    if p_kind <> 'expense' then
      return null;
    end if;
    return public.record_goal_contribution(
      p_target_id, p_amount_cents, p_occurred_on, null, p_import_key, p_import_batch_id
    );
  end if;

  if p_target = 'entry' then
    select * into v_entry from public.entries where id = p_target_id for update;
    if not found
       or v_entry.is_settled
       or v_entry.import_key is not null
       or v_entry.kind <> p_kind
       or v_entry.source in ('goal', 'credit_bill', 'credit_carry')
       or v_entry.credit_account_id is not null then
      return null;
    end if;

    update public.entries
       set is_settled   = true,
           settled_on   = p_occurred_on,
           occurred_on  = p_occurred_on,
           amount_cents = case when source = 'installment' then amount_cents else p_amount_cents end,
           import_key   = p_import_key,
           notes        = coalesce(notes, p_notes)
     where id = p_target_id
    returning id into v_id;

    return v_id;
  end if;

  if p_target = 'recurring' then
    select * into v_rule from public.recurring_rules where id = p_target_id;
    if not found
       or not v_rule.is_active
       or v_rule.kind <> p_kind
       or v_rule.credit_account_id is not null then
      return null;
    end if;

    if p_due_on is null
       or p_due_on < v_rule.starts_on
       or (v_rule.ends_on is not null and p_due_on > v_rule.ends_on) then
      return null;
    end if;

    v_key := case
      when v_rule.frequency = 'monthly' then to_char(p_due_on, 'YYYY-MM')
      else to_char(p_due_on, 'YYYY-MM-DD')
    end;

    select * into v_entry from public.entries
     where source = 'recurring' and source_id = v_rule.id and occurrence_key = v_key
     for update;

    if found then
      if v_entry.is_settled or v_entry.import_key is not null
         or v_entry.credit_account_id is not null then
        return null;
      end if;

      update public.entries
         set is_settled   = true,
             settled_on   = p_occurred_on,
             occurred_on  = p_occurred_on,
             amount_cents = p_amount_cents,
             import_key   = p_import_key,
             notes        = coalesce(notes, p_notes)
       where id = v_entry.id
      returning id into v_id;

      return v_id;
    end if;

    insert into public.entries (
      user_id, kind, occurred_on, description, amount_cents, category_id, notes,
      is_settled, settled_on, source, source_id, occurrence_key,
      import_key, import_batch_id
    )
    values (
      v_user_id, v_rule.kind, p_occurred_on, v_rule.description, p_amount_cents,
      v_rule.category_id, p_notes, true, p_occurred_on, 'recurring', v_rule.id, v_key,
      p_import_key, p_import_batch_id
    )
    on conflict (user_id, source, source_id, occurrence_key) where source <> 'manual'
    do nothing
    returning id into v_id;

    return v_id;
  end if;

  raise exception 'Alvo desconhecido: %', p_target using errcode = 'invalid_parameter_value';
exception
  when unique_violation then
    return null;
end;
$$;

-- 5. Views de competência -------------------------------------------------------------------
--
-- `create or replace` com as MESMAS colunas, na mesma ordem e tipo (a regra do Postgres para
-- trocar uma view no lugar). A regra, a mesma de `competenceCents()` em lib/finance/credit.ts:
--
-- - não conta o principal do pagamento de fatura (`credit_bill`) nem do parcelamento de
--   fatura (`credit_carry`): as compras que eles pagam já contaram, cada uma na sua categoria;
-- - não conta como renda o dinheiro que VEIO de cartão ou empréstimo: é dívida, não renda;
-- - conta `interest_cents` de qualquer lançamento como saída — os juros são o custo de verdade.

create or replace view public.v_monthly_summary
with (security_invoker = on) as
select
  user_id,
  date_trunc('month', occurred_on)::date as month,
  coalesce(sum(amount_cents) filter (where kind = 'income' and counts), 0) as income_cents,
  coalesce(sum(amount_cents) filter (where kind = 'expense' and counts), 0)
    + coalesce(sum(interest_cents), 0) as expense_cents,
  coalesce(sum(amount_cents) filter (where kind = 'income' and counts), 0)
    - coalesce(sum(amount_cents) filter (where kind = 'expense' and counts), 0)
    - coalesce(sum(interest_cents), 0) as net_cents
from (
  select
    e.*,
    (e.source not in ('credit_bill', 'credit_carry')
     and not (e.credit_account_id is not null and e.kind = 'income')) as counts
  from public.entries e
) as e
group by user_id, date_trunc('month', occurred_on);

create or replace view public.v_category_breakdown
with (security_invoker = on) as
select
  e.user_id,
  date_trunc('month', e.occurred_on)::date as month,
  e.category_id,
  c.name  as category_name,
  c.color as category_color,
  e.kind,
  sum(e.amount_cents) as total_cents
from public.entries e
left join public.categories c on c.id = e.category_id
where e.source not in ('credit_bill', 'credit_carry')
  and not (e.credit_account_id is not null and e.kind = 'income')
group by e.user_id, date_trunc('month', e.occurred_on), e.category_id, c.name, c.color, e.kind;

create or replace view public.v_source_breakdown
with (security_invoker = on) as
select
  user_id,
  date_trunc('month', occurred_on)::date as month,
  kind,
  source,
  sum(amount_cents) as total_cents,
  count(*) as entry_count
from public.entries
where source not in ('credit_bill', 'credit_carry')
  and not (credit_account_id is not null and kind = 'income')
group by user_id, date_trunc('month', occurred_on), kind, source;

-- "Juros e encargos" por mês: uma categoria virtual, somada à tela em lib/db/queries/summary.ts.
create view public.v_interest_by_month
with (security_invoker = on) as
select
  user_id,
  date_trunc('month', occurred_on)::date as month,
  sum(interest_cents) as interest_cents
from public.entries
where interest_cents > 0
group by user_id, date_trunc('month', occurred_on);

-- O progresso do parcelamento ganha a conta no fim (a única mudança permitida por
-- `create or replace view`). No cartão as parcelas nunca ficam liquidadas — quem as conclui
-- é a fatura —, e a tela conta as pagas pelas faturas pagas (lib/db/queries/installments.ts).
create or replace view public.v_installment_progress
with (security_invoker = on) as
select
  p.id as plan_id,
  p.user_id,
  p.description,
  p.total_amount_cents,
  p.installments_count,
  count(e.id) filter (where e.is_settled) as paid_count,
  coalesce(sum(e.amount_cents) filter (where not e.is_settled), 0) as remaining_cents,
  min(e.occurred_on) filter (where not e.is_settled) as next_due_on,
  p.credit_account_id
from public.installment_plans p
left join public.entries e
  on e.source = 'installment'
 and e.source_id = p.id
 and e.user_id = p.user_id
group by p.id, p.user_id, p.description, p.total_amount_cents, p.installments_count,
         p.credit_account_id;
