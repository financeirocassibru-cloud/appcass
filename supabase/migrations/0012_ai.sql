-- Fase 7 — Assistente de IA. v1.0 — 2026-09-26.
--
-- Três coisas entram aqui:
--   1. As preferências de IA em `profiles`, com o privilégio de coluna que o
--      invariante 15 exige. O `grant update (...)` da 0008 é NOMINAL por coluna:
--      coluna nova não herda concessão nenhuma, então sem o grant abaixo a tela
--      de ajustes gravaria e o Postgres recusaria.
--   2. `ai_jobs` — o trabalho da IA como linha de banco, não como promessa em
--      memória. É o que permite a frase continuar sendo processada com o app
--      fechado: quem executa é o Gemini (interação em background), e a linha
--      guarda o ponteiro para ela e o resultado quando chega.
--   3. `push_subscriptions` — um registro por navegador/aparelho, para avisar
--      quando o trabalho termina.
--
-- As migrations 0001–0011 já rodaram no projeto real; correção de schema daqui
-- em diante é migration nova, nunca edição das anteriores (invariante 16).

-- ---------------------------------------------------------------------------
-- 1. Tipos
-- ---------------------------------------------------------------------------
-- 'interpret' traduz a frase em proposta; 'apply' executa a proposta já
-- confirmada; 'insights' gera o resumo e as dicas sob demanda.
create type ai_job_kind as enum ('interpret', 'apply', 'insights');

-- 'queued' nasceu mas ainda não foi mandado ao provedor; 'running' tem
-- interação em andamento lá; os três finais são terminais.
create type ai_job_status as enum ('queued', 'running', 'completed', 'failed', 'canceled');

-- ---------------------------------------------------------------------------
-- 2. Preferências de IA no perfil
--
-- Ficam em `profiles` e não numa tabela de chave/valor: são três campos fixos
-- do dono da linha, e a RLS de `profiles` já resolve o acesso.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column ai_insights_enabled boolean not null default true,
  add column ai_notifications_enabled boolean not null default true,
  -- `null` = usar o primeiro modelo da cadeia (o mais recente). Texto e não
  -- enum de propósito: a lista de modelos muda mais rápido que o schema, e a
  -- validação do que é aceitável mora em lib/ai/models.ts, contra a cadeia
  -- configurada. O check aqui é só higiene de formato — impede que um nome com
  -- barra ou espaço vire parte de uma URL montada com ele.
  add column ai_model text
    check (ai_model is null or ai_model ~ '^[a-z0-9][a-z0-9._-]{0,63}$');

-- Invariante 15: RLS decide a LINHA, GRANT decide a COLUNA. `role` e `id`
-- continuam fora, como a 0008 deixou.
grant update (ai_insights_enabled, ai_notifications_enabled, ai_model)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 3. ai_jobs
-- ---------------------------------------------------------------------------
create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind ai_job_kind not null,
  status ai_job_status not null default 'queued',
  -- O que a pessoa escreveu, ou a proposta confirmada. jsonb e não colunas
  -- porque o formato varia com `kind` e nada no banco consulta por dentro dele.
  input jsonb not null default '{}'::jsonb,
  -- A proposta devolvida pelo modelo, ou o resumo, ou o relatório da execução.
  result jsonb,
  error text,
  -- Qual modelo REALMENTE respondeu. Com a cadeia de fallback isto pode não ser
  -- o preferido da pessoa, e sem registrar não há como diagnosticar depois.
  model text,
  -- `id` da interação no Gemini. É o ponteiro para o trabalho que continua
  -- rodando do lado deles quando o app fecha.
  provider_interaction_id text,
  -- Quantas vezes já caiu para o próximo modelo da cadeia.
  attempts smallint not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  -- Carimbo do push enviado. Existe para o sweeper não notificar duas vezes o
  -- mesmo job — ele roda de novo a cada minuto e reencontraria o mesmo término.
  notified_at timestamptz,
  constraint ai_jobs_finished_needs_terminal
    check (finished_at is null or status in ('completed', 'failed', 'canceled'))
);

-- Coluna de acesso de toda policy e de toda listagem da tela /assistente.
create index ai_jobs_user_created_idx
  on public.ai_jobs (user_id, created_at desc);

-- O sweeper varre exatamente isto: o que está no ar, do mais velho para o mais
-- novo. Parcial porque job terminado nunca interessa a ele, e job terminado é a
-- esmagadora maioria das linhas depois de alguns dias de uso.
create index ai_jobs_pending_idx
  on public.ai_jobs (created_at)
  where (status in ('queued', 'running'));

-- ---------------------------------------------------------------------------
-- 4. push_subscriptions
--
-- Uma linha por navegador. `endpoint` é a URL que o serviço de push do
-- fabricante emitiu; reinstalar o PWA gera endpoint novo, e o antigo é podado
-- quando o envio responde 404/410.
--
-- A unicidade é (user_id, endpoint) e NÃO endpoint sozinho. Global, ela vazaria
-- existência através da fronteira da RLS: quem tentasse registrar um endpoint já
-- usado receberia 23505 em vez de sucesso, e isso responde "esta pessoa existe e
-- usa este navegador" sem ler uma linha sequer. Também quebraria o caso real de
-- duas contas no mesmo aparelho.
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null check (length(trim(endpoint)) > 0),
  -- Chaves públicas do navegador, para cifrar a carga. Não são segredo nosso.
  -- `auth_secret` e não `auth`: uma coluna chamada `auth` ao lado de um schema
  -- chamado `auth` se lê mal em toda consulta que junta as duas coisas.
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create unique index push_subscriptions_user_endpoint_uniq
  on public.push_subscriptions (user_id, endpoint);

create index push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- 5. RLS — mesmo padrão de quatro policies das demais tabelas do dono
-- ---------------------------------------------------------------------------
alter table public.ai_jobs            enable row level security;
alter table public.push_subscriptions enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['ai_jobs', 'push_subscriptions']
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

-- Invariante 15 de novo, agora em ai_jobs: o dono escreve o andamento do
-- próprio job, mas `id` e `user_id` saem do alcance — trocar o dono de um job
-- com um UPDATE seria escrever em nome de outro sem a RLS ter o que dizer.
revoke update on public.ai_jobs from anon, authenticated;
grant update (status, result, error, model, provider_interaction_id,
              attempts, started_at, finished_at, notified_at)
  on public.ai_jobs to authenticated;

-- `input` fica de fora: é o que a pessoa escreveu, gravado uma vez no insert.
-- Deixá-lo editável permitiria reescrever o pedido depois de o modelo ter
-- respondido, e o histórico da tela /assistente passaria a mentir sobre o que
-- foi perguntado.
--
-- Uma nota para quem revisar isto com o invariante 15 na mão: `status` e
-- `result` SÃO escritos pela sessão da própria pessoa — é o Server Action dela,
-- com o cliente normal, que registra o andamento. Não é o caso de
-- `profiles.role`: forjar o próprio job não atravessa fronteira nenhuma, porque
-- executar a proposta continua passando pelas Actions, com a RLS valendo. O que
-- um `result` forjado consegue fazer é exatamente o que a pessoa já podia fazer
-- pela tela /novo.

revoke update on public.push_subscriptions from anon, authenticated;
grant update (p256dh, auth_secret, user_agent)
  on public.push_subscriptions to authenticated;
