-- Corrige uma escalada de privilégio e o bootstrap do primeiro administrador.
--
-- As migrations 0001–0007 já foram aplicadas ao projeto real, então a partir
-- daqui correção de schema é migration nova — nunca edição das anteriores.

-- ---------------------------------------------------------------------------
-- 1. Escalada de privilégio em profiles.role
--
-- A policy "profiles: editar o próprio" permite ao usuário atualizar a própria
-- linha, e o papel `authenticated` tinha UPDATE em TODAS as colunas — inclusive
-- `role`. Qualquer pessoa logada virava administradora sozinha:
--
--   update profiles set role = 'admin' where id = auth.uid();
--
-- As duas checagens da policy passam, porque as duas olham só a linha.
--
-- RLS decide QUAIS LINHAS; GRANT decide QUAIS COLUNAS. São controles
-- diferentes, e a policy nunca substituiu o segundo.
-- ---------------------------------------------------------------------------
revoke update on public.profiles from anon, authenticated;

grant update (display_name, timezone, opening_balance_cents, opening_balance_on)
  on public.profiles to authenticated;

-- `role` e `id` ficam de fora de propósito: quem promove alguém a admin é o
-- trigger abaixo (primeira conta) ou uma migration, nunca a aplicação.

-- ---------------------------------------------------------------------------
-- 2. Promoção do primeiro usuário passa a ser atômica
--
-- Antes, `createFirstAccount` criava a conta e depois fazia um UPDATE separado
-- para promover a admin. Em produção esse segundo passo não teve efeito e o
-- sistema ficou sem nenhum administrador — com a porta de bootstrap já fechada,
-- porque `isSystemEmpty()` passou a ser falso. Ninguém mais conseguia entrar.
--
-- Decidir o papel aqui dentro roda na mesma transação do insert em auth.users,
-- não tem como divergir, e vale por qualquer caminho de criação de conta —
-- inclusive pelo painel do Supabase.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  seed_category text;
  seed_order int := 0;
  novo_role app_role := 'member';
begin
  -- Primeira conta do sistema nasce administradora. A porta fecha sozinha:
  -- a partir da segunda, esta condição é sempre falsa.
  if not exists (select 1 from public.profiles) then
    novo_role := 'admin';
  end if;

  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    novo_role
  );

  foreach seed_category in array array[
    'Mercado', 'Farmácia', 'Alimentação', 'Transporte',
    'Luz', 'Água', 'Internet', 'Celular', 'Outros'
  ]
  loop
    insert into public.categories (user_id, name, kind, sort_order)
    values (new.id, seed_category, 'expense', seed_order);
    seed_order := seed_order + 1;
  end loop;

  insert into public.categories (user_id, name, kind, sort_order)
  values (new.id, 'Salário', 'income', 0), (new.id, 'Outras receitas', 'income', 1);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Conserta o estado que a falha deixou para trás
--
-- Promove o perfil mais antigo, mas só se não houver nenhum admin. Em banco
-- novo é no-op, porque o trigger acima já terá promovido a primeira conta.
-- ---------------------------------------------------------------------------
update public.profiles
   set role = 'admin'
 where id = (select id from public.profiles order by created_at limit 1)
   and not exists (select 1 from public.profiles where role = 'admin');

-- ---------------------------------------------------------------------------
-- 4. Funções SECURITY DEFINER fora do alcance da API
--
-- Ambas ficam no schema `public`, que o PostgREST expõe como /rest/v1/rpc/*.
--
-- `handle_new_user` é função de trigger: chamá-la direto dá erro de qualquer
-- forma, mas não há motivo para estar exposta.
--
-- Em `is_admin` o `revoke ... from public` da migration 0005 não bastou: o
-- Supabase concede EXECUTE a `anon` e `authenticated` por privilégio padrão, e
-- revogar de PUBLIC não alcança concessão nominal. `authenticated` mantém o
-- acesso, que é o uso legítimo.
-- ---------------------------------------------------------------------------
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_admin() from anon;

-- ---------------------------------------------------------------------------
-- 5. Chaves estrangeiras sem índice
--
-- As três em `user_id` são as que mais importam: como toda policy filtra por
-- `user_id = auth.uid()`, é a coluna de acesso de TODA consulta a essas tabelas.
-- As demais cobrem o `on delete set null` de categoria.
-- ---------------------------------------------------------------------------
create index if not exists goal_contributions_user_idx
  on public.goal_contributions (user_id);
create index if not exists scenario_entries_user_idx
  on public.scenario_entries (user_id);
create index if not exists scenario_overrides_user_idx
  on public.scenario_overrides (user_id);

create index if not exists entries_category_fk_idx
  on public.entries (category_id);
create index if not exists recurring_rules_category_fk_idx
  on public.recurring_rules (category_id);
create index if not exists installment_plans_category_fk_idx
  on public.installment_plans (category_id);
create index if not exists scenario_entries_category_fk_idx
  on public.scenario_entries (category_id);

create index if not exists goal_contributions_entry_idx
  on public.goal_contributions (entry_id);
create index if not exists invites_accepted_by_idx
  on public.invites (accepted_by);
