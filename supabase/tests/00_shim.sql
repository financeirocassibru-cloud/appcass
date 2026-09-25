-- ATENÇÃO: este arquivo NÃO é uma migration e nunca deve ser aplicado ao
-- projeto Supabase. Ele existe apenas para verificar as migrations contra um
-- Postgres puro, recriando o mínimo que o Supabase já fornece: os schemas
-- `auth` e `extensions`, a tabela `auth.users`, os papéis e `auth.uid()`.
--
-- Rode via `npm run db:verify`.

-- Reproduz o mínimo do ambiente Supabase para validar as migrations localmente:
-- schemas auth/extensions, a tabela auth.users, os papéis e auth.uid().
create schema if not exists auth;
create schema if not exists extensions;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- No Supabase real isto lê o JWT; aqui lê um GUC que os testes definem.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios padrão, como o Supabase os concede.
--
-- Isto precisa vir ANTES das migrations, e não depois: é o que faz o teste
-- reproduzir a produção. O Supabase concede tudo em `public` a `anon` e
-- `authenticated` por privilégio padrão, e é exatamente essa concessão ampla
-- que criou a escalada em `profiles.role` — a policy limitava a linha, mas o
-- privilégio de coluna estava aberto.
--
-- Com as concessões aqui, o `revoke` da migration 0008 tem o que revogar, e a
-- asserção correspondente em 01_rls_proof.sql testa o comportamento real.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
