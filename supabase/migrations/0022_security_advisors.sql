-- Avisos do advisor de segurança do Supabase.
--
-- v1.0 — 2026-09-27. As migrations 0001–0021 já rodaram no projeto real e são imutáveis
-- (invariante 16); o que falta vira migration nova.
--
-- 1. `is_admin()` deixa de ser `security definer` (lint 0029, "Signed-In Users Can Execute
--    SECURITY DEFINER Function").
--
--    A 0005 a marcou como definer "para não recursar numa policy que protege profiles". Essa
--    policy nunca existiu: as únicas que chamam `is_admin()` são as três de `invites`, e
--    `profiles` só tem "ler o próprio"/"editar o próprio", sem `is_admin()`. Como invoker, a
--    função lê `profiles` pela RLS de quem chama — e a linha que ela procura é justamente a
--    do próprio usuário (`id = auth.uid()`), que a policy "ler o próprio" libera. O resultado é
--    o mesmo, sem uma função que ignora a RLS exposta em /rest/v1/rpc/is_admin.
--
--    `authenticated` continua executando: a tela de Convites e o layout de Ajustes chamam
--    `rpc('is_admin')`, e o invariante 14 manda conferir por ela antes de usar o cliente admin.
--
-- 2. `rls_auto_enable()` sem EXECUTE para `anon`/`authenticated` (lints 0028/0029).
--
--    É a função do event trigger `ensure_rls`, que o próprio Supabase cria para ligar a RLS em
--    toda tabela nova de `public`. Não é deste repositório, e por isso o `revoke` só roda se ela
--    existir — o Postgres descartável do `db:verify` não a tem. Tirar o EXECUTE não desliga o
--    gatilho: o privilégio de uma função de gatilho não é conferido quando ele dispara. Só deixa
--    de haver a rota /rest/v1/rpc/rls_auto_enable.

alter function public.is_admin() security invoker;

do $$
begin
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'rls_auto_enable'
       and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
