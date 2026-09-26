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

-- === Materialização de conta fixa (migration 0009) ===
--
-- É a invariante 8 provada no banco, e não só no teste de unidade: marcar a
-- mesma ocorrência duas vezes não pode gerar dois lançamentos. No app antigo
-- gerava, e o mês fechava com o aluguel cobrado em dobro.

insert into public.recurring_rules
  (id, user_id, kind, description, amount_cents, frequency, day_of_month, starts_on)
values
  ('aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'expense', 'Aluguel da Ana', 180000, 'monthly', 10, '2026-01-01'),
  ('bbbbbbbb-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222',
   'expense', 'Aluguel do Bruno', 150000, 'monthly', 5, '2026-01-01');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare id1 uuid; id2 uuid; n int;
begin
  -- Primeira materialização: cria a linha e devolve o id.
  id1 := public.materialize_recurring_occurrence(
    'aaaaaaaa-0000-0000-0000-000000000001', '2026-03-10', true);
  if id1 is null then raise exception 'a primeira materialização deveria criar a linha'; end if;

  -- Segunda, mesma ocorrência: não cria nada e devolve null.
  id2 := public.materialize_recurring_occurrence(
    'aaaaaaaa-0000-0000-0000-000000000001', '2026-03-10', true);
  if id2 is not null then
    raise exception 'materializar de novo deveria ser no-op, devolveu %', id2;
  end if;

  -- Outro dia do MESMO mês também é a mesma ocorrência: a chave é o mês.
  id2 := public.materialize_recurring_occurrence(
    'aaaaaaaa-0000-0000-0000-000000000001', '2026-03-25', true);
  if id2 is not null then
    raise exception 'outro dia do mesmo mês deveria ser a mesma ocorrência';
  end if;

  select count(*) into n from public.entries
   where source = 'recurring' and source_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'deveria existir 1 ocorrência materializada, existem %', n; end if;

  -- Mês seguinte é outra ocorrência, e essa entra.
  id2 := public.materialize_recurring_occurrence(
    'aaaaaaaa-0000-0000-0000-000000000001', '2026-04-10', true);
  if id2 is null then raise exception 'abril deveria ser uma ocorrência nova'; end if;

  -- A linha gerada tem de sair liquidada e com a data de competência.
  select count(*) into n from public.entries
   where source = 'recurring'
     and source_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and is_settled and settled_on = occurred_on;
  if n <> 2 then raise exception 'as 2 ocorrências deveriam estar liquidadas, % estão', n; end if;
end $$;

-- Ana não materializa a conta fixa do Bruno: a função é `security invoker`, e a
-- RLS de recurring_rules faz o select não achar a linha.
do $$
declare id1 uuid;
begin
  id1 := public.materialize_recurring_occurrence(
    'bbbbbbbb-0000-0000-0000-000000000002', '2026-03-05', true);
  raise exception 'VAZAMENTO: Ana materializou a conta fixa do Bruno';
exception
  when no_data_found then null;  -- esperado
end $$;

-- Fora da vigência não existe ocorrência.
do $$
declare id1 uuid;
begin
  id1 := public.materialize_recurring_occurrence(
    'aaaaaaaa-0000-0000-0000-000000000001', '2025-12-10', true);
  raise exception 'deveria recusar data anterior a starts_on';
exception
  when check_violation then null;  -- esperado
end $$;

-- Regra desativada não materializa.
reset role;
update public.recurring_rules set is_active = false
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare id1 uuid;
begin
  id1 := public.materialize_recurring_occurrence(
    'aaaaaaaa-0000-0000-0000-000000000001', '2026-05-10', true);
  raise exception 'regra inativa não deveria materializar';
exception
  when check_violation then null;  -- esperado
end $$;

reset role;
update public.recurring_rules set is_active = true
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- anon não executa a função.
set role anon;
do $$
declare id1 uuid;
begin
  id1 := public.materialize_recurring_occurrence(
    'aaaaaaaa-0000-0000-0000-000000000001', '2026-06-10', true);
  raise exception 'ESCALADA: anon executou materialize_recurring_occurrence';
exception
  when insufficient_privilege then null;  -- esperado
end $$;

reset role;

-- === Parcelamentos (migration 0010) ===
--
-- Duas garantias que só existem porque a criação é uma função: a soma das
-- parcelas bate com o total centavo a centavo, e ou tudo entra ou nada entra.

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare plano uuid; n int; soma bigint; pendentes int;
begin
  -- R$ 100,00 em 3x: 33,34 + 33,33 + 33,33. O app antigo gravava 33,33 três
  -- vezes e perdia um centavo.
  plano := public.create_installment_plan(
    p_description => 'Sofá', p_total_amount_cents => 10000,
    p_installments_count => 3::smallint, p_first_due_on => '2026-03-10',
    p_installments =>
    '[{"number":"1","amount_cents":3334,"due_on":"2026-03-10","description":"Sofá (1/3)"},
      {"number":"2","amount_cents":3333,"due_on":"2026-04-10","description":"Sofá (2/3)"},
      {"number":"3","amount_cents":3333,"due_on":"2026-05-10","description":"Sofá (3/3)"}]'::jsonb
  );
  if plano is null then raise exception 'o plano deveria ter sido criado'; end if;

  select count(*), sum(amount_cents) into n, soma from public.entries
   where source = 'installment' and source_id = plano;
  if n <> 3 then raise exception 'deveriam existir 3 parcelas, existem %', n; end if;
  if soma <> 10000 then raise exception 'a soma deveria ser 10000, é %', soma; end if;

  -- Todas nascem pendentes: a compra foi feita, mas o dinheiro ainda não saiu.
  select count(*) into pendentes from public.entries
   where source = 'installment' and source_id = plano and not is_settled;
  if pendentes <> 3 then raise exception 'as 3 parcelas deveriam nascer pendentes'; end if;

  -- E numeradas, para a view de progresso contar certo.
  select count(*) into n from public.entries
   where source = 'installment' and source_id = plano
     and installment_number between 1 and 3 and installment_total = 3;
  if n <> 3 then raise exception 'as parcelas deveriam estar numeradas 1..3'; end if;
end $$;

-- Soma que não bate com o total é recusada, e NADA entra.
do $$
declare plano uuid; planos_antes int; planos_depois int;
begin
  select count(*) into planos_antes from public.installment_plans;

  begin
    plano := public.create_installment_plan(
      p_description => 'Errado', p_total_amount_cents => 10000,
      p_installments_count => 3::smallint, p_first_due_on => '2026-03-10',
      p_installments =>
      '[{"number":"1","amount_cents":3333,"due_on":"2026-03-10","description":"a"},
        {"number":"2","amount_cents":3333,"due_on":"2026-04-10","description":"b"},
        {"number":"3","amount_cents":3333,"due_on":"2026-05-10","description":"c"}]'::jsonb
    );
    raise exception 'rateio que perde um centavo deveria ser recusado';
  exception
    when check_violation then null;  -- esperado
  end;

  -- A atomicidade: o plano não pode ter sobrado sem as parcelas.
  select count(*) into planos_depois from public.installment_plans;
  if planos_depois <> planos_antes then
    raise exception 'plano órfão gravado: antes %, depois %', planos_antes, planos_depois;
  end if;
end $$;

-- Atomicidade de verdade: falhar DEPOIS de gravar o plano.
--
-- A asserção acima recusa antes de escrever qualquer coisa, então ela prova
-- validação, não rollback. Aqui a soma bate e a contagem bate — o plano é
-- gravado — e só então uma parcela sem data viola o `not null` de
-- `occurred_on`. Se a função não fosse transacional, sobraria um plano sem
-- parcela nenhuma, somando zero na tela.
do $$
declare plano uuid; planos_antes int; planos_depois int;
begin
  select count(*) into planos_antes from public.installment_plans;

  begin
    plano := public.create_installment_plan(
      p_description => 'Sem data', p_total_amount_cents => 6666,
      p_installments_count => 2::smallint, p_first_due_on => '2026-03-10',
      p_installments =>
      '[{"number":"1","amount_cents":3333,"due_on":"2026-03-10","description":"a"},
        {"number":"2","amount_cents":3333,"due_on":null,"description":"b"}]'::jsonb
    );
    raise exception 'parcela sem data deveria falhar';
  exception
    when not_null_violation then null;  -- esperado
  end;

  select count(*) into planos_depois from public.installment_plans;
  if planos_depois <> planos_antes then
    raise exception 'PLANO ÓRFÃO: a função não é transacional (antes %, depois %)',
      planos_antes, planos_depois;
  end if;
end $$;

-- Quantidade divergente também é recusada.
do $$
declare plano uuid;
begin
  plano := public.create_installment_plan(
    p_description => 'Errado', p_total_amount_cents => 6666,
    p_installments_count => 3::smallint, p_first_due_on => '2026-03-10',
    p_installments =>
    '[{"number":"1","amount_cents":3333,"due_on":"2026-03-10","description":"a"},
      {"number":"2","amount_cents":3333,"due_on":"2026-04-10","description":"b"}]'::jsonb
  );
  raise exception 'contagem divergente deveria ser recusada';
exception
  when check_violation then null;  -- esperado
end $$;

-- Excluir mantém o que já foi pago e remove o que está pendente.
do $$
declare plano uuid; removidas int; restantes int; liquidadas int;
begin
  plano := public.create_installment_plan(
    p_description => 'Geladeira', p_total_amount_cents => 30000,
    p_installments_count => 3::smallint, p_first_due_on => '2026-06-10',
    p_installments =>
    '[{"number":"1","amount_cents":10000,"due_on":"2026-06-10","description":"Geladeira (1/3)"},
      {"number":"2","amount_cents":10000,"due_on":"2026-07-10","description":"Geladeira (2/3)"},
      {"number":"3","amount_cents":10000,"due_on":"2026-08-10","description":"Geladeira (3/3)"}]'::jsonb
  );

  update public.entries set is_settled = true, settled_on = occurred_on
   where source = 'installment' and source_id = plano and installment_number = 1;

  removidas := public.delete_installment_plan(plano);
  if removidas <> 2 then raise exception 'deveriam sair 2 parcelas pendentes, saíram %', removidas; end if;

  select count(*) into restantes from public.entries
   where source = 'installment' and source_id = plano;
  select count(*) into liquidadas from public.entries
   where source = 'installment' and source_id = plano and is_settled;

  if restantes <> 1 or liquidadas <> 1 then
    raise exception 'a parcela já paga deveria continuar no extrato (restantes %, liquidadas %)',
      restantes, liquidadas;
  end if;

  if exists (select 1 from public.installment_plans where id = plano) then
    raise exception 'o plano deveria ter sido excluído';
  end if;
end $$;

-- Ana não exclui o parcelamento do Bruno.
reset role;
insert into public.installment_plans
  (id, user_id, description, total_amount_cents, installments_count, first_due_on)
values
  ('cccccccc-0000-0000-0000-000000000003',
   '22222222-2222-2222-2222-222222222222', 'Notebook do Bruno', 50000, 5::smallint, '2026-03-01');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare removidas int;
begin
  removidas := public.delete_installment_plan('cccccccc-0000-0000-0000-000000000003');
  raise exception 'VAZAMENTO: Ana excluiu o parcelamento do Bruno';
exception
  when no_data_found then null;  -- esperado
end $$;

-- anon não executa nenhuma das duas.
set role anon;
do $$
declare plano uuid;
begin
  plano := public.create_installment_plan(
    p_description => 'x', p_total_amount_cents => 100, p_installments_count => 1::smallint,
    p_first_due_on => '2026-03-10',
    p_installments => '[{"number":"1","amount_cents":100,"due_on":"2026-03-10","description":"x"}]'::jsonb);
  raise exception 'ESCALADA: anon executou create_installment_plan';
exception
  when insufficient_privilege then null;  -- esperado
end $$;

reset role;

select 'TODAS AS ASSERÇÕES DE RLS E CONSTRAINTS PASSARAM' as resultado;
