-- Fase 11 — palavras-chave de categoria, lote de importação e período salvo da Análise.
--
-- v1.0 — 2026-09-27. As migrations 0001–0017 já rodaram no projeto real e são imutáveis
-- (invariante 16); o que falta vira migration nova.
--
-- Três colunas de três pedidos de experiência, numa migration só porque saem juntas:
--
-- 1. `categories.keywords` — a pessoa diz "iFood, Rappi" em Alimentação e o lançamento com
--    esse nome entra ali sozinho, na importação e no [+]. É regra escrita pela pessoa, então
--    mora na própria categoria: uma tabela de regras à parte duplicaria o dono e o tipo
--    (invariante 6) para guardar uma lista curta de palavras.
--
-- 2. `entries.import_batch_id` — "selecionar todos desta importação" para desfazer uma
--    importação ruim. Cada chamada de `commitImport` grava um uuid só em todas as linhas.
--    Não é dado duplicado: o `created_at` coincide hoje por acaso de implementação (um
--    único upsert), e depender disso quebraria no dia em que a importação fosse em lotes.
--    O backfill usa exatamente esse acaso, uma vez, para as importações que já existem.
--
-- 3. `profiles.analysis_period` (+ `analysis_from`/`analysis_to`) — o último filtro de
--    período da Análise vira o padrão da pessoa. Guarda o ATALHO ("próximos 30 dias"), e
--    não as datas, para ele andar com o calendário; as datas só valem para `custom`.
--
-- A RLS de `categories`, `entries` e `profiles` já cobre as colunas novas — é a mesma
-- linha, com o mesmo dono. `categories` e `entries` não têm privilégio por coluna. Já
-- `profiles` tem (0008), e coluna nova não herda concessão: o grant nominal vai no fim.

-- 1. Palavras-chave --------------------------------------------------------------------

alter table public.categories
  add column keywords text[] not null default '{}'
  constraint categories_keywords_size check (
    cardinality(keywords) <= 30 and length(array_to_string(keywords, '')) <= 1200
  );

comment on column public.categories.keywords is
  'Palavras que, no nome de um lançamento, o põem nesta categoria (lib/finance/keywords.ts).';

-- 2. Lote de importação ----------------------------------------------------------------

alter table public.entries
  add column import_batch_id uuid;

create index entries_import_batch_idx
  on public.entries (user_id, import_batch_id)
  where import_batch_id is not null;

comment on column public.entries.import_batch_id is
  'A importação de extrato que gravou a linha (um uuid por commitImport). Nulo para digitado.';

-- Backfill: cada importação anterior foi um único upsert, e por isso as linhas dela
-- dividem o mesmo `created_at`. Um uuid por (dono, instante) reconstrói os lotes.
with lotes as (
  select user_id, created_at, gen_random_uuid() as batch_id
    from (
      select distinct user_id, created_at
        from public.entries
       where import_key is not null
    ) as instantes
)
update public.entries as e
   set import_batch_id = l.batch_id
  from lotes as l
 where e.import_key is not null
   and e.user_id = l.user_id
   and e.created_at = l.created_at;

-- 3. Período salvo da Análise ----------------------------------------------------------

alter table public.profiles
  add column analysis_period text
    constraint profiles_analysis_period_known check (
      analysis_period is null or analysis_period in (
        'last_30d', 'next_30d', 'last_month', 'next_month', 'last_90d', 'next_90d',
        'last_3m', 'next_3m', 'last_6m', 'next_6m', 'this_year', 'custom'
      )
    ),
  add column analysis_from date,
  add column analysis_to date,
  add constraint profiles_analysis_custom_range check (
    analysis_period is distinct from 'custom'
    or (analysis_from is not null and analysis_to is not null and analysis_from <= analysis_to)
  );

-- Invariante 15: RLS decide a LINHA, GRANT decide a COLUNA. A concessão é nominal, uma
-- coluna por vez; `role` e `id` continuam fora, como a 0008 deixou.
grant update (analysis_period, analysis_from, analysis_to) on public.profiles to authenticated;
