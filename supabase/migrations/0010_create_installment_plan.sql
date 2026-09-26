-- Criação de um parcelamento: o plano e as N parcelas, numa transação só.
--
-- Diferente da conta fixa, a parcela **não** é expandida na leitura: as N
-- parcelas viram lançamentos reais no ato da criação, porque a dívida já existe
-- inteira no momento da compra. É o que faz "parcelas pagas" ser uma contagem
-- de linhas liquidadas (invariante 7) em vez de um contador mutável, que era
-- como o app antigo perdia a conta.
--
-- Por que isto é uma função, e não duas chamadas do cliente:
--
-- Gravar o plano e gravar as parcelas são duas escritas, e o supabase-js não
-- tem transação. Se a segunda falhasse, sobraria um plano sem parcela nenhuma —
-- visível na tela, somando zero, impossível de explicar. Aqui ou as N+1 linhas
-- entram, ou nenhuma entra.
--
-- Por que o rateio vem pronto do cliente:
--
-- `splitCents()` em lib/finance/money.ts é a única implementação do rateio, e
-- tem property test provando que a soma das partes bate com o total. Reescrevê-la
-- em SQL criaria uma segunda fonte da verdade para a mesma aritmética — o erro
-- que o `occurrence_key` da 0009 evita repetindo a regra de propósito em dois
-- lugares pequenos e testados dos dois lados. Aqui a conta é grande demais para
-- isso, então o cliente calcula e **o banco confere**: se a soma das parcelas
-- não for exatamente o total, nada entra.
--
-- `security invoker`: as duas inserções passam pelo `with check` das policies,
-- então a função não cria um caminho que a RLS não vigie.

create function public.create_installment_plan(
  p_description        text,
  p_total_amount_cents bigint,
  p_installments_count smallint,
  p_first_due_on       date,
  -- [{ "number": "1", "amount_cents": 3334, "due_on": "2026-03-10", "description": "Sofá (1/3)" }, ...]
  p_installments       jsonb,
  -- Por último e com default: parcelamento sem categoria é caso normal, e um
  -- parâmetro opcional é como o gerador de tipos consegue exprimir "pode ser
  -- nulo" — sem isso o TypeScript gerado exigiria uma string sempre.
  p_category_id        uuid default null
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
begin
  if v_user_id is null then
    raise exception 'Sem sessão' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(p_installments) <> 'array' then
    raise exception 'Parcelas em formato inválido' using errcode = 'invalid_parameter_value';
  end if;

  select count(*), coalesce(sum((item->>'amount_cents')::bigint), 0)
    into v_count, v_sum
    from jsonb_array_elements(p_installments) as item;

  if v_count <> p_installments_count then
    raise exception 'Esperadas % parcelas, recebidas %', p_installments_count, v_count
      using errcode = 'check_violation';
  end if;

  -- A invariante do rateio, conferida no banco: a soma das parcelas é o total,
  -- centavo a centavo. No app antigo 100,00 em 3x virava 33,33 três vezes e um
  -- centavo sumia — aqui isso não chega a ser gravado.
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
    user_id, description, category_id, total_amount_cents, installments_count, first_due_on
  )
  values (
    v_user_id, p_description, p_category_id, p_total_amount_cents, p_installments_count,
    p_first_due_on
  )
  returning id into v_plan_id;

  -- Todas nascem pendentes: a compra foi feita, mas as parcelas ainda vão sair
  -- da conta uma a uma. Elas entram na agenda como qualquer pendente, e o saldo
  -- só cai quando cada uma é liquidada.
  insert into public.entries (
    user_id, kind, occurred_on, description, amount_cents, category_id,
    is_settled, settled_on, source, source_id, occurrence_key,
    installment_number, installment_total
  )
  select
    v_user_id,
    'expense',
    (item->>'due_on')::date,
    item->>'description',
    (item->>'amount_cents')::bigint,
    p_category_id,
    false,
    null,
    'installment',
    v_plan_id,
    item->>'number',
    (item->>'number')::smallint,
    p_installments_count
  from jsonb_array_elements(p_installments) as item;

  return v_plan_id;
end;
$$;

revoke execute on function public.create_installment_plan(text, bigint, smallint, date, jsonb, uuid)
  from public, anon;
grant execute on function public.create_installment_plan(text, bigint, smallint, date, jsonb, uuid)
  to authenticated;

-- Exclusão de um parcelamento.
--
-- Apaga o plano e as parcelas **ainda não pagas**. As já liquidadas continuam:
-- são história, e removê-las mudaria o saldo de meses fechados. É a mesma regra
-- da conta fixa na 0009, pelo mesmo motivo.
--
-- Transacional pela mesma razão da criação: apagar o plano e deixar as parcelas
-- órfãs seria pior que não apagar nada.

create function public.delete_installment_plan(p_plan_id uuid)
returns int
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_plan    public.installment_plans;
  v_deleted int;
begin
  select * into v_plan from public.installment_plans where id = p_plan_id;

  if not found then
    raise exception 'Parcelamento não encontrado' using errcode = 'no_data_found';
  end if;

  with removidas as (
    delete from public.entries
     where source = 'installment'
       and source_id = p_plan_id
       and not is_settled
    returning 1
  )
  select count(*) into v_deleted from removidas;

  delete from public.installment_plans where id = p_plan_id;

  -- Quantas parcelas pendentes foram removidas, para a tela dizer o que houve.
  return v_deleted;
end;
$$;

revoke execute on function public.delete_installment_plan(uuid) from public, anon;
grant execute on function public.delete_installment_plan(uuid) to authenticated;
