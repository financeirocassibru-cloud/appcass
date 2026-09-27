-- v1.0 — 2026-09-27: parcelamento cadastrado já em andamento.
--
-- Quem cadastra uma compra feita há meses já pagou parte das parcelas. Sem isto, a pessoa
-- teria de criar o plano e depois marcar as primeiras como pagas uma a uma — e, pelo
-- caminho do app, cada uma ganharia `settled_on = hoje`, e não a data em que foi paga.
--
-- Por que na função, e não num `update` depois dela:
--
-- 1. `settled_on` de cada parcela é a data dela. Um `update` do supabase-js grava o mesmo
--    valor em todas as linhas; "cada uma com a sua data" não se exprime por ele.
-- 2. Se o `update` falhasse depois da criação, sobraria um plano com as pagas marcadas como
--    pendentes — a agenda cobraria de novo o que já saiu da conta. Aqui tudo entra junto, ou
--    nada entra, como a 0010 já garantia para plano e parcelas.
--
-- A 0010 não é editada (migrations aplicadas são imutáveis, invariante 16). Esta derruba a
-- assinatura antiga e cria a nova com `p_paid_count default 0`: quem chama sem o parâmetro
-- continua recebendo exatamente o comportamento anterior, então aplicar esta migration antes
-- de publicar o código novo não quebra nada.
--
-- Uma assinatura só, e não uma sobrecarga ao lado da antiga: com as duas, uma chamada sem
-- `p_paid_count` casaria com ambas, e o PostgREST recusa com "could not choose the best
-- candidate function".

drop function public.create_installment_plan(text, bigint, smallint, date, jsonb, uuid);

create function public.create_installment_plan(
  p_description        text,
  p_total_amount_cents bigint,
  p_installments_count smallint,
  p_first_due_on       date,
  -- [{ "number": "1", "amount_cents": 3334, "due_on": "2026-03-10", "description": "Sofá (1/3)" }, ...]
  p_installments       jsonb,
  p_category_id        uuid default null,
  -- Quantas parcelas, a partir da primeira, já foram pagas. Nascem liquidadas na data de
  -- vencimento de cada uma.
  p_paid_count         smallint default 0
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

  -- Todas pagas não é um parcelamento em andamento, é uma compra encerrada; e pelo menos uma
  -- pendente é o que faz o plano aparecer na agenda.
  if p_paid_count is null or p_paid_count < 0 or p_paid_count >= p_installments_count then
    raise exception 'Parcelas já pagas deve ficar entre 0 e % (recebido %)',
      p_installments_count - 1, p_paid_count
      using errcode = 'check_violation';
  end if;

  select count(*), coalesce(sum((item->>'amount_cents')::bigint), 0)
    into v_count, v_sum
    from jsonb_array_elements(p_installments) as item;

  if v_count <> p_installments_count then
    raise exception 'Esperadas % parcelas, recebidas %', p_installments_count, v_count
      using errcode = 'check_violation';
  end if;

  -- A invariante do rateio, conferida no banco (ver 0010).
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

  -- As `p_paid_count` primeiras nascem liquidadas, cada uma na própria data; o resto nasce
  -- pendente e entra na agenda como qualquer pendente.
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
    (item->>'number')::int <= p_paid_count,
    case when (item->>'number')::int <= p_paid_count then (item->>'due_on')::date end,
    'installment',
    v_plan_id,
    item->>'number',
    (item->>'number')::smallint,
    p_installments_count
  from jsonb_array_elements(p_installments) as item;

  return v_plan_id;
end;
$$;

revoke execute on function public.create_installment_plan(text, bigint, smallint, date, jsonb, uuid, smallint)
  from public, anon;
grant execute on function public.create_installment_plan(text, bigint, smallint, date, jsonb, uuid, smallint)
  to authenticated;
