-- Materialização idempotente de uma ocorrência de conta fixa.
--
-- Por que isto precisa ser uma função no banco, e não um `upsert` do cliente:
--
-- A invariante 8 do CLAUDE.md manda usar upsert sobre `entries_generated_uniq`.
-- Esse índice é PARCIAL (`where source <> 'manual'`), e o Postgres só consegue
-- inferir um índice parcial num `on conflict` se a cláusula repetir o mesmo
-- predicado. O `upsert()` do supabase-js não emite esse `where` — mandaria
-- `on conflict (colunas) do update` e o Postgres recusaria com 42P10.
--
-- Ou seja: do jeito que o schema está, a invariante 8 não é expressável a partir
-- do cliente. Ela mora aqui.
--
-- `security invoker` (o padrão, escrito por clareza): a função NÃO é uma porta
-- lateral. O `select` sobre `recurring_rules` passa pela RLS, então a regra de
-- outro usuário simplesmente não é encontrada; e o `insert` em `entries` ainda
-- enfrenta o `with check (user_id = auth.uid())` da policy. Dois cadeados para o
-- mesmo portão, de propósito.

create function public.materialize_recurring_occurrence(
  p_rule_id uuid,
  p_occurs_on date,
  p_settled boolean default true
)
returns uuid
language plpgsql
security invoker
-- `search_path` fixo, como em `is_admin()`: evita sequestro por schema temporário.
set search_path = public, pg_temp
as $$
declare
  v_rule public.recurring_rules;
  v_key  text;
  v_id   uuid;
begin
  select * into v_rule from public.recurring_rules where id = p_rule_id;

  if not found then
    raise exception 'Conta fixa não encontrada' using errcode = 'no_data_found';
  end if;

  if not v_rule.is_active then
    raise exception 'Conta fixa desativada' using errcode = 'check_violation';
  end if;

  -- Fora da vigência não existe ocorrência para materializar. Sem esta checagem
  -- daria para gravar a parcela de um mês em que a regra nem valia.
  if p_occurs_on < v_rule.starts_on
     or (v_rule.ends_on is not null and p_occurs_on > v_rule.ends_on) then
    raise exception 'Data fora da vigência da conta fixa' using errcode = 'check_violation';
  end if;

  -- A mesma chave que `recurrenceOccurrenceKey()` produz em
  -- lib/finance/recurrence.ts. Se as duas divergirem, a deduplicação para de
  -- funcionar e a ocorrência aparece duas vezes — por isso está escrita nos dois
  -- lados com a mesma regra: mês para mensal, dia para o resto.
  v_key := case
    when v_rule.frequency = 'monthly' then to_char(p_occurs_on, 'YYYY-MM')
    else to_char(p_occurs_on, 'YYYY-MM-DD')
  end;

  insert into public.entries (
    user_id, kind, occurred_on, description, amount_cents, category_id,
    is_settled, settled_on, source, source_id, occurrence_key
  )
  values (
    v_rule.user_id,
    v_rule.kind,
    p_occurs_on,
    v_rule.description,
    v_rule.amount_cents,
    v_rule.category_id,
    p_settled,
    -- A constraint `entries_settled_needs_date` exige a data quando liquidado.
    case when p_settled then p_occurs_on else null end,
    'recurring',
    v_rule.id,
    v_key
  )
  on conflict (user_id, source, source_id, occurrence_key) where source <> 'manual'
  do nothing
  returning id into v_id;

  -- `null` quando a ocorrência já existia. É assim que a action distingue
  -- "liquidei agora" de "já estava liquidado" sem tratar erro como fluxo normal.
  return v_id;
end;
$$;

revoke execute on function public.materialize_recurring_occurrence(uuid, date, boolean)
  from public, anon;
grant execute on function public.materialize_recurring_occurrence(uuid, date, boolean)
  to authenticated;
