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
--
-- As concessões vivem em 00_shim.sql, ANTES das migrations, para que a 0008
-- possa revogá-las. Reconcedê-las aqui desfaria a correção e faria a asserção
-- de escalada passar por engano.

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

-- === Convite por código: uso único e expiração ===
-- O resgate reivindica o convite com um UPDATE condicional. Estas asserções
-- provam que a condição segura de fato: o segundo resgate não pega nada, e um
-- código expirado não é reivindicável.
do $$
declare
  admin_id uuid := '11111111-1111-1111-1111-111111111111';
  claimed uuid;
  n int;
begin
  -- Convite válido.
  insert into public.invites (code_hash, label, invited_by, expires_at)
  values ('hash-valido', 'para a Ana', admin_id, now() + interval '7 days');

  -- Primeiro resgate: pega.
  update public.invites
     set status = 'accepted', accepted_at = now()
   where code_hash = 'hash-valido' and status = 'pending' and expires_at > now()
  returning id into claimed;
  if claimed is null then raise exception 'primeiro resgate deveria ter reivindicado o convite'; end if;

  -- Segundo resgate do mesmo código: não pega nada.
  update public.invites
     set status = 'accepted', accepted_at = now()
   where code_hash = 'hash-valido' and status = 'pending' and expires_at > now();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'uso único falhou: o mesmo código foi resgatado % vezes a mais', n; end if;

  -- Código expirado: não pega nada.
  insert into public.invites (code_hash, label, invited_by, expires_at)
  values ('hash-expirado', 'vencido', admin_id, now() - interval '1 day');

  update public.invites
     set status = 'accepted', accepted_at = now()
   where code_hash = 'hash-expirado' and status = 'pending' and expires_at > now();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'código expirado foi resgatado'; end if;

  -- Código revogado: não pega nada.
  insert into public.invites (code_hash, label, invited_by, status, expires_at)
  values ('hash-revogado', 'revogado', admin_id, 'revoked', now() + interval '7 days');

  update public.invites
     set status = 'accepted', accepted_at = now()
   where code_hash = 'hash-revogado' and status = 'pending' and expires_at > now();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'código revogado foi resgatado'; end if;
end $$;

-- Dois convites não podem compartilhar o mesmo hash.
do $$
begin
  insert into public.invites (code_hash, invited_by, expires_at)
  values ('hash-valido', '11111111-1111-1111-1111-111111111111', now() + interval '7 days');
  raise exception 'invites_code_hash_uniq falhou: hash duplicado foi aceito';
exception
  when unique_violation then null;  -- esperado
end $$;

-- === Convites são invisíveis para quem não é admin ===
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';  -- Bruno, member

do $$
declare n int;
begin
  select count(*) into n from public.invites;
  if n <> 0 then raise exception 'usuário comum leu % convite(s)', n; end if;

  begin
    insert into public.invites (code_hash, invited_by, expires_at)
    values ('forjado', '22222222-2222-2222-2222-222222222222', now() + interval '7 days');
    raise exception 'usuário comum conseguiu criar convite';
  exception
    when insufficient_privilege then null;  -- esperado
  end;
end $$;

reset role;

-- === Escalada de privilégio em profiles.role ===
-- A policy deixa o usuário editar a PRÓPRIA linha. Sem privilégio por coluna,
-- isso incluía `role`, e qualquer pessoa logada virava admin sozinha. Estas
-- asserções falham se a migration 0008 for removida.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';  -- Bruno, member

do $$
declare papel app_role;
begin
  -- Tentativa de promoção: tem de ser barrada pelo privilégio de coluna.
  begin
    update public.profiles set role = 'admin'
     where id = '22222222-2222-2222-2222-222222222222';
    raise exception 'ESCALADA: member conseguiu se promover a admin';
  exception
    when insufficient_privilege then null;  -- esperado
  end;

  -- E nada de promover outra pessoa, nem por tabela inteira.
  begin
    update public.profiles set role = 'admin';
    raise exception 'ESCALADA: member conseguiu promover alguém';
  exception
    when insufficient_privilege then null;  -- esperado
  end;

  select role into papel from public.profiles
   where id = '22222222-2222-2222-2222-222222222222';
  if papel <> 'member' then raise exception 'Bruno deveria continuar member, está %', papel; end if;
end $$;

-- O grant não pode ter travado demais: o que é do usuário continua editável.
do $$
declare nome text;
begin
  update public.profiles set display_name = 'Bruno Editado'
   where id = '22222222-2222-2222-2222-222222222222';

  select display_name into nome from public.profiles
   where id = '22222222-2222-2222-2222-222222222222';
  if nome <> 'Bruno Editado' then
    raise exception 'member deveria conseguir editar o próprio display_name';
  end if;

  update public.profiles set opening_balance_cents = 50000
   where id = '22222222-2222-2222-2222-222222222222';
end $$;

reset role;

-- === Promoção do primeiro usuário ===
-- Ana foi a primeira conta criada neste teste, então nasceu admin; Bruno, não.
-- É o que substitui o UPDATE separado da aplicação, que falhou em produção e
-- deixou o sistema sem nenhum administrador.
do $$
declare papel_ana app_role; papel_bruno app_role; n int;
begin
  select role into papel_ana from public.profiles
   where id = '11111111-1111-1111-1111-111111111111';
  if papel_ana <> 'admin' then
    raise exception 'a primeira conta deveria nascer admin, nasceu %', papel_ana;
  end if;

  select role into papel_bruno from public.profiles
   where id = '22222222-2222-2222-2222-222222222222';
  if papel_bruno <> 'member' then
    raise exception 'a segunda conta deveria nascer member, nasceu %', papel_bruno;
  end if;

  select count(*) into n from public.profiles where role = 'admin';
  if n <> 1 then raise exception 'deveria existir exatamente 1 admin, existem %', n; end if;
end $$;

select 'TODAS AS ASSERÇÕES DE RLS E CONSTRAINTS PASSARAM' as resultado;
