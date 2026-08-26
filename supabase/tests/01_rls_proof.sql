-- Prova de isolamento por RLS com dois usuários reais.
-- Roda como um papel sem BYPASSRLS, alternando o "usuário logado" via GUC,
-- que é o que a função auth.uid() do shim lê.

\set ON_ERROR_STOP on

-- Dois usuários. O trigger handle_new_user cria perfil e categorias-semente.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@exemplo.com'),
  ('22222222-2222-2222-2222-222222222222', 'bruno@exemplo.com');

-- O trigger semeou 9 categorias de despesa + 2 de renda para cada um.
do $$
declare n int;
begin
  select count(*) into n from public.categories
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 11 then raise exception 'Ana deveria ter 11 categorias-semente, tem %', n; end if;

  select count(*) into n from public.profiles;
  if n <> 2 then raise exception 'Deveriam existir 2 perfis, existem %', n; end if;
end $$;

-- Um lançamento para cada.
insert into public.entries (user_id, kind, occurred_on, description, amount_cents)
values
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-01-05', 'Mercado da Ana', 15000),
  ('22222222-2222-2222-2222-222222222222', 'expense', '2026-01-06', 'Mercado do Bruno', 25000);

-- A partir daqui, sem privilégio de dono e sem BYPASSRLS.
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function auth.uid() to authenticated;

set role authenticated;

-- === Ana enxerga só o dela ===
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare n int; d text;
begin
  select count(*) into n from public.entries;
  if n <> 1 then raise exception 'Ana deveria ver 1 lançamento, viu %', n; end if;

  select description into d from public.entries;
  if d <> 'Mercado da Ana' then raise exception 'Ana viu lançamento alheio: %', d; end if;

  select count(*) into n from public.categories;
  if n <> 11 then raise exception 'Ana deveria ver 11 categorias, viu %', n; end if;

  -- invites é só para admin, e Ana é member.
  select count(*) into n from public.invites;
  if n <> 0 then raise exception 'Ana não é admin e não deveria ler convites'; end if;
end $$;

-- Ana não consegue apagar o lançamento do Bruno.
do $$
declare n int;
begin
  delete from public.entries where description = 'Mercado do Bruno';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS falhou: Ana apagou % linha(s) do Bruno', n; end if;
end $$;

-- Nem gravar em nome dele.
do $$
begin
  insert into public.entries (user_id, kind, occurred_on, description, amount_cents)
  values ('22222222-2222-2222-2222-222222222222', 'expense', '2026-01-07', 'Forjado', 100);
  raise exception 'RLS falhou: Ana inseriu lançamento em nome do Bruno';
exception
  when insufficient_privilege then null;  -- esperado
end $$;

-- === Bruno enxerga só o dele ===
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare n int; d text;
begin
  select count(*) into n from public.entries;
  if n <> 1 then raise exception 'Bruno deveria ver 1 lançamento, viu %', n; end if;

  select description into d from public.entries;
  if d <> 'Mercado do Bruno' then raise exception 'Bruno viu lançamento alheio: %', d; end if;
end $$;

-- === Sem sessão, ninguém vê nada ===
set request.jwt.claim.sub = '';

do $$
declare n int;
begin
  select count(*) into n from public.entries;
  if n <> 0 then raise exception 'Sem sessão deveriam aparecer 0 lançamentos, apareceram %', n; end if;
end $$;

reset role;

-- === Idempotência da ocorrência gerada ===
-- Marcar o mesmo custo fixo como pago duas vezes não pode criar dois débitos.
do $$
declare rule_id uuid := gen_random_uuid();
begin
  insert into public.entries
    (user_id, kind, occurred_on, description, amount_cents, source, source_id, occurrence_key)
  values
    ('11111111-1111-1111-1111-111111111111', 'expense', '2026-01-10', 'Aluguel', 100000,
     'recurring', rule_id, '2026-01');

  begin
    insert into public.entries
      (user_id, kind, occurred_on, description, amount_cents, source, source_id, occurrence_key)
    values
      ('11111111-1111-1111-1111-111111111111', 'expense', '2026-01-10', 'Aluguel', 100000,
       'recurring', rule_id, '2026-01');
    raise exception 'entries_generated_uniq falhou: ocorrência duplicada foi aceita';
  exception
    when unique_violation then null;  -- esperado
  end;
end $$;

-- === Um cenário ativo por usuário ===
do $$
begin
  insert into public.scenarios (user_id, name, starts_on, ends_on, is_active)
  values ('11111111-1111-1111-1111-111111111111', 'Cenário A', '2026-01-01', '2026-06-30', true);

  begin
    insert into public.scenarios (user_id, name, starts_on, ends_on, is_active)
    values ('11111111-1111-1111-1111-111111111111', 'Cenário B', '2026-01-01', '2026-06-30', true);
    raise exception 'scenarios_one_active_idx falhou: dois cenários ativos foram aceitos';
  exception
    when unique_violation then null;  -- esperado
  end;
end $$;

-- === Um único override "vale para todas" por alvo ===
-- NULL não colide em índice único no Postgres; por isso o índice usa
-- coalesce(occurrence_key, '').
do $$
declare scn uuid; target uuid := gen_random_uuid();
begin
  select id into scn from public.scenarios
   where user_id = '11111111-1111-1111-1111-111111111111' limit 1;

  insert into public.scenario_overrides
    (scenario_id, user_id, target_type, target_id, occurrence_key, is_included)
  values (scn, '11111111-1111-1111-1111-111111111111', 'recurring_rule', target, null, false);

  begin
    insert into public.scenario_overrides
      (scenario_id, user_id, target_type, target_id, occurrence_key, is_included)
    values (scn, '11111111-1111-1111-1111-111111111111', 'recurring_rule', target, null, true);
    raise exception 'scenario_overrides_target_uniq falhou com occurrence_key nulo';
  exception
    when unique_violation then null;  -- esperado
  end;
end $$;

-- === Constraints de dinheiro e data ===
do $$
begin
  begin
    insert into public.entries (user_id, kind, occurred_on, description, amount_cents)
    values ('11111111-1111-1111-1111-111111111111', 'expense', '2026-01-05', 'Zero', 0);
    raise exception 'check amount_cents > 0 não foi aplicado';
  exception when check_violation then null;
  end;

  begin
    insert into public.entries (user_id, kind, occurred_on, description, amount_cents, is_settled)
    values ('11111111-1111-1111-1111-111111111111', 'expense', '2026-01-05', 'Pago sem data', 100, true);
    raise exception 'check is_settled exige settled_on não foi aplicado';
  exception when check_violation then null;
  end;
end $$;

select 'TODAS AS ASSERÇÕES DE RLS E CONSTRAINTS PASSARAM' as resultado;
