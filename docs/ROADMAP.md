# Roadmap de implementação

Cada fase deve fechar como um PR isolado, com testes verdes, antes de começar a próxima.
A Fase 0 é pré-requisito de todas as demais. Contexto e "porquê" de cada peça estão em
[`ARCHITECTURE.md`](./ARCHITECTURE.md) e [`DATA-MODEL.md`](./DATA-MODEL.md).

## Fase 0 — Fundação

Scaffold Next.js 16 + TypeScript strict + Tailwind v4. Clientes Supabase
(`lib/supabase/{client,server,admin,proxy}.ts`) e `proxy.ts` na raiz. CI no GitHub Actions
(typecheck, lint, test, build). Configuração de Vitest e Playwright, mesmo sem testes ainda.

**Pronto quando:** `npm run build`, `npm run lint`, `npm run typecheck` e `npm run test`
passam; o app sobe localmente com uma página vazia.

## Fase 1 — Banco e autenticação

Migrations `0001_extensions.sql` … `0007_views.sql` conforme [`DATA-MODEL.md`](./DATA-MODEL.md).
Telas de login, definir senha, callback de auth, logout, guarda de rota no proxy. Tela
de convites (`/ajustes/convites`) restrita a `is_admin()`. Trigger de criação de perfil +
categorias-semente.

**Pronto quando:** dois usuários de teste existem e um teste de RLS prova que nenhum lê a
linha do outro (tabelas `entries` e `categories` no mínimo); cadastro público está
comprovadamente desligado no projeto Supabase (ver [`SETUP.md`](./SETUP.md)).

## Fase 2 — Núcleo financeiro (`lib/finance`)

`money.ts`, `date.ts`, `recurrence.ts`, `installments.ts`, `goals.ts`, `projection.ts` —
puros, sem I/O algum. Escrever **antes** de qualquer tela que os consuma.

**Pronto quando:** Vitest cobre:
- `splitCents` — property test da invariante "soma das partes = total".
- `clampDayToMonth` — dia 31, fevereiro bissexto e não bissexto.
- Expansão de recorrência respeitando `ends_on`.
- Dedupe de ocorrência projetada que já existe como `entry` real.
- Saldo acumulado corretamente calculado partindo de saldo inicial negativo.

## Fase 3 — Lançamentos + dashboard

CRUD de `entries` e `categories` via Server Actions. Tela de extrato com filtros (mês,
categoria, pago/pendente). Fluxo de lançamento rápido (`/novo`). Tela Início com saldo,
próximos eventos e gráficos (ver [`DESIGN.md`](./DESIGN.md)).

**Pronto quando:** dá para registrar um gasto no celular em dois toques e ele aparece
imediatamente no saldo do mês, sem recarregar a página manualmente.

Entregue em dois PRs: **3a** (shell de navegação, `/novo`, extrato, categorias) e **3b** (tela
Início — herói de saldo, agenda de pendentes e gráficos). A 3b acrescentou uma peça que esta
descrição não previa: **`/ajustes/saldo`**, onde a pessoa informa quanto tem hoje. Sem essa
âncora o saldo do Início seria um número errado apresentado com confiança, que é pior que não
mostrar nada. As colunas `profiles.opening_balance_cents` e `opening_balance_on` já existiam no
schema para isso desde a migration 0003.

## Fase 4 — Recorrentes e parcelas

CRUD de `recurring_rules` e `installment_plans`. Geração cent-exata das N parcelas no momento
da criação do plano (via `splitCents`). "Marcar como pago" materializa a ocorrência de forma
idempotente (upsert respeitando o índice único `entries_generated_uniq`).

**Pronto quando:** marcar o mesmo custo fixo como pago duas vezes não cria dois lançamentos;
a soma das parcelas geradas bate exatamente com o valor total da compra, centavo a centavo.

## Fase 5 — Projeção e cenários

Tela `/projecao` com fluxo diário, gráfico de saldo projetado e destaque visual dos dias em
que o saldo fica negativo. CRUD de cenários com overrides (incluir/excluir item, mudar valor,
mudar data) e itens hipotéticos (`scenario_entries`).

**Pronto quando:** alterar um override muda a projeção exibida sem escrever em nenhuma tabela
de dado real (`entries`, `recurring_rules`, etc.).

## Fase 6 — Metas, PWA e acabamento

Metas com aportes (`goal_contributions`) e progresso sempre derivado por `SUM`, nunca
armazenado como campo solto. Configuração do Serwist (service worker, manifest, ícones,
shell offline). Estados vazios, skeletons de carregamento, error boundaries, toasts de
feedback.

**Pronto quando:** o app é instalável como PWA no celular e funciona (leitura, ao menos) sem
rede após o primeiro carregamento.
