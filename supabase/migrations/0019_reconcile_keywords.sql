-- Fase 12 — palavras-chave que conectam o extrato ao que já foi cadastrado, e aporte de meta
-- como saída.
--
-- v1.0 — 2026-09-27. As migrations 0001–0018 já rodaram no projeto real e são imutáveis
-- (invariante 16); o que falta vira migration nova.
--
-- O problema: o que a pessoa cadastra no [+] (avulso pendente, conta fixa, renda fixa,
-- parcela, meta) fica pendente até ela marcar à mão. Quando o extrato é importado, a mesma
-- movimentação entrava como lançamento NOVO — o salário continuava "pendente" e aparecia de
-- novo como "Pix recebido de Empresa X", e o saldo contava as duas coisas.
--
-- Quatro peças:
--
-- 1. `keywords` em `entries`, `recurring_rules`, `installment_plans` e `goals` — as palavras
--    que, no texto do extrato, identificam aquele item. A parcela usa a do PLANO: copiar para
--    cada parcela duplicaria o dado (invariante 6). Mesmo teto da 0018.
--
-- 2. `goal_contributions.entry_id` com `on delete cascade` e único. O aporte registrado pelo
--    [+] é uma SAÍDA (o dinheiro saiu da conta corrente) amarrada ao aporte da meta — a coluna
--    existia desde a 0003 "para amarrar os dois quando fizer sentido". Excluir a saída leva o
--    aporte junto, e um trigger mantém valor e data do aporte iguais aos da saída: o banco
--    garante, não o código. O progresso continua sendo `SUM(goal_contributions)`
--    (invariante 7).
--
-- 3. `record_goal_contribution` — saída + aporte numa transação.
--
-- 4. `reconcile_import_row` — conecta uma linha do extrato a um item pendente: liquida o que
--    existe em vez de criar outro. A `import_key` vai para a linha conectada, e é isso que faz
--    reimportar o mesmo extrato não criar nada (a chave já está lá, 0016).
--
-- Nenhum grant de coluna muda: nenhuma destas tabelas tem privilégio por coluna (ver 0008
-- para a que tem). A RLS da 0005 já cobre as colunas novas — é a mesma linha, o mesmo dono.

-- 1. Palavras-chave ---------------------------------------------------------------------

alter table public.entries
  add column keywords text[] not null default '{}'
  constraint entries_keywords_size check (
    cardinality(keywords) <= 30 and length(array_to_string(keywords, '')) <= 1200
  );

alter table public.recurring_rules
  add column keywords text[] not null default '{}'
  constraint recurring_rules_keywords_size check (
    cardinality(keywords) <= 30 and length(array_to_string(keywords, '')) <= 1200
  );

alter table public.installment_plans
  add column keywords text[] not null default '{}'
  constraint installment_plans_keywords_size check (
    cardinality(keywords) <= 30 and length(array_to_string(keywords, '')) <= 1200
  );

alter table public.goals
  add column keywords text[] not null default '{}'
  constraint goals_keywords_size check (
    cardinality(keywords) <= 30 and length(array_to_string(keywords, '')) <= 1200
  );

comment on column public.entries.keywords is
  'Palavras que, no texto do extrato, identificam este lançamento pendente (lib/finance/reconcile.ts).';
comment on column public.recurring_rules.keywords is
  'Palavras que, no texto do extrato, liquidam a ocorrência desta conta/renda fixa.';
comment on column public.installment_plans.keywords is
  'Palavras que, no texto do extrato, liquidam uma parcela deste plano. As parcelas não copiam.';
comment on column public.goals.keywords is
  'Palavras que, no texto do extrato, registram um aporte nesta meta.';

-- 2. Aporte amarrado à saída ------------------------------------------------------------

alter table public.goal_contributions
  drop constraint goal_contributions_entry_id_fkey,
  add constraint goal_contributions_entry_id_fkey
    foreign key (entry_id) references public.entries (id) on delete cascade;

-- Uma saída é um aporte só. Parcial: aporte sem saída (resgate, aporte antigo) é o normal.
create unique index goal_contributions_entry_uniq
  on public.goal_contributions (entry_id)
  where entry_id is not null;

-- Editar valor ou data da saída no Histórico muda o aporte junto. Sem isto, a meta mostraria
-- um valor guardado que a conta corrente nunca viu. `security invoker` (o padrão): o update
-- passa pela RLS de `goal_contributions`, e só alcança o aporte do próprio dono.
create function public.sync_goal_contribution()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.goal_contributions
     set amount_cents = new.amount_cents,
         occurred_on  = new.occurred_on
   where entry_id = new.id
     and (amount_cents <> new.amount_cents or occurred_on <> new.occurred_on);
  return null;
end;
$$;

create trigger sync_goal_contribution
  after update of amount_cents, occurred_on on public.entries
  for each row
  when (new.source = 'goal')
  execute function public.sync_goal_contribution();

-- 3. Aporte como saída ------------------------------------------------------------------
--
-- A saída tem `source = 'goal'`, `source_id` = a meta e `occurrence_key` = o mês
-- (`YYYY-MM`) — a mesma chave que `expandGoal` (lib/finance/goals.ts) põe no aporte previsto
-- (`goal:<id>:<YYYY-MM>`). É o que faz `dedupeAgainstEntries` descartar o previsto do mês
-- quando o real acontece. Um segundo aporte no mesmo mês ganha `YYYY-MM:2`, `YYYY-MM:3`… —
-- o índice `entries_generated_uniq` não aceitaria dois `YYYY-MM`.
--
-- Com `p_import_key`, a chave já usada devolve `null` em vez de erro: reimportar o extrato
-- não cria aporte novo (invariante 8).

create function public.record_goal_contribution(
  p_goal_id         uuid,
  p_amount_cents    bigint,
  p_occurred_on     date,
  p_note            text default null,
  p_import_key      text default null,
  p_import_batch_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id  uuid := (select auth.uid());
  v_goal     public.goals;
  v_month    text := to_char(p_occurred_on, 'YYYY-MM');
  v_key      text;
  v_n        int := 1;
  v_entry_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sem sessão' using errcode = 'insufficient_privilege';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Aporte com valor não positivo' using errcode = 'check_violation';
  end if;

  -- Pela RLS: a meta de outra pessoa simplesmente não é encontrada.
  select * into v_goal from public.goals where id = p_goal_id;
  if not found then
    raise exception 'Meta não encontrada' using errcode = 'no_data_found';
  end if;
  if v_goal.archived_at is not null then
    raise exception 'Meta arquivada' using errcode = 'check_violation';
  end if;

  if p_import_key is not null
     and exists (select 1 from public.entries where import_key = p_import_key) then
    return null;
  end if;

  v_key := v_month;
  while exists (
    select 1 from public.entries
     where source = 'goal' and source_id = p_goal_id and occurrence_key = v_key
  ) loop
    v_n := v_n + 1;
    v_key := v_month || ':' || v_n;
  end loop;

  insert into public.entries (
    user_id, kind, occurred_on, description, amount_cents, notes,
    is_settled, settled_on, source, source_id, occurrence_key,
    import_key, import_batch_id
  )
  values (
    v_user_id, 'expense', p_occurred_on, left('Meta: ' || v_goal.name, 120), p_amount_cents,
    p_note, true, p_occurred_on, 'goal', p_goal_id, v_key,
    p_import_key, p_import_batch_id
  )
  returning id into v_entry_id;

  insert into public.goal_contributions (goal_id, user_id, amount_cents, occurred_on, entry_id, note)
  values (p_goal_id, v_user_id, p_amount_cents, p_occurred_on, v_entry_id, left(p_note, 200));

  return v_entry_id;
exception
  -- Duas abas importando o mesmo extrato ao mesmo tempo: a segunda perde a corrida pela
  -- `import_key` e não grava nada — o mesmo resultado de chegar depois.
  when unique_violation then
    if p_import_key is not null then
      return null;
    end if;
    raise;
end;
$$;

revoke execute on function public.record_goal_contribution(uuid, bigint, date, text, text, uuid)
  from public, anon;
grant execute on function public.record_goal_contribution(uuid, bigint, date, text, text, uuid)
  to authenticated;

-- 4. Conectar a linha do extrato ao item cadastrado --------------------------------------
--
-- Três alvos, uma função, uma transação por linha:
--
-- - `entry`: lançamento pendente (avulso digitado, parcela, ocorrência já materializada de
--   conta fixa). Vira liquidado na data do extrato e recebe a `import_key`. O valor passa a
--   ser o do extrato — é o que aconteceu —, **exceto na parcela**: a soma das parcelas é o
--   total do plano (invariante 1), e mexer numa quebraria a conta. A tela avisa a diferença.
--   Não recebe `import_batch_id`: é um item que a pessoa cadastrou, e "excluir esta
--   importação" em Ver todos não pode apagar uma parcela ou um lançamento digitado.
-- - `recurring`: a ocorrência de `p_due_on` da conta/renda fixa. Nasce liquidada (ou, se já
--   estava materializada pendente, é liquidada), com o valor do extrato. A chave de
--   ocorrência sai de `p_due_on` pela regra da 0009 — mês para mensal, dia para o resto — e
--   não da data do extrato: o salário do dia 31 pago no dia 30 continua sendo o de outubro.
--   Criada pela importação, leva o `import_batch_id`: desfazer a importação devolve a
--   ocorrência a "prevista".
-- - `goal`: um aporte, por `record_goal_contribution`.
--
-- `occurred_on` vira a data do extrato nos três casos. O saldo (`lib/db/queries/balance.ts`)
-- soma por `occurred_on`: deixar a data de vencimento faria uma conta vencida no dia 5 e paga
-- no dia 7 cair antes de uma âncora de saldo do dia 6, e sair do saldo.
--
-- Devolve o id do lançamento conectado, ou `null` quando o alvo já não está pendente (outra
-- aba liquidou, a pessoa marcou à mão, a chave já foi usada). A action então grava a linha
-- como lançamento novo, que é o comportamento de antes desta migration.

create function public.reconcile_import_row(
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

  -- A mesma linha do extrato já está em algum lançamento: nada a fazer.
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
    -- `for update`: duas abas conectando a mesma pendência — a segunda espera e encontra
    -- a linha já liquidada.
    select * into v_entry from public.entries where id = p_target_id for update;
    if not found
       or v_entry.is_settled
       or v_entry.import_key is not null
       or v_entry.kind <> p_kind
       or v_entry.source = 'goal' then
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
    if not found or not v_rule.is_active or v_rule.kind <> p_kind then
      return null;
    end if;

    if p_due_on is null
       or p_due_on < v_rule.starts_on
       or (v_rule.ends_on is not null and p_due_on > v_rule.ends_on) then
      return null;
    end if;

    -- A mesma regra de `recurrenceOccurrenceKey()` e da 0009.
    v_key := case
      when v_rule.frequency = 'monthly' then to_char(p_due_on, 'YYYY-MM')
      else to_char(p_due_on, 'YYYY-MM-DD')
    end;

    select * into v_entry from public.entries
     where source = 'recurring' and source_id = v_rule.id and occurrence_key = v_key
     for update;

    if found then
      if v_entry.is_settled or v_entry.import_key is not null then
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
    -- A `import_key` chegou antes por outra aba: o mesmo que "já conectado".
    return null;
end;
$$;

revoke execute on function public.reconcile_import_row(text, uuid, date, date, public.entry_kind, bigint, text, uuid, text)
  from public, anon;
grant execute on function public.reconcile_import_row(text, uuid, date, date, public.entry_kind, bigint, text, uuid, text)
  to authenticated;
