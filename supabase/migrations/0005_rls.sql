-- Row Level Security.
--
-- É aqui que mora a autorização. No app antigo ela era uma linha de JavaScript
-- (`filter(d => d[1] === email)`) que podia ser esquecida; a partir daqui é
-- propriedade do banco e vale mesmo quando o código da aplicação erra.
--
-- Todas as policies usam `(select auth.uid())` e não `auth.uid()` solto: com o
-- subselect o Postgres avalia a função uma vez por consulta (InitPlan) em vez
-- de uma vez por linha.

alter table public.profiles            enable row level security;
alter table public.invites             enable row level security;
alter table public.categories          enable row level security;
alter table public.entries             enable row level security;
alter table public.recurring_rules     enable row level security;
alter table public.installment_plans   enable row level security;
alter table public.goals               enable row level security;
alter table public.goal_contributions  enable row level security;
alter table public.scenarios           enable row level security;
alter table public.scenario_overrides  enable row level security;
alter table public.scenario_entries    enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: cada usuário lê e edita apenas a própria linha.
-- Não há policy de insert: quem cria o perfil é o trigger handle_new_user,
-- que roda como security definer. Nem de delete: o perfil morre junto com
-- auth.users, por cascade.
-- ---------------------------------------------------------------------------
create policy "profiles: ler o próprio" on public.profiles
  for select using (id = (select auth.uid()));

create policy "profiles: editar o próprio" on public.profiles
  for update using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- is_admin(): consulta profiles a partir de uma policy que protege profiles.
-- Sem `security definer` isso recursaria; sem `stable` o planner reavaliaria
-- a cada linha. O `search_path` fixo evita sequestro por schema temporário.
-- ---------------------------------------------------------------------------
create function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- invites: só admin enxerga e cria. O convite em si é emitido pela chave de
-- serviço; esta tabela é a trilha de auditoria de quem convidou quem.
-- ---------------------------------------------------------------------------
create policy "invites: admin lê" on public.invites
  for select using ((select public.is_admin()));

create policy "invites: admin cria" on public.invites
  for insert with check (
    (select public.is_admin()) and invited_by = (select auth.uid())
  );

create policy "invites: admin revoga" on public.invites
  for update using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Demais tabelas: dono da linha, e só ele. Mesmo padrão de 4 policies.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories',
    'entries',
    'recurring_rules',
    'installment_plans',
    'goals',
    'goal_contributions',
    'scenarios',
    'scenario_overrides',
    'scenario_entries'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select using (user_id = (select auth.uid()))',
      'own rows: select', t
    );
    execute format(
      'create policy %I on public.%I for insert with check (user_id = (select auth.uid()))',
      'own rows: insert', t
    );
    execute format(
      'create policy %I on public.%I for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      'own rows: update', t
    );
    execute format(
      'create policy %I on public.%I for delete using (user_id = (select auth.uid()))',
      'own rows: delete', t
    );
  end loop;
end
$$;
