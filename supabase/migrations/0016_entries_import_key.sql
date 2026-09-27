-- Chave de importação de extrato.
--
-- v1.0 — 2026-09-27. As migrations 0001–0015 já rodaram no projeto real e são imutáveis
-- (invariante 16); o que falta vira migration nova.
--
-- A importação de extrato (PDF/CSV) lança de uma vez o que o banco já registrou. Sem uma
-- chave, importar o mesmo extrato duas vezes — ou o mesmo período em CSV e depois em PDF —
-- dobraria o histórico e o saldo. `import_key` é o sha256 que `lib/import/fingerprint.ts`
-- calcula sobre data, tipo, valor, o texto original só com letras e números, e o ordinal
-- entre linhas idênticas. É o mesmo espírito do invariante 8: gravar duas vezes a mesma
-- linha não pode criar dois lançamentos.
--
-- Por que coluna própria e não `source = 'import'` com `entries_generated_uniq`: um valor
-- novo no enum faria projeção (`lib/finance/projection.ts`), edição e contexto da IA
-- tratarem o importado como ocorrência gerada de regra — e ele não tem regra. Importado é
-- lançamento manual feito em lote; `source` continua 'manual'.
--
-- O índice é único e NÃO parcial, de propósito: NULL nunca colide com NULL num índice único
-- do Postgres, então os lançamentos comuns (sem chave) seguem livres, e o `upsert` do
-- supabase-js consegue usar `on_conflict=user_id,import_key` — o PostgREST não sabe passar o
-- predicado de um índice parcial.
--
-- A RLS de `entries` já cobre a coluna nova: é a mesma linha, com o mesmo dono. Nenhum
-- `grant` muda, porque `entries` não tem privilégio por coluna (ver 0008 para a tabela que
-- tem).

alter table public.entries
  add column import_key text
  constraint entries_import_key_format check (import_key is null or import_key ~ '^[0-9a-f]{64}$');

create unique index entries_import_key_uniq
  on public.entries (user_id, import_key);

comment on column public.entries.import_key is
  'sha256 da linha do extrato importado (lib/import/fingerprint.ts). Nulo para lançamento digitado.';
