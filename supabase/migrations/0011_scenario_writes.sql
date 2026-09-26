-- Escritas de cenário que o cliente não consegue fazer com segurança.
--
-- Duas operações, pelo mesmo motivo das migrations 0009 e 0010: o supabase-js
-- não alcança a garantia que o schema já expressa.

-- ---------------------------------------------------------------------------
-- 1. Gravar um override.
--
-- `scenario_overrides_target_uniq` é um índice sobre EXPRESSÃO:
--
--   (scenario_id, target_type, target_id, coalesce(occurrence_key, ''))
--
-- O `coalesce` está lá porque NULL não colide com NULL num índice único, e sem
-- ele existiriam vários overrides "vale para todas as ocorrências" do mesmo
-- alvo, disputando entre si. Mas o `upsert()` do supabase-js só sabe listar
-- colunas — não consegue nomear a expressão, e portanto não infere o índice.
--
-- Aqui o `on conflict` repete a expressão e o upsert funciona: gravar o mesmo
-- override duas vezes atualiza, não duplica.
create function public.set_scenario_override(
  p_scenario_id    uuid,
  p_target_type    override_target,
  p_target_id      uuid,
  p_occurrence_key text default null,
  p_is_included    boolean default true,
  p_amount_cents   bigint default null,
  p_date_override  date default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_id      uuid;
begin
  -- A RLS de scenarios decide se este cenário é visível. Como a função é
  -- `security invoker`, o cenário de outra pessoa simplesmente não é
  -- encontrado.
  select user_id into v_user_id from public.scenarios where id = p_scenario_id;

  if not found then
    raise exception 'Cenário não encontrado' using errcode = 'no_data_found';
  end if;

  insert into public.scenario_overrides (
    scenario_id, user_id, target_type, target_id, occurrence_key,
    is_included, amount_cents_override, date_override
  )
  values (
    p_scenario_id, v_user_id, p_target_type, p_target_id, p_occurrence_key,
    p_is_included, p_amount_cents, p_date_override
  )
  on conflict (scenario_id, target_type, target_id, coalesce(occurrence_key, ''))
  do update set
    is_included           = excluded.is_included,
    amount_cents_override = excluded.amount_cents_override,
    date_override         = excluded.date_override
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.set_scenario_override(
  uuid, override_target, uuid, text, boolean, bigint, date
) from public, anon;
grant execute on function public.set_scenario_override(
  uuid, override_target, uuid, text, boolean, bigint, date
) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Ativar um cenário.
--
-- `scenarios_one_active_idx` garante no máximo um ativo por usuário. Trocar de
-- cenário significa desativar o anterior e ativar o novo — duas escritas que
-- precisam acontecer juntas.
--
-- O app antigo fazia isso em `await` sequenciais no cliente, e uma falha no
-- meio deixava dois ativos (é o que o comentário da migration 0004 registra).
-- Um `update` único do tipo `set is_active = (id = $1)` também não serve: o
-- índice é verificado linha a linha durante o comando, então a ordem em que as
-- linhas forem atualizadas pode violar a unicidade no meio do caminho.
--
-- Aqui são dois comandos numa transação: desativa todos, ativa um.
create function public.activate_scenario(p_scenario_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.scenarios where id = p_scenario_id;

  if not found then
    raise exception 'Cenário não encontrado' using errcode = 'no_data_found';
  end if;

  update public.scenarios set is_active = false
   where user_id = v_user_id and is_active;

  update public.scenarios set is_active = true
   where id = p_scenario_id;
end;
$$;

revoke execute on function public.activate_scenario(uuid) from public, anon;
grant execute on function public.activate_scenario(uuid) to authenticated;
