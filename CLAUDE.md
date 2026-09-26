# Instruções para agentes neste repositório

Antes de escrever qualquer código, leia [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) e
[`docs/ROADMAP.md`](docs/ROADMAP.md). Implemente na ordem das fases do roadmap — cada fase é
um PR fechado, com testes verdes.

## Invariantes — não quebre nenhuma destas

Cada uma existe porque o app antigo errou exatamente ali. O catálogo dos bugs está em
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

1. **Dinheiro é `bigint` de centavos.** Nunca `float`, nunca `numeric`, nunca
   `parseFloat(valor)`. Rateio (parcelas, aporte de meta) sempre via `splitCents()`, que
   garante que a soma das partes bate com o total.
2. **Data de competência é `date` puro** (`YYYY-MM-DD`), sem hora e sem timezone. É **proibido**
   `new Date("2026-03-05")` para cálculo de calendário — isso interpreta como UTC e desloca o
   dia em fuso negativo. Também é proibido `.toISOString().split('T')[0]` para extrair a data
   de um `Date` local. "Hoje" vem de `todayISO()`, fixado em `America/Sao_Paulo`.
3. **Autorização é do banco, não do código.** Toda tabela tem RLS habilitada e `user_id`.
   Nunca filtre por usuário **só** na query da aplicação — a RLS é quem autoriza. Policies
   usam `(select auth.uid())`, não `auth.uid()` solto.
   **Mas "não só na aplicação" não quer dizer "sem filtro nenhum":** todo `update` e `delete`
   do supabase-js precisa de `.eq(...)`. O PostgREST recusa escrita sem cláusula `WHERE`
   ("UPDATE requires a WHERE clause") **antes** de a RLS entrar em cena, e um `update` sem
   filtro simplesmente falha. A RLS autoriza a linha; o filtro faz o pedido ser aceito.
   Ler este invariante ao contrário já quebrou a tela de ajustar saldo em produção —
   `tests/unit/write-filters.test.ts` existe para isso não voltar.
4. **`SUPABASE_SERVICE_ROLE_KEY` só em `lib/supabase/admin.ts`**, com `import 'server-only'`
   no topo. Nunca em Client Component, nunca com prefixo `NEXT_PUBLIC_`.
5. **Mutação passa por Server Action.** Valide com Zod, execute, chame `revalidatePath`.
   Nada de chamada Supabase de escrita a partir de Client Component.
6. **Nenhuma tabela duplica dado de outra.** Cenários guardam apenas o delta
   (`scenario_overrides`), nunca uma cópia dos lançamentos. Foi a cópia em `dadosJSON` que
   destruiu a consistência do app antigo.
7. **Estado derivado é derivado.** Progresso de meta é `SUM(goal_contributions)`; parcelas
   pagas é `COUNT` de `entries` liquidadas. Não crie contadores mutáveis para isso.
8. **Ocorrência gerada é idempotente.** Materializar um custo fixo ou parcela usa upsert
   sobre `entries_generated_uniq (user_id, source, source_id, occurrence_key)`. Marcar como
   pago duas vezes não pode criar dois lançamentos.
9. **`lib/finance/` é puro.** Sem I/O, sem import de Supabase, sem `Date.now()` implícito —
   a data de referência entra por parâmetro. É o código que mais precisa de teste unitário.
10. **Identificadores em inglês, interface em português.** `entries`, `amount_cents`,
    `occurred_on` no código e no banco; "Lançamentos", "Valor", "Data" na tela. Sem acento em
    nome de tabela, coluna, variável ou arquivo.
11. **Sessão em servidor é validada com `getClaims()`.** Nunca `getSession()`, que aceita o
    que vier no cookie sem conferir a assinatura do JWT — é falsificável. E não coloque código
    entre `createServerClient` e `getClaims()` em `lib/supabase/proxy.ts`: isso causa logout
    aleatório, difícil de diagnosticar depois.
12. **Next 16, não 15.** O guarda de rota vive em `proxy.ts` (não `middleware.ts`) e a função
    exportada se chama `proxy`. `cookies()`, `headers()`, `params` e `searchParams` são
    assíncronos — sempre `await`. `next lint` não existe mais; o lint é o ESLint direto.
13. **Redirecionamento vindo da URL passa por `safeRedirectPath`** (`lib/safe-redirect.ts`).
    `startsWith('/')` sozinho deixa passar `//site-externo.com`.
14. **Nenhum fluxo depende de e-mail enviado.** A entrada é por código de convite gerado em
    `/ajustes/convites`. O banco guarda só o `sha256` do código. Antes de usar o cliente
    admin — que ignora a RLS — verifique `is_admin()` com o cliente normal, onde ela vale.
15. **RLS decide a LINHA; `GRANT` decide a COLUNA.** São controles diferentes, e a policy não
    substitui o privilégio de coluna. Coluna que o dono da linha não pode escrever (`role`,
    `id`, qualquer campo de privilégio) fica fora do `grant update (...)`. Já custou uma
    escalada: a policy "edite a própria linha" deixava qualquer usuário rodar
    `update profiles set role='admin' where id = auth.uid()`. Ver a migration 0008.
16. **Migrations são imutáveis depois de aplicadas.** As 0001–0007 já rodaram no projeto real;
    correção de schema é migration nova, nunca edição das anteriores. Antes de mexer no
    schema, confira o que está aplicado com `list_migrations` no conector.
17. **`update` que precisa casar linha usa `.select()` e verifica o resultado.** O
    `supabase-js` devolve sucesso quando nada casou; foi esse silêncio que deixou a primeira
    conta sem virar admin, em produção, sem nenhum erro aparecer.

## Convenções

- TypeScript strict. Sem `any` — se o tipo é desconhecido, use `unknown` e refine.
- Não copie código de `legacy/`. Consulte para entender a regra, reimplemente conforme os
  documentos em `docs/`.
- Antes de escrever qualquer gráfico, consulte a skill `dataviz`.

## Verificação antes de abrir PR

```bash
npm run typecheck && npm run lint && npm run test && npm run build
npm run db:verify    # se tocou em supabase/migrations/
npm run verify:pwa   # se tocou no service worker, no serwist.config.ts ou no matcher do proxy.ts
```

`db:verify` aplica as migrations num Postgres descartável e prova que a RLS isola usuários,
que o privilégio de coluna barra a escalada e que a primeira conta nasce admin. Roda sem
Docker e sem credencial — use sempre que mexer no schema.

`verify:pwa` abre um Chromium contra um build de produção servido em `:3100` (`npm run build`
e `npx next start -p 3100` antes) e confere o que só aparece rodando: que `/sw.js` responde
200, que o worker registra na raiz e assume o controle, que a rota não visitada cai na página
de offline e que nenhuma rota de sessão ficou em cache. Nada disso é visível no `typecheck`,
no `lint` ou no `vitest` — e `/sw.js` já foi a produção com 404 por isso.

As concessões de privilégio vivem em `supabase/tests/00_shim.sql`, **antes** das migrations,
reproduzindo o que o Supabase concede por padrão. Não as reconceda em `01_rls_proof.sql`:
isso desfaz os `revoke` das migrations e faz asserção de segurança passar por engano.

Os oito cenários manuais que precisam passar estão no fim de
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#verificação) — cada um reproduz um bug real do
app antigo.
