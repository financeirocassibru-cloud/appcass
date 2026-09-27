-- Prova de isolamento por RLS com dois usuários reais.
-- v1.1 — 2026-09-27: asserções da import_key (migration 0016) no fim.
-- v1.2 — 2026-09-27: parcelamento em andamento (migration 0017) no fim.
-- v1.3 — 2026-09-27: `set_installments_paid` (migration 0017) no fim.
-- v1.4 — 2026-09-27: palavras-chave, lote de importação e período da Análise (migration 0018) no fim.
-- v1.5 — 2026-09-27: conexão do extrato ao que foi cadastrado e aporte como saída (migration 0019) no fim.
-- v1.6 — 2026-09-27: cartões e empréstimos (migrations 0020/0021) no fim.
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

-- === Âncora do saldo informada, mesmo zerada (migration 0015) — 2026-09-27 ===
-- "Nunca informou" e "informou zero" tinham a mesma cara (`opening_balance_cents = 0`),
-- e o convite para informar o saldo não sumia nunca para quem não tem nada na conta.
do $$
begin
  update public.profiles set opening_balance_set_at = null
   where id = '22222222-2222-2222-2222-222222222222';
  raise exception 'member conseguiu escrever opening_balance_set_at direto';
exception
  when insufficient_privilege then null;  -- esperado: só o trigger escreve a coluna
end $$;

do $$
declare marcado timestamptz;
begin
  update public.profiles set opening_balance_cents = 0
   where id = '22222222-2222-2222-2222-222222222222';

  select opening_balance_set_at into marcado from public.profiles
   where id = '22222222-2222-2222-2222-222222222222';
  if marcado is null then
    raise exception 'salvar saldo zero deveria marcar opening_balance_set_at';
  end if;
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

-- === Cenários (migration 0011) ===
--
-- O critério de pronto da fase 5 no ROADMAP: alterar um override muda a
-- projeção sem escrever em nenhuma tabela de dado real. É o que separa este
-- app do antigo, onde `syncPlanToGlobal` sobrescrevia o lançamento verdadeiro
-- quando se editava um valor dentro do planejamento.

reset role;
insert into public.scenarios (id, user_id, name, starts_on, ends_on)
values
  ('dddddddd-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'E se eu trocar de carro', '2026-03-01', '2026-12-31'),
  ('eeeeeeee-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', 'Ano apertado', '2026-03-01', '2026-12-31'),
  ('ffffffff-0000-0000-0000-000000000003',
   '22222222-2222-2222-2222-222222222222', 'Cenário do Bruno', '2026-03-01', '2026-12-31');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- Gravar o mesmo override duas vezes atualiza, não duplica.
do $$
declare id1 uuid; id2 uuid; n int; valor bigint;
begin
  id1 := public.set_scenario_override(
    p_scenario_id => 'dddddddd-0000-0000-0000-000000000001',
    p_target_type => 'recurring_rule',
    p_target_id   => 'aaaaaaaa-0000-0000-0000-000000000001',
    p_occurrence_key => '2026-06',
    p_amount_cents   => 250000
  );

  id2 := public.set_scenario_override(
    p_scenario_id => 'dddddddd-0000-0000-0000-000000000001',
    p_target_type => 'recurring_rule',
    p_target_id   => 'aaaaaaaa-0000-0000-0000-000000000001',
    p_occurrence_key => '2026-06',
    p_amount_cents   => 300000
  );

  if id1 <> id2 then raise exception 'o segundo override deveria atualizar o primeiro'; end if;

  select count(*), max(amount_cents_override) into n, valor
    from public.scenario_overrides
   where scenario_id = 'dddddddd-0000-0000-0000-000000000001';

  if n <> 1 then raise exception 'deveria existir 1 override, existem %', n; end if;
  if valor <> 300000 then raise exception 'o valor deveria ser 300000, é %', valor; end if;
end $$;

-- NULL em occurrence_key vale para todas as ocorrências, e é um override só.
-- Sem o `coalesce` no índice, NULL não colidiria com NULL e daria para criar
-- vários "vale para todas" disputando entre si.
do $$
declare id1 uuid; id2 uuid; n int;
begin
  id1 := public.set_scenario_override(
    p_scenario_id => 'dddddddd-0000-0000-0000-000000000001',
    p_target_type => 'recurring_rule',
    p_target_id   => 'aaaaaaaa-0000-0000-0000-000000000001',
    p_is_included => false
  );
  id2 := public.set_scenario_override(
    p_scenario_id => 'dddddddd-0000-0000-0000-000000000001',
    p_target_type => 'recurring_rule',
    p_target_id   => 'aaaaaaaa-0000-0000-0000-000000000001',
    p_is_included => false
  );

  if id1 <> id2 then raise exception 'o override sem chave deveria ser único por alvo'; end if;

  select count(*) into n from public.scenario_overrides
   where scenario_id = 'dddddddd-0000-0000-0000-000000000001'
     and occurrence_key is null;
  if n <> 1 then raise exception 'deveria existir 1 override sem chave, existem %', n; end if;
end $$;

-- O CRITÉRIO DA FASE 5: nada de dado real foi tocado.
do $$
declare
  entries_antes int; regras_antes int; planos_antes int;
  entries_depois int; regras_depois int; planos_depois int;
  soma_antes bigint; soma_depois bigint;
begin
  select count(*), coalesce(sum(amount_cents), 0) into entries_antes, soma_antes
    from public.entries;
  select count(*) into regras_antes from public.recurring_rules;
  select count(*) into planos_antes from public.installment_plans;

  perform public.set_scenario_override(
    p_scenario_id => 'dddddddd-0000-0000-0000-000000000001',
    p_target_type => 'entry',
    p_target_id   => 'aaaaaaaa-0000-0000-0000-000000000001',
    p_occurrence_key => '2026-07',
    p_amount_cents   => 999999,
    p_date_override  => '2026-07-28'
  );

  select count(*), coalesce(sum(amount_cents), 0) into entries_depois, soma_depois
    from public.entries;
  select count(*) into regras_depois from public.recurring_rules;
  select count(*) into planos_depois from public.installment_plans;

  if entries_antes <> entries_depois or soma_antes <> soma_depois then
    raise exception 'VAZAMENTO: o override mexeu em entries (% -> %, soma % -> %)',
      entries_antes, entries_depois, soma_antes, soma_depois;
  end if;
  if regras_antes <> regras_depois then
    raise exception 'VAZAMENTO: o override mexeu em recurring_rules';
  end if;
  if planos_antes <> planos_depois then
    raise exception 'VAZAMENTO: o override mexeu em installment_plans';
  end if;
end $$;

-- Ana não grava override no cenário do Bruno.
do $$
declare id1 uuid;
begin
  id1 := public.set_scenario_override(
    p_scenario_id => 'ffffffff-0000-0000-0000-000000000003',
    p_target_type => 'entry',
    p_target_id   => 'aaaaaaaa-0000-0000-0000-000000000001'
  );
  raise exception 'VAZAMENTO: Ana gravou override no cenário do Bruno';
exception
  when no_data_found then null;  -- esperado
end $$;

-- Ativar um cenário desativa o anterior, sem violar o índice no meio.
do $$
declare n int; ativo uuid;
begin
  perform public.activate_scenario('dddddddd-0000-0000-0000-000000000001');
  perform public.activate_scenario('eeeeeeee-0000-0000-0000-000000000002');

  select count(*) into n from public.scenarios
   where user_id = '11111111-1111-1111-1111-111111111111' and is_active;
  if n <> 1 then raise exception 'deveria haver exatamente 1 cenário ativo, há %', n; end if;

  select id into ativo from public.scenarios
   where user_id = '11111111-1111-1111-1111-111111111111' and is_active;
  if ativo <> 'eeeeeeee-0000-0000-0000-000000000002' then
    raise exception 'o cenário ativo deveria ser o último ativado, é %', ativo;
  end if;
end $$;

-- Ativar de novo o mesmo cenário é idempotente.
do $$
declare n int;
begin
  perform public.activate_scenario('eeeeeeee-0000-0000-0000-000000000002');
  select count(*) into n from public.scenarios
   where user_id = '11111111-1111-1111-1111-111111111111' and is_active;
  if n <> 1 then raise exception 'reativar deveria continuar com 1 ativo, há %', n; end if;
end $$;

-- Ativar o cenário do Bruno a partir da Ana não acha a linha.
do $$
begin
  perform public.activate_scenario('ffffffff-0000-0000-0000-000000000003');
  raise exception 'VAZAMENTO: Ana ativou o cenário do Bruno';
exception
  when no_data_found then null;  -- esperado
end $$;

-- Excluir o cenário leva os overrides junto (cascade), sem tocar em entries.
do $$
declare overrides_restantes int; entries_depois int;
begin
  delete from public.scenarios where id = 'dddddddd-0000-0000-0000-000000000001';

  select count(*) into overrides_restantes from public.scenario_overrides
   where scenario_id = 'dddddddd-0000-0000-0000-000000000001';
  if overrides_restantes <> 0 then
    raise exception 'os overrides deveriam sair junto com o cenário, sobraram %', overrides_restantes;
  end if;

  select count(*) into entries_depois from public.entries;
  if entries_depois = 0 then raise exception 'excluir o cenário não deveria esvaziar entries'; end if;
end $$;

-- anon não executa nenhuma das duas.
set role anon;
do $$
declare id1 uuid;
begin
  id1 := public.set_scenario_override(
    p_scenario_id => 'eeeeeeee-0000-0000-0000-000000000002',
    p_target_type => 'entry',
    p_target_id   => 'aaaaaaaa-0000-0000-0000-000000000001');
  raise exception 'ESCALADA: anon executou set_scenario_override';
exception
  when insufficient_privilege then null;  -- esperado
end $$;

do $$
begin
  perform public.activate_scenario('eeeeeeee-0000-0000-0000-000000000002');
  raise exception 'ESCALADA: anon executou activate_scenario';
exception
  when insufficient_privilege then null;  -- esperado
end $$;

reset role;

-- === Assistente de IA (migration 0012) ===
-- Mesmo padrão das demais tabelas do dono: cada um vê, apaga e enfileira só o
-- que é seu. E o privilégio de coluna precisa ter travado o que devia sem travar
-- o que a tela de ajustes precisa escrever.
reset role;

insert into public.ai_jobs (user_id, kind, input) values
  ('11111111-1111-1111-1111-111111111111', 'interpret', '{"text": "mercado 150"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'interpret', '{"text": "posto 200"}'::jsonb);

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret) values
  ('11111111-1111-1111-1111-111111111111', 'https://push.exemplo/ana', 'chave-ana', 'segredo-ana'),
  ('22222222-2222-2222-2222-222222222222', 'https://push.exemplo/bruno', 'chave-bruno', 'segredo-bruno');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare n int;
begin
  select count(*) into n from public.ai_jobs;
  if n <> 1 then raise exception 'Ana deveria ver 1 trabalho, viu %', n; end if;

  select count(*) into n from public.push_subscriptions;
  if n <> 1 then raise exception 'Ana deveria ver 1 inscrição de push, viu %', n; end if;
end $$;

-- Ana não apaga o que é do Bruno.
do $$
declare n int;
begin
  delete from public.ai_jobs where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS falhou: Ana apagou % trabalho(s) do Bruno', n; end if;

  delete from public.push_subscriptions where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS falhou: Ana apagou % inscrição(ões) do Bruno', n; end if;
end $$;

-- Nem enfileira em nome dele.
do $$
begin
  insert into public.ai_jobs (user_id, kind, input)
  values ('22222222-2222-2222-2222-222222222222', 'apply', '{}'::jsonb);
  raise exception 'RLS falhou: Ana enfileirou trabalho em nome do Bruno';
exception
  when insufficient_privilege then null;  -- esperado
end $$;

-- `input` é escrito uma vez, no insert: reescrevê-lo faria o histórico mentir
-- sobre o que foi perguntado.
do $$
begin
  update public.ai_jobs set input = '{"text": "outra coisa"}'::jsonb
   where user_id = '11111111-1111-1111-1111-111111111111';
  raise exception 'ESCALADA: o pedido original pôde ser reescrito';
exception
  when insufficient_privilege then null;  -- esperado
end $$;

-- O que o Server Action da própria pessoa precisa escrever continua escrevível.
do $$
declare s ai_job_status;
begin
  update public.ai_jobs set status = 'running', started_at = now(), model = 'gemini-3.8-flash'
   where user_id = '11111111-1111-1111-1111-111111111111';

  select status into s from public.ai_jobs;
  if s <> 'running' then raise exception 'o trabalho da Ana deveria estar running, está %', s; end if;
end $$;

-- Duas contas no mesmo navegador: a unicidade é (user_id, endpoint), então o
-- mesmo endpoint pode ser reaproveitado por outra pessoa sem colidir. Global,
-- essa colisão responderia "esta pessoa existe" sem ler linha nenhuma.
do $$
declare n int;
begin
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret)
  values ('11111111-1111-1111-1111-111111111111', 'https://push.exemplo/bruno',
          'chave-compartilhada', 'segredo-compartilhado');

  select count(*) into n from public.push_subscriptions;
  if n <> 2 then raise exception 'Ana deveria ver 2 inscrições, viu %', n; end if;

  -- Mas o MESMO par continua barrado.
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret)
    values ('11111111-1111-1111-1111-111111111111', 'https://push.exemplo/bruno', 'x', 'y');
    raise exception 'push_subscriptions_user_endpoint_uniq falhou: par duplicado aceito';
  exception
    when unique_violation then null;  -- esperado
  end;
end $$;

-- As preferências de IA são editáveis pelo dono (grant de coluna da 0012).
do $$
declare ligado boolean;
begin
  update public.profiles
     set ai_insights_enabled = false, ai_notifications_enabled = false, ai_model = 'gemini-3.6-flash'
   where id = '11111111-1111-1111-1111-111111111111';

  select ai_insights_enabled into ligado from public.profiles
   where id = '11111111-1111-1111-1111-111111111111';
  if ligado then raise exception 'o dono deveria conseguir desligar o resumo'; end if;
end $$;

-- E a preferência que a 0013 acrescentou também. Coluna nova NÃO herda concessão: sem o
-- grant da migration, isto falharia com insufficient_privilege — que é exatamente o que a
-- 0012 anotou ao acrescentar as três anteriores.
do $$
declare etapas boolean;
begin
  update public.profiles set ai_show_reasoning = true
   where id = '11111111-1111-1111-1111-111111111111';

  select ai_show_reasoning into etapas from public.profiles
   where id = '11111111-1111-1111-1111-111111111111';
  if not etapas then raise exception 'o dono deveria conseguir ligar as etapas'; end if;
end $$;

-- Mas os grants novos não podem ter reaberto a escalada que a 0008 fechou.
do $$
begin
  update public.profiles set role = 'admin'
   where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'ESCALADA: o grant da 0012 ou da 0013 reabriu a escrita em profiles.role';
exception
  when insufficient_privilege then null;  -- esperado
end $$;

-- === Bruno enxerga só o dele ===
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare n int;
begin
  select count(*) into n from public.ai_jobs;
  if n <> 1 then raise exception 'Bruno deveria ver 1 trabalho, viu %', n; end if;

  -- Ana registrou o endpoint dele, mas a linha é dela: Bruno continua com uma.
  select count(*) into n from public.push_subscriptions;
  if n <> 1 then raise exception 'Bruno deveria ver 1 inscrição, viu %', n; end if;
end $$;

-- === Sem sessão, nada ===
set request.jwt.claim.sub = '';

do $$
declare n int;
begin
  select count(*) into n from public.ai_jobs;
  if n <> 0 then raise exception 'sem sessão deveriam aparecer 0 trabalhos, apareceram %', n; end if;

  select count(*) into n from public.push_subscriptions;
  if n <> 0 then raise exception 'sem sessão deveriam aparecer 0 inscrições, apareceram %', n; end if;
end $$;

-- === v_source_breakdown (migration 0014) ===
--
-- A view nova da Análise. Duas coisas a provar: que ela isola por usuário — `security_invoker`
-- esquecido faria a view rodar com os privilégios de quem a criou e mostrar o comprometimento
-- da renda de todo mundo — e que ela soma a mesma coisa que `v_monthly_summary`, só repartida
-- por origem. Se as duas discordassem, a tela mostraria um "sobra" que não fecha com o mês.

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare intrusas int; divergentes int; n int;
begin
  select count(*) into n from public.v_source_breakdown;
  if n = 0 then raise exception 'a view deveria ver os lançamentos de Ana'; end if;

  select count(*) into intrusas from public.v_source_breakdown
   where user_id <> '11111111-1111-1111-1111-111111111111';
  if intrusas <> 0 then
    raise exception 'VAZAMENTO: v_source_breakdown mostrou % linha(s) de outro usuário', intrusas;
  end if;

  -- Repartir por origem não pode mudar o total do mês.
  select count(*) into divergentes
    from (
      select month, kind, sum(total_cents) as por_origem
        from public.v_source_breakdown group by month, kind
    ) s
    join (
      select month,
             income_cents  as income,
             expense_cents as expense
        from public.v_monthly_summary
    ) m using (month)
   where s.por_origem <> case when s.kind = 'income' then m.income else m.expense end;
  if divergentes <> 0 then
    raise exception 'v_source_breakdown não fecha com v_monthly_summary em % mês(es)', divergentes;
  end if;
end $$;

-- Bruno não vê nada de Ana por ela.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare intrusas int;
begin
  select count(*) into intrusas from public.v_source_breakdown
   where user_id <> '22222222-2222-2222-2222-222222222222';
  if intrusas <> 0 then
    raise exception 'VAZAMENTO: Bruno viu % linha(s) de outro usuário na v_source_breakdown', intrusas;
  end if;
end $$;

-- Sem sessão, nada.
set request.jwt.claim.sub = '';

do $$
declare n int;
begin
  select count(*) into n from public.v_source_breakdown;
  if n <> 0 then raise exception 'sem sessão a view deveria devolver 0 linhas, devolveu %', n; end if;
end $$;

-- === import_key (0016) — v1.1 — 2026-09-27 ===
-- Importar o mesmo extrato duas vezes não duplica; a chave é por pessoa, não global; e só
-- aceita o formato do sha256 que lib/import/fingerprint.ts gera.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare n int; chave text := repeat('ab', 32);
begin
  insert into public.entries (user_id, kind, occurred_on, description, amount_cents, import_key)
  values ('11111111-1111-1111-1111-111111111111', 'expense', '2026-09-01', 'Pix para Fulano', 1000, chave);

  -- Segunda importação da mesma linha: o upsert do app vira `on conflict do nothing`.
  insert into public.entries (user_id, kind, occurred_on, description, amount_cents, import_key)
  values ('11111111-1111-1111-1111-111111111111', 'expense', '2026-09-01', 'Pix para Fulano', 1000, chave)
  on conflict (user_id, import_key) do nothing;

  select count(*) into n from public.entries where import_key = chave;
  if n <> 1 then raise exception 'reimportar duplicou: % linhas com a mesma import_key', n; end if;

  begin
    insert into public.entries (user_id, kind, occurred_on, description, amount_cents, import_key)
    values ('11111111-1111-1111-1111-111111111111', 'expense', '2026-09-01', 'x', 1, 'nao-e-hash');
    raise exception 'import_key fora do formato deveria ser recusada';
  exception when check_violation then null;
  end;
end $$;

-- Bruno importando um extrato com a mesma linha não colide com a de Ana, e não a enxerga.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare n int; chave text := repeat('ab', 32);
begin
  select count(*) into n from public.entries where import_key = chave;
  if n <> 0 then raise exception 'VAZAMENTO: Bruno viu a import_key de Ana'; end if;

  insert into public.entries (user_id, kind, occurred_on, description, amount_cents, import_key)
  values ('22222222-2222-2222-2222-222222222222', 'expense', '2026-09-01', 'Pix para Fulano', 1000, chave)
  on conflict (user_id, import_key) do nothing;

  select count(*) into n from public.entries where import_key = chave;
  if n <> 1 then raise exception 'a chave de Ana impediu a importação de Bruno (% linhas)', n; end if;
end $$;

reset role;

-- === Parcelamento em andamento (migration 0017) ===
--
-- `p_paid_count` marca as primeiras parcelas como liquidadas NA DATA DE CADA UMA, na mesma
-- transação que cria o plano. E um valor fora de 0..N-1 é recusado sem gravar nada.

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare plano uuid; pagas int; datas_certas int; soma bigint; planos_antes int; planos_depois int;
begin
  plano := public.create_installment_plan(
    p_description => 'TV', p_total_amount_cents => 40000,
    p_installments_count => 4::smallint, p_first_due_on => '2026-05-15',
    p_installments =>
    '[{"number":"1","amount_cents":10000,"due_on":"2026-05-15","description":"TV (1/4)"},
      {"number":"2","amount_cents":10000,"due_on":"2026-06-15","description":"TV (2/4)"},
      {"number":"3","amount_cents":10000,"due_on":"2026-07-15","description":"TV (3/4)"},
      {"number":"4","amount_cents":10000,"due_on":"2026-08-15","description":"TV (4/4)"}]'::jsonb,
    p_paid_count => 2::smallint
  );

  select count(*) into pagas from public.entries
   where source_id = plano and is_settled;
  if pagas <> 2 then raise exception 'deveriam nascer 2 parcelas pagas, nasceram %', pagas; end if;

  select count(*) into datas_certas from public.entries
   where source_id = plano and is_settled and settled_on = occurred_on and installment_number <= 2;
  if datas_certas <> 2 then
    raise exception 'as pagas deveriam ser as 1 e 2, liquidadas na própria data (%)', datas_certas;
  end if;

  select sum(amount_cents) into soma from public.entries where source_id = plano;
  if soma <> 40000 then raise exception 'a soma deveria continuar 40000, é %', soma; end if;

  -- Sem o parâmetro, o comportamento da 0010: todas pendentes.
  plano := public.create_installment_plan(
    p_description => 'Rádio', p_total_amount_cents => 2000,
    p_installments_count => 2::smallint, p_first_due_on => '2026-05-15',
    p_installments =>
    '[{"number":"1","amount_cents":1000,"due_on":"2026-05-15","description":"Rádio (1/2)"},
      {"number":"2","amount_cents":1000,"due_on":"2026-06-15","description":"Rádio (2/2)"}]'::jsonb
  );
  select count(*) into pagas from public.entries where source_id = plano and is_settled;
  if pagas <> 0 then raise exception 'sem p_paid_count nenhuma deveria nascer paga (%)', pagas; end if;

  -- Todas pagas é recusado, e o plano não sobra.
  select count(*) into planos_antes from public.installment_plans;
  begin
    plano := public.create_installment_plan(
      p_description => 'Tudo pago', p_total_amount_cents => 2000,
      p_installments_count => 2::smallint, p_first_due_on => '2026-05-15',
      p_installments =>
      '[{"number":"1","amount_cents":1000,"due_on":"2026-05-15","description":"a"},
        {"number":"2","amount_cents":1000,"due_on":"2026-06-15","description":"b"}]'::jsonb,
      p_paid_count => 2::smallint
    );
    raise exception 'p_paid_count igual ao total deveria ser recusado';
  exception
    when check_violation then null;  -- esperado
  end;
  select count(*) into planos_depois from public.installment_plans;
  if planos_depois <> planos_antes then raise exception 'plano gravado apesar da recusa'; end if;
end $$;

reset role;

-- === Declarar pagas num parcelamento já cadastrado (migration 0017, seção 2) ===

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare plano uuid; mudou int; pagas int; datas int; data_da_1 date;
begin
  plano := public.create_installment_plan(
    p_description => 'Sofá antigo', p_total_amount_cents => 40000,
    p_installments_count => 4::smallint, p_first_due_on => '2026-03-20',
    p_installments =>
    '[{"number":"1","amount_cents":10000,"due_on":"2026-03-20","description":"Sofá antigo (1/4)"},
      {"number":"2","amount_cents":10000,"due_on":"2026-04-20","description":"Sofá antigo (2/4)"},
      {"number":"3","amount_cents":10000,"due_on":"2026-05-20","description":"Sofá antigo (3/4)"},
      {"number":"4","amount_cents":10000,"due_on":"2026-06-20","description":"Sofá antigo (4/4)"}]'::jsonb
  );

  -- Guardado para o bloco do Bruno, que não enxerga a linha e não teria como achar o id.
  perform set_config('teste.plano_ana', plano::text, false);

  -- A 1ª foi marcada pelo app num outro dia: esse `settled_on` é história e precisa ficar.
  update public.entries set is_settled = true, settled_on = '2026-03-25'
   where source_id = plano and installment_number = 1;

  mudou := public.set_installments_paid(plano, 2::smallint);
  if mudou <> 1 then raise exception 'declarar 2 deveria mudar só a 2ª (mudou %)', mudou; end if;

  select count(*) into pagas from public.entries where source_id = plano and is_settled;
  if pagas <> 2 then raise exception 'deveriam ser 2 pagas, são %', pagas; end if;

  select settled_on into data_da_1 from public.entries where source_id = plano and installment_number = 1;
  if data_da_1 <> '2026-03-25' then
    raise exception 'o settled_on da 1ª deveria ser preservado, virou %', data_da_1;
  end if;

  select count(*) into datas from public.entries
   where source_id = plano and installment_number = 2 and settled_on = occurred_on;
  if datas <> 1 then raise exception 'a 2ª deveria ser liquidada na própria data'; end if;

  -- Declarar menos desfaz: 0 volta todas a pendentes, sem data de liquidação.
  mudou := public.set_installments_paid(plano, 0::smallint);
  if mudou <> 2 then raise exception 'declarar 0 deveria mudar 2 (mudou %)', mudou; end if;
  select count(*) into pagas from public.entries
   where source_id = plano and (is_settled or settled_on is not null);
  if pagas <> 0 then raise exception 'com 0 declaradas nenhuma deveria ficar paga (%)', pagas; end if;

  -- Fora de 0..N é recusado.
  begin
    perform public.set_installments_paid(plano, 5::smallint);
    raise exception 'declarar 5 de 4 deveria ser recusado';
  exception
    when check_violation then null;  -- esperado
  end;
end $$;

-- Bruno não mexe no parcelamento de Ana.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare plano uuid := current_setting('teste.plano_ana')::uuid;
begin
  if plano is null then raise exception 'o id do plano de Ana deveria estar guardado'; end if;
  perform public.set_installments_paid(plano, 1::smallint);
  raise exception 'VAZAMENTO: Bruno declarou parcelas pagas no plano de Ana';
exception
  when no_data_found then null;  -- esperado
end $$;

reset role;

set role anon;
do $$
begin
  perform public.set_installments_paid(gen_random_uuid(), 1::smallint);
  raise exception 'ESCALADA: anon executou set_installments_paid';
exception
  when insufficient_privilege then null;  -- esperado
end $$;

reset role;

-- === Fase 11 (migration 0018) — v1.4 — 2026-09-27 ===
--
-- As colunas novas de `profiles` são graváveis pelo dono (grant nominal), sem reabrir a
-- escrita em `role`; `custom` exige as duas datas; palavras-chave têm teto; e o lote de
-- importação de Ana é invisível e inapagável para Bruno.

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare periodo text; lote uuid := '99999999-9999-9999-9999-999999999999'; n int;
begin
  update public.profiles set analysis_period = 'next_30d'
   where id = '11111111-1111-1111-1111-111111111111';
  select analysis_period into periodo from public.profiles
   where id = '11111111-1111-1111-1111-111111111111';
  if periodo is distinct from 'next_30d' then
    raise exception 'o dono deveria conseguir salvar o período da Análise (%)', periodo;
  end if;

  update public.profiles
     set analysis_period = 'custom', analysis_from = '2026-01-01', analysis_to = '2026-03-31'
   where id = '11111111-1111-1111-1111-111111111111';

  begin
    update public.profiles set analysis_period = 'custom', analysis_from = null
     where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'custom sem data deveria ser recusado';
  exception when check_violation then null;
  end;

  begin
    update public.profiles set analysis_period = 'semana-que-vem'
     where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'atalho desconhecido deveria ser recusado';
  exception when check_violation then null;
  end;

  update public.categories set keywords = array['ifood', 'rappi']
   where user_id = '11111111-1111-1111-1111-111111111111' and kind = 'expense'
     and id = (select id from public.categories
                where user_id = '11111111-1111-1111-1111-111111111111' and kind = 'expense'
                limit 1);

  begin
    update public.categories set keywords = array_fill('x'::text, array[31])
     where user_id = '11111111-1111-1111-1111-111111111111';
    raise exception 'mais de 30 palavras-chave deveria ser recusado';
  exception when check_violation then null;
  end;

  insert into public.entries (user_id, kind, occurred_on, description, amount_cents, import_key, import_batch_id)
  values ('11111111-1111-1111-1111-111111111111', 'expense', '2026-09-02', 'Lote Ana', 500, repeat('cd', 32), lote);

  select count(*) into n from public.entries where import_batch_id = lote;
  if n <> 1 then raise exception 'Ana deveria ver o próprio lote (%)', n; end if;
end $$;

do $$
begin
  update public.profiles set role = 'admin'
   where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'ESCALADA: o grant da 0018 reabriu a escrita em profiles.role';
exception
  when insufficient_privilege then null;  -- esperado
end $$;

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare n int; lote uuid := '99999999-9999-9999-9999-999999999999';
begin
  select count(*) into n from public.entries where import_batch_id = lote;
  if n <> 0 then raise exception 'VAZAMENTO: Bruno viu o lote de importação de Ana'; end if;

  delete from public.entries where import_batch_id = lote;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'VAZAMENTO: Bruno apagou % linhas do lote de Ana', n; end if;

  update public.profiles set analysis_period = 'last_30d'
   where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'VAZAMENTO: Bruno mudou o período da Análise de Ana'; end if;
end $$;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare n int;
begin
  select count(*) into n from public.entries
   where import_batch_id = '99999999-9999-9999-9999-999999999999';
  if n <> 1 then raise exception 'o lote de Ana deveria continuar intacto (%)', n; end if;
end $$;

reset role;

-- === Fase 12 (migration 0019) — v1.5 — 2026-09-27 ===
--
-- A linha do extrato liquida o item cadastrado em vez de criar outro; reimportar não faz
-- nada; a parcela mantém o valor; o aporte de meta é uma saída amarrada; e nada disso
-- alcança o que é de outra pessoa.

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare
  ana       uuid := '11111111-1111-1111-1111-111111111111';
  pendente  uuid;
  regra     uuid;
  meta      uuid;
  plano     uuid;
  parcela   uuid;
  v_id      uuid;
  n         int;
  valor     bigint;
  guardado  bigint;
  pago      boolean;
  data_real date;
begin
  -- Palavras-chave têm o mesmo teto da 0018 nas quatro tabelas.
  begin
    insert into public.entries (user_id, kind, occurred_on, description, amount_cents, keywords)
    values (ana, 'expense', '2026-09-01', 'Teto', 100, array_fill('x'::text, array[31]));
    raise exception 'mais de 30 palavras-chave num lançamento deveria ser recusado';
  exception when check_violation then null;
  end;

  -- 1. Avulso pendente: liquida com o valor e a data do extrato, e guarda a chave.
  insert into public.entries (user_id, kind, occurred_on, description, amount_cents, keywords)
  values (ana, 'expense', '2026-09-05', 'Conta de luz', 20000, array['enel'])
  returning id into pendente;

  v_id := public.reconcile_import_row('entry', pendente, '2026-09-05', '2026-09-07', 'expense',
                                      21050, repeat('a1', 32), null, 'ENEL DISTRIBUICAO');
  if v_id is distinct from pendente then raise exception 'o avulso pendente deveria ser conectado'; end if;

  select amount_cents, is_settled, occurred_on into valor, pago, data_real
    from public.entries where id = pendente;
  if valor <> 21050 or not pago or data_real <> '2026-09-07' then
    raise exception 'conectado deveria ficar pago em 07/09 com o valor do extrato (%, %, %)', valor, pago, data_real;
  end if;

  -- Reimportar a mesma linha não conecta de novo nem cria nada.
  if public.reconcile_import_row('entry', pendente, '2026-09-05', '2026-09-07', 'expense',
                                 21050, repeat('a1', 32)) is not null then
    raise exception 'a mesma linha do extrato não pode ser conectada duas vezes';
  end if;

  -- Tipo diferente não conecta.
  insert into public.entries (user_id, kind, occurred_on, description, amount_cents)
  values (ana, 'income', '2026-09-05', 'Reembolso', 5000) returning id into v_id;
  if public.reconcile_import_row('entry', v_id, '2026-09-05', '2026-09-05', 'expense',
                                 5000, repeat('a2', 32)) is not null then
    raise exception 'saída do extrato não pode liquidar uma entrada';
  end if;

  -- 2. Renda fixa: a ocorrência nasce paga com o valor do extrato, na chave do vencimento.
  insert into public.recurring_rules (user_id, kind, description, amount_cents, frequency,
                                      day_of_month, starts_on, keywords)
  values (ana, 'income', 'Salário', 500000, 'monthly', 1, '2026-01-01', array['empresa x'])
  returning id into regra;

  v_id := public.reconcile_import_row('recurring', regra, '2026-10-01', '2026-09-30', 'income',
                                      512300, repeat('a3', 32), gen_random_uuid());
  if v_id is null then raise exception 'a renda fixa deveria ser conectada'; end if;

  select count(*) into n from public.entries
   where source = 'recurring' and source_id = regra and occurrence_key = '2026-10'
     and is_settled and amount_cents = 512300 and occurred_on = '2026-09-30';
  if n <> 1 then raise exception 'a ocorrência de outubro deveria estar paga em 30/09 (%)', n; end if;

  -- A mesma ocorrência por outra linha: já paga, não conecta.
  if public.reconcile_import_row('recurring', regra, '2026-10-01', '2026-10-01', 'income',
                                 512300, repeat('a4', 32)) is not null then
    raise exception 'ocorrência já paga não pode ser conectada de novo';
  end if;

  -- Fora da vigência não existe ocorrência.
  if public.reconcile_import_row('recurring', regra, '2025-12-01', '2025-12-01', 'income',
                                 500000, repeat('a5', 32)) is not null then
    raise exception 'data antes do início da renda fixa não pode ser conectada';
  end if;

  -- 3. Parcela: conecta, mas mantém o valor da parcela (a soma é o total do plano).
  plano := public.create_installment_plan(
    'Sofá', 30000::bigint, 3::smallint, '2026-09-10'::date,
    '[{"number":"1","amount_cents":10000,"due_on":"2026-09-10","description":"Sofá (1/3)"},
      {"number":"2","amount_cents":10000,"due_on":"2026-10-10","description":"Sofá (2/3)"},
      {"number":"3","amount_cents":10000,"due_on":"2026-11-10","description":"Sofá (3/3)"}]'::jsonb
  );
  update public.installment_plans set keywords = array['loja do sofa'] where id = plano;
  select id into parcela from public.entries where source_id = plano and occurrence_key = '1';

  v_id := public.reconcile_import_row('entry', parcela, '2026-09-10', '2026-09-11', 'expense',
                                      10390, repeat('a6', 32));
  if v_id is distinct from parcela then raise exception 'a parcela deveria ser conectada'; end if;

  select sum(amount_cents) into valor from public.entries where source_id = plano;
  if valor <> 30000 then raise exception 'a soma das parcelas mudou: %', valor; end if;

  -- 4. Meta: o aporte é uma saída amarrada; excluir a saída leva o aporte.
  insert into public.goals (user_id, name, target_amount_cents, keywords)
  values (ana, 'Viagem', 300000, array['guardado'])
  returning id into meta;

  v_id := public.record_goal_contribution(meta, 50000, '2026-09-15');
  select count(*) into n from public.entries
   where id = v_id and source = 'goal' and source_id = meta and occurrence_key = '2026-09'
     and kind = 'expense' and is_settled;
  if n <> 1 then raise exception 'o aporte deveria virar uma saída da meta com a chave do mês'; end if;

  -- Segundo aporte no mesmo mês ganha chave própria.
  v_id := public.reconcile_import_row('goal', meta, null, '2026-09-20', 'expense',
                                      25000, repeat('a7', 32));
  select count(*) into n from public.entries where id = v_id and occurrence_key = '2026-09:2';
  if n <> 1 then raise exception 'o segundo aporte do mês deveria ter a chave 2026-09:2'; end if;

  select saved_cents into guardado from public.v_goal_progress where goal_id = meta;
  if guardado <> 75000 then raise exception 'a meta deveria somar 75000, soma %', guardado; end if;

  -- Editar a saída muda o aporte (trigger), e excluir a saída o apaga (cascade).
  update public.entries set amount_cents = 30000 where id = v_id;
  select saved_cents into guardado from public.v_goal_progress where goal_id = meta;
  if guardado <> 80000 then raise exception 'editar a saída deveria mudar o aporte (%)', guardado; end if;

  delete from public.entries where id = v_id;
  select saved_cents into guardado from public.v_goal_progress where goal_id = meta;
  if guardado <> 50000 then raise exception 'excluir a saída deveria apagar o aporte (%)', guardado; end if;
end $$;

-- Bruno não conecta nada de Ana, nem registra aporte na meta dela.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare n int;
begin
  select count(*) into n from public.entries where description = 'Reembolso';
  if n <> 0 then raise exception 'VAZAMENTO: Bruno viu o lançamento de Ana'; end if;
end $$;

-- Os ids de Ana, lidos fora da RLS, para Bruno tentar usá-los: é o ataque real — adivinhar
-- ou vazar um uuid não pode bastar.
reset role;

create temp table alvos_ana as
  select
    (select id from public.entries where description = 'Reembolso') as entrada,
    (select id from public.recurring_rules where description = 'Salário') as regra,
    (select id from public.goals where name = 'Viagem') as meta;
grant select on alvos_ana to authenticated;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare a record; n int;
begin
  select * into a from alvos_ana;

  if public.reconcile_import_row('entry', a.entrada, '2026-09-05', '2026-09-05', 'income',
                                 5000, repeat('b1', 32)) is not null then
    raise exception 'VAZAMENTO: Bruno liquidou um lançamento de Ana';
  end if;

  if public.reconcile_import_row('recurring', a.regra, '2026-11-01', '2026-11-01', 'income',
                                 5000, repeat('b2', 32)) is not null then
    raise exception 'VAZAMENTO: Bruno materializou a renda fixa de Ana';
  end if;

  begin
    perform public.record_goal_contribution(a.meta, 100, '2026-09-01');
    raise exception 'VAZAMENTO: Bruno aportou na meta de Ana';
  exception when no_data_found then null;
  end;

  select count(*) into n from public.entries where import_key in (repeat('b1', 32), repeat('b2', 32));
  if n <> 0 then raise exception 'Bruno não deveria ter gravado nada (%)', n; end if;
end $$;

reset role;

-- A entrada de Ana segue pendente e a renda de novembro não existe.
do $$
declare n int;
begin
  select count(*) into n from public.entries
   where description = 'Reembolso' and not is_settled and import_key is null;
  if n <> 1 then raise exception 'a entrada de Ana deveria continuar pendente'; end if;

  select count(*) into n from public.entries e
    join public.recurring_rules r on r.id = e.source_id
   where r.description = 'Salário' and e.occurrence_key = '2026-11';
  if n <> 0 then raise exception 'a renda de novembro de Ana não deveria existir'; end if;
end $$;

-- anon não executa as funções novas.
do $$
begin
  if has_function_privilege('anon',
       'public.reconcile_import_row(text, uuid, date, date, public.entry_kind, bigint, text, uuid, text)',
       'execute')
     or has_function_privilege('anon',
       'public.record_goal_contribution(uuid, bigint, date, text, text, uuid)', 'execute') then
    raise exception 'anon não deveria executar as funções da 0019';
  end if;
end $$;

-- === Fase 13 (migrations 0020/0021) — v1.6 — 2026-09-27 ===
--
-- Cartões e empréstimos: cada um só vê os seus; o lançamento não aponta para o cartão de outra
-- pessoa (FK composta); a compra no cartão nunca fica liquidada nem é paga pelo extrato; o
-- pagamento da fatura é idempotente pela import_key; e as views de competência não contam a
-- fatura por cima das compras.

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

insert into public.credit_accounts (user_id, kind, name, closing_day, due_day)
values ('22222222-2222-2222-2222-222222222222', 'card', 'Cartão do Bruno', 3, 10);

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare
  ana     uuid := '11111111-1111-1111-1111-111111111111';
  cartao  uuid;
  emprest uuid;
  compra  uuid;
  regra   uuid;
  plano   uuid;
  v_id    uuid;
  n       int;
  total   numeric;
  juros   numeric;
begin
  -- Isolamento: Ana não vê o cartão de Bruno.
  select count(*) into n from public.credit_accounts;
  if n <> 0 then raise exception 'VAZAMENTO: Ana viu % cartão(ões) de Bruno', n; end if;

  -- Cartão exige fechamento e vencimento.
  begin
    insert into public.credit_accounts (user_id, kind, name) values (ana, 'card', 'Sem ciclo');
    raise exception 'cartão sem fechamento/vencimento deveria ser recusado';
  exception when check_violation then null;
  end;

  insert into public.credit_accounts (user_id, kind, name, limit_cents, closing_day, due_day, keywords)
  values (ana, 'card', 'Nubank', 500000, 3, 10, array['pagamento fatura'])
  returning id into cartao;

  insert into public.credit_accounts (user_id, kind, name)
  values (ana, 'loan', 'Empréstimo do banco')
  returning id into emprest;

  -- O ciclo do cartão: a mesma regra de lib/finance/credit.ts (tests/unit/credit.test.ts).
  if public.credit_first_due('card', 3::smallint, 10::smallint, null, '2026-09-03') <> '2026-09-10'
     or public.credit_first_due('card', 3::smallint, 10::smallint, null, '2026-09-04') <> '2026-10-10'
     or public.credit_first_due('card', 25::smallint, 5::smallint, null, '2026-09-20') <> '2026-10-05'
     or public.credit_first_due('card', 25::smallint, 5::smallint, null, '2026-09-26') <> '2026-11-05'
     or public.credit_first_due('card', 31::smallint, 10::smallint, null, '2026-02-28') <> '2026-03-10'
     or public.credit_first_due('card', 30::smallint, 31::smallint, null, '2026-02-10') <> '2026-03-31'
     or public.credit_first_due('loan', null, 15::smallint, null, '2026-09-15') <> '2026-10-15'
     or public.credit_first_due('loan', null, null, '2026-12-01', '2026-09-15') <> '2026-12-01'
     or public.credit_first_due('loan', null, null, null, '2026-09-15') is not null then
    raise exception 'credit_first_due divergiu da regra de lib/finance/credit.ts';
  end if;

  -- A compra no cartão nasce aberta. Liquidada é recusada: quem a conclui é a fatura.
  begin
    insert into public.entries (user_id, kind, occurred_on, description, amount_cents,
                                credit_account_id, charge_first_due_on, is_settled, settled_on)
    values (ana, 'expense', '2026-09-05', 'Uber', 3000, cartao, '2026-10-10', true, '2026-09-05');
    raise exception 'compra no cartão não pode nascer liquidada';
  exception when check_violation then null;
  end;

  -- Cartão sem data de pagamento (e vice-versa) é recusado.
  begin
    insert into public.entries (user_id, kind, occurred_on, description, amount_cents, credit_account_id)
    values (ana, 'expense', '2026-09-05', 'Sem vencimento', 3000, cartao);
    raise exception 'lançamento no cartão sem vencimento deveria ser recusado';
  exception when check_violation then null;
  end;

  -- Juros só em dívida.
  begin
    insert into public.entries (user_id, kind, occurred_on, description, amount_cents, interest_cents)
    values (ana, 'expense', '2026-09-05', 'Juros soltos', 3000, 100);
    raise exception 'juros num lançamento comum deveriam ser recusados';
  exception when check_violation then null;
  end;

  insert into public.entries (user_id, kind, occurred_on, description, amount_cents,
                              credit_account_id, charge_first_due_on, keywords)
  values (ana, 'expense', '2026-09-05', 'Uber', 3000, cartao, '2026-10-10', array['uber'])
  returning id into compra;

  -- O extrato não paga a compra do cartão, nem com a palavra-chave dela.
  if public.reconcile_import_row('entry', compra, '2026-09-05', '2026-09-05', 'expense',
                                 3000, repeat('c1', 32)) is not null then
    raise exception 'o extrato não pode liquidar uma compra do cartão';
  end if;

  -- Nem marcar como pago à mão.
  begin
    update public.entries set is_settled = true, settled_on = '2026-09-05' where id = compra;
    raise exception 'compra no cartão não pode ser marcada como paga';
  exception when check_violation then null;
  end;

  -- O dinheiro que veio do empréstimo entra (liquidado), com juros e 12 cobranças.
  insert into public.entries (user_id, kind, occurred_on, description, amount_cents,
                              is_settled, settled_on, credit_account_id, charge_first_due_on,
                              charge_count, interest_cents)
  values (ana, 'income', '2026-09-05', 'Empréstimo', 500000, true, '2026-09-05', emprest,
          '2026-10-05', 12, 76000);

  -- Pagar a fatura: saída liquidada, chave do vencimento; o segundo pagamento ganha :2.
  v_id := public.pay_credit_bill(cartao, '2026-10-10', 1000, '2026-10-10');
  v_id := public.pay_credit_bill(cartao, '2026-10-10', 2000, '2026-10-12', 0, repeat('c2', 32));
  select count(*) into n from public.entries
   where source = 'credit_bill' and source_id = cartao
     and occurrence_key in ('2026-10-10', '2026-10-10:2') and is_settled and credit_account_id is null;
  if n <> 2 then raise exception 'os dois pagamentos da fatura deveriam existir (%)', n; end if;

  -- A mesma linha do extrato não paga duas vezes.
  if public.pay_credit_bill(cartao, '2026-10-10', 2000, '2026-10-12', 0, repeat('c2', 32)) is not null then
    raise exception 'a mesma linha do extrato não pode pagar a fatura duas vezes';
  end if;

  -- Juros maiores que o pagamento são recusados.
  begin
    perform public.pay_credit_bill(cartao, '2026-11-10', 100, '2026-11-10', 200);
    raise exception 'juros maiores que o pagamento deveriam ser recusados';
  exception when check_violation then null;
  end;

  -- O pagamento da fatura não é um lançamento que o extrato conecta de novo.
  if public.reconcile_import_row('entry', v_id, '2026-10-12', '2026-10-12', 'expense',
                                 2000, repeat('c3', 32)) is not null then
    raise exception 'pagamento de fatura não pode ser conectado de novo';
  end if;

  -- Parcelar o restante: idempotente pelo vencimento de origem.
  v_id := public.carry_credit_bill(cartao, '2026-10-10', 70000, 78000, 6::smallint, '2026-11-10');
  if v_id is null then raise exception 'o parcelamento da fatura deveria ser criado'; end if;
  if public.carry_credit_bill(cartao, '2026-10-10', 70000, 78000, 6::smallint, '2026-11-10') is not null then
    raise exception 'a mesma fatura não pode ser parcelada duas vezes';
  end if;

  -- Competência: em setembro, só o Uber (3000) conta como saída + os 76000 de juros do
  -- empréstimo; o empréstimo não é renda. Em outubro: pagamentos fora, parcelamento fora, juros
  -- do parcelamento (8000) dentro.
  select expense_cents, income_cents into total, juros from public.v_monthly_summary
   where month = '2026-09-01' and user_id = ana;
  -- Setembro de Ana também tem os lançamentos das seções anteriores; confere pela diferença.
  select coalesce(sum(amount_cents), 0) into n from public.entries
   where user_id = ana and date_trunc('month', occurred_on) = '2026-09-01' and kind = 'expense'
     and source not in ('credit_bill', 'credit_carry');
  if total <> n + 76000 then
    raise exception 'setembro deveria somar as saídas + 76000 de juros (%, %)', total, n;
  end if;
  select coalesce(sum(amount_cents), 0) into n from public.entries
   where user_id = ana and date_trunc('month', occurred_on) = '2026-09-01' and kind = 'income'
     and credit_account_id is null;
  if juros <> n then raise exception 'o empréstimo não pode contar como renda (%, %)', juros, n; end if;

  select expense_cents into total from public.v_monthly_summary
   where month = '2026-10-01' and user_id = ana;
  select coalesce(sum(amount_cents), 0) into n from public.entries
   where user_id = ana and date_trunc('month', occurred_on) = '2026-10-01' and kind = 'expense'
     and source not in ('credit_bill', 'credit_carry');
  if total <> n + 8000 then
    raise exception 'outubro: pagamentos e parcelamento fora, só 8000 de juros a mais (%, %)', total, n;
  end if;

  select interest_cents into juros from public.v_interest_by_month
   where month = '2026-10-01' and user_id = ana;
  if juros <> 8000 then raise exception 'v_interest_by_month de outubro deveria ser 8000 (%)', juros; end if;

  -- Por categoria, outubro soma só as saídas que não são fatura (sem juros: esses são a
  -- categoria virtual de v_interest_by_month).
  select coalesce(sum(total_cents), 0) into total from public.v_category_breakdown
   where month = '2026-10-01' and user_id = ana and kind = 'expense';
  if total <> n then raise exception 'a fatura não pode aparecer por categoria (%, %)', total, n; end if;

  -- Conta fixa no cartão: a ocorrência nasce aberta, na fatura, e o extrato não a paga.
  insert into public.recurring_rules (user_id, kind, description, amount_cents, frequency,
                                      day_of_month, starts_on, credit_account_id)
  values (ana, 'expense', 'Streaming', 5590, 'monthly', 15, '2026-01-01', cartao)
  returning id into regra;

  v_id := public.materialize_recurring_occurrence(regra, '2026-09-15');
  select count(*) into n from public.entries
   where id = v_id and not is_settled and credit_account_id = cartao
     and charge_first_due_on = '2026-10-10';
  if n <> 1 then raise exception 'a conta fixa no cartão deveria nascer aberta na fatura de 10/10'; end if;

  if public.reconcile_import_row('recurring', regra, '2026-10-15', '2026-10-15', 'expense',
                                 5590, repeat('c4', 32)) is not null then
    raise exception 'o extrato não pode pagar a conta fixa no cartão';
  end if;

  -- Parcelamento no cartão: as pendentes nascem financiadas, as pagas não; e "quantas já
  -- foram pagas" é recusado.
  plano := public.create_installment_plan(
    'Geladeira', 30000::bigint, 3::smallint, '2026-08-05'::date,
    '[{"number":"1","amount_cents":10000,"due_on":"2026-08-05","description":"Geladeira (1/3)"},
      {"number":"2","amount_cents":10000,"due_on":"2026-09-05","description":"Geladeira (2/3)"},
      {"number":"3","amount_cents":10000,"due_on":"2026-10-05","description":"Geladeira (3/3)","charge_due_on":"2026-11-10"}]'::jsonb,
    null, 1::smallint, cartao
  );
  select count(*) into n from public.entries
   where source_id = plano and credit_account_id = cartao and not is_settled;
  if n <> 2 then raise exception 'as 2 parcelas pendentes deveriam estar no cartão (%)', n; end if;
  select count(*) into n from public.entries
   where source_id = plano and occurrence_key = '2' and charge_first_due_on = '2026-10-10';
  if n <> 1 then raise exception 'a parcela 2 deveria cair na fatura de 10/10 (calculada no banco)'; end if;
  select count(*) into n from public.entries
   where source_id = plano and occurrence_key = '3' and charge_first_due_on = '2026-11-10';
  if n <> 1 then raise exception 'a parcela 3 deveria usar o charge_due_on enviado'; end if;

  begin
    perform public.set_installments_paid(plano, 2::smallint);
    raise exception 'set_installments_paid não vale para parcelamento no cartão';
  exception when check_violation then null;
  end;

  -- Tirar o plano do cartão devolve as pendentes a "a pagar" comuns.
  n := public.set_installment_plan_credit(plano, null);
  if n <> 2 then raise exception 'set_installment_plan_credit deveria mudar 2 parcelas (%)', n; end if;
  select count(*) into n from public.entries where source_id = plano and credit_account_id is not null;
  if n <> 0 then raise exception 'nenhuma parcela deveria continuar no cartão'; end if;

  -- Cartão com lançamento não é excluído: arquiva.
  begin
    delete from public.credit_accounts where id = cartao;
    raise exception 'cartão com lançamentos não pode ser excluído';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Bruno não usa o cartão de Ana, nem paga a fatura dela.
reset role;

create temp table alvos_cartao as
  select
    (select id from public.credit_accounts where name = 'Nubank') as cartao_ana,
    (select id from public.credit_accounts where name = 'Cartão do Bruno') as cartao_bruno,
    (select id from public.installment_plans where description = 'Geladeira') as plano_ana;
grant select on alvos_cartao to authenticated;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare a record; n int;
begin
  select * into a from alvos_cartao;

  select count(*) into n from public.credit_accounts;
  if n <> 1 then raise exception 'Bruno deveria ver só o próprio cartão (%)', n; end if;

  -- A FK composta: o lançamento de Bruno não aponta para o cartão de Ana, mesmo com o uuid.
  begin
    insert into public.entries (user_id, kind, occurred_on, description, amount_cents,
                                credit_account_id, charge_first_due_on)
    values ('22222222-2222-2222-2222-222222222222', 'expense', '2026-09-05', 'Invasão', 100,
            a.cartao_ana, '2026-10-10');
    raise exception 'VAZAMENTO: Bruno lançou no cartão de Ana';
  exception when foreign_key_violation then null;
  end;

  begin
    perform public.pay_credit_bill(a.cartao_ana, '2026-10-10', 100, '2026-10-10');
    raise exception 'VAZAMENTO: Bruno pagou a fatura de Ana';
  exception when no_data_found then null;
  end;

  begin
    perform public.carry_credit_bill(a.cartao_ana, '2026-10-10', 100, 100, 1::smallint, '2026-11-10');
    raise exception 'VAZAMENTO: Bruno parcelou a fatura de Ana';
  exception when no_data_found then null;
  end;

  begin
    perform public.set_installment_plan_credit(a.plano_ana, a.cartao_bruno);
    raise exception 'VAZAMENTO: Bruno mexeu no parcelamento de Ana';
  exception when no_data_found then null;
  end;

  update public.credit_accounts set name = 'Tomado' where id = a.cartao_ana;
  delete from public.credit_accounts where id = a.cartao_ana;
end $$;

reset role;

do $$
declare n int;
begin
  select count(*) into n from public.credit_accounts where name = 'Nubank';
  if n <> 1 then raise exception 'o cartão de Ana deveria continuar intacto (%)', n; end if;

  select count(*) into n from public.entries where description = 'Invasão';
  if n <> 0 then raise exception 'Bruno não deveria ter gravado nada'; end if;
end $$;

-- anon não executa as funções novas.
do $$
begin
  if has_function_privilege('anon', 'public.pay_credit_bill(uuid, date, bigint, date, bigint, text, uuid)', 'execute')
     or has_function_privilege('anon', 'public.carry_credit_bill(uuid, date, bigint, bigint, smallint, date)', 'execute')
     or has_function_privilege('anon', 'public.set_installment_plan_credit(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.credit_first_due(public.credit_account_kind, smallint, smallint, date, date)', 'execute')
     or has_function_privilege('anon', 'public.create_installment_plan(text, bigint, smallint, date, jsonb, uuid, smallint, uuid)', 'execute') then
    raise exception 'anon não deveria executar as funções da 0021';
  end if;
end $$;

select 'TODAS AS ASSERÇÕES DE RLS E CONSTRAINTS PASSARAM' as resultado;
