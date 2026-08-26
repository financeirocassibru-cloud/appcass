# Arquitetura — App de Finanças Pessoais

> Este documento é a fonte de verdade para as sessões que vão **implementar** o app.
> Decisões de produto já foram tomadas (ver "Decisões fechadas" abaixo) — não reabra essas
> discussões sem um motivo concreto encontrado durante a implementação. Detalhe do schema
> está em [`DATA-MODEL.md`](./DATA-MODEL.md), plano de execução em [`ROADMAP.md`](./ROADMAP.md),
> diretrizes visuais em [`DESIGN.md`](./DESIGN.md), passos manuais em [`SETUP.md`](./SETUP.md).

## Contexto

Este repositório continha um app de finanças pessoais rodando como Google Apps Script, cujo
código-fonte está preservado em `legacy/google-apps-script/` (backend em `Code.gs.md`, frontend
em `Index.html.md`). O app funcionava, mas tinha bugs de origem estrutural — não pontuais.
Este projeto reconstrói o app do zero como aplicação Next.js na Vercel, com Postgres no
Supabase, preservando as boas ideias (lançamento rápido, custos fixos, parcelas, metas,
projeção de saldo dia a dia) e corrigindo as causas-raiz no próprio modelo de dados.

### Bugs do app antigo que motivam decisões de arquitetura

| Problema | Onde (código legado) | Consequência | Como este projeto evita |
|---|---|---|---|
| Login por e-mail sem checar senha (`verificarUsuarioExiste`) | `Code.gs.md:198-229` | Acesso à conta alheia sabendo só o e-mail | Auth via Supabase (GoTrue), sem rota de "login automático" por e-mail |
| Senha em SHA-256 sem salt | `Code.gs.md:116-126` | Vulnerável a rainbow table | Hash de senha delegado ao Supabase Auth (bcrypt) |
| Autorização feita por `filter(d => d[1] === email)` no código de aplicação | `Code.gs.md:320`, `773-808` | Um erro de filtro vaza dado de outro usuário | RLS no Postgres — autorização é propriedade do banco, não do código |
| Categorias sem coluna de usuário | `Code.gs.md:71-73` | Categorias globais, compartilhadas entre todos | `categories.user_id`, RLS por dono |
| `Planejamentos.dadosJSON` copia gastos/rendas/fixos/parcelas/metas e sincroniza nos dois sentidos | `Index.html.md` (`syncGlobalDataToPlan`/`syncPlanToGlobal`) | Duas fontes de verdade divergem | Cenários guardam só o *delta* (`scenario_overrides`), nunca cópia |
| `atualizarFixo` grava 7 colunas numa aba de 9 | `Code.gs.md:705-717` vs `56-59` | Erro "número de colunas inválido" ao editar | Schema relacional com colunas nomeadas e tipadas |
| Dinheiro em `float` (`valorTotal / parcelas`) | `Code.gs.md:1025` | Centavos somem/sobram | Todo valor é `bigint` em centavos; divisão via `splitCents` |
| Meta rateada por `valorTotal / quantidade de meses do plano` | `Index.html.md` (`syncGlobalDataToPlan`) | Ignora a data-objetivo real da meta | Aporte mensal calculado a partir de `target_date` |
| Ativação de planejamento desativa os demais em `await` sequenciais | `Index.html.md:3355-3379` | Falha no meio deixa dois "ativos" | Índice único parcial `scenarios (user_id) where is_active` — o banco garante atomicidade |
| Aba `Ciclos` existe no backend, nenhuma função do frontend a usa | `Code.gs.md:80-83`, `470-492` | Código morto | Não reconstruído — ver "O que não foi trazido" |
| Todas as abas lidas por inteiro a cada carregamento | `Code.gs.md:289-310` | Não escala, sem paginação | Queries por página/intervalo de data |
| `parcelasPagas` é um contador mutável | `Code.gs.md:66-69` | Diverge do que foi realmente pago | Parcela paga é uma linha real em `entries` com `is_settled` |
| Datas via `new Date(string)` sem timezone | `Code.gs.md:866-909`, `Index.html.md:953,1008` | Lançamento "pula" um dia | Datas de competência são `date` puro (`YYYY-MM-DD`), sem `Date` do JS em cálculo de calendário |
| `eventDate.toISOString().split('T')[0]` sobre horário local | `Index.html.md:2020,2064` | Em UTC−3 o evento grava no dia anterior | `todayISO()`/formatação sempre fixadas em `America/Sao_Paulo`, nunca via `toISOString` |
| Agenda de eventos retorna vazia se não há planejamento ativo | `Index.html.md:1991-1992` | Lista de contas a pagar some sem aviso | Agenda de próximos eventos é calculada sempre, independe de cenário |

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Acesso | Multiusuário **por convite** — cadastro público desligado no Supabase Auth |
| Dados do app antigo | **Não migrar.** Começar do zero; só as categorias-semente são recriadas |
| "Planejamentos"/"Ciclos" | Redesenhados como **Cenários de projeção**, sem blob JSON |
| Interface | Redesenhada do zero, mobile-first, estética de **banco digital** |
| Escopo do MVP | Lançamentos + dashboard, custos fixos, parcelas, projeção de fluxo diário, metas — as quatro entram juntas |

**Estado do Supabase neste momento:** nenhum projeto criado ainda; nenhuma credencial configurada
neste ambiente. As migrations vivem versionadas em `supabase/migrations/` e são aplicadas via
Supabase CLI — nada é criado por chamada direta de API/MCP a um projeto que ainda não existe.
Os passos manuais de criação do projeto estão em [`SETUP.md`](./SETUP.md).

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | Server Components leem o Postgres sem expor chave; Server Actions substituem `google.script.run` |
| Hospedagem | Vercel | Preview por PR, variáveis de ambiente por ambiente |
| Banco/Auth | Supabase (Postgres + GoTrue + RLS) | RLS move a autorização para o banco — elimina a classe de bug do filtro manual por e-mail |
| Cliente Supabase | `@supabase/ssr` | Sessão via cookie; funciona em Server Component, Server Action e middleware |
| Estilo | Tailwind CSS v4 + shadcn/ui | Componentes acessíveis, tema por CSS variables |
| Gráficos | Recharts | Componentes React nativos; substitui o Chart.js via CDN |
| Validação | Zod | Um schema por entidade, reaproveitado no formulário e na Server Action |
| Formulários | React Hook Form + `@hookform/resolvers/zod` | |
| Datas | date-fns + date-fns-tz | Aritmética de calendário explícita, sem depender do fuso do processo |
| PWA | `@serwist/next` | O app antigo era instalável; mantém a característica |
| Testes | Vitest (unidade) + Playwright (e2e) | |
| CI | GitHub Actions: typecheck, lint, test, build | Roda em todo PR |

**Convenção de idioma:** identificadores de banco e código em inglês (`entries`,
`amount_cents`); textos de interface em português. O app antigo misturava os dois, o que
gerava nomes com acento e bugs silenciosos de comparação de string.

## Princípios do modelo de dados

Detalhe completo do schema em [`DATA-MODEL.md`](./DATA-MODEL.md). Três decisões resolvem a
maior parte dos bugs herdados:

1. **Uma tabela de lançamentos.** Gastos e rendas viram `entries` com uma coluna `kind`. Elimina
   a duplicação de CRUD que existia entre `Gastos` e `Rendas` no app antigo.
2. **Geradores materializam lançamentos reais.** Custo fixo e parcelamento não são "itens
   paralelos" mantidos por fora — eles produzem linhas em `entries` rastreadas por
   `source`/`source_id`/`occurrence_key`. Marcar como pago deixa de ser um contador solto e
   passa a ser um fato com data.
3. **Cenário guarda só a diferença.** Nenhuma tabela duplica dados de outra. Um cenário de
   projeção referencia os dados reais e registra apenas os desvios
   (`scenario_overrides`) e os itens hipotéticos que só existem ali (`scenario_entries`).

### Regras invioláveis sobre dinheiro e datas

- Todo valor monetário é `bigint` de centavos (`amount_cents`) — nunca `float`/`numeric`.
  Rateios usam `splitCents()`, que garante que a soma das partes bate com o total.
- Data de competência é `date` puro (sem hora, sem timezone), transportado como string
  `YYYY-MM-DD`. Carimbos de auditoria (`created_at`, etc.) são `timestamptz`.
- É proibido usar `new Date("2026-03-05")` para cálculo de calendário — isso interpreta a
  string como UTC e desloca o dia em fusos negativos. "Hoje" vem de uma função `todayISO()`
  fixada em `America/Sao_Paulo`.

## Motor de projeção

O motor de projeção de fluxo de caixa é a peça mais valiosa do app antigo (`calcularFluxoDiario`
em `Code.gs.md:913-1077`, `calculatePlanningProjection`/`calculateDailyFlow` no frontend) e
também a mais frágil. Na reconstrução ele vive em `lib/finance/`, como código puro e testável,
sem I/O — ver o pipeline completo e as invariantes matemáticas em
[`DATA-MODEL.md`](./DATA-MODEL.md#motor-de-projeção).

## Segurança

- **RLS em todas as tabelas.** Toda linha carrega `user_id`; as policies usam
  `(select auth.uid())` — avaliado uma vez por consulta, não por linha.
- **Cadastro público desligado** no painel do Supabase (Authentication → Sign In / Providers).
  É essa opção que fecha a porta — nenhuma policy de RLS substitui isso.
- **Convite:** um admin (`profiles.role = 'admin'`) convida por e-mail via
  `supabase.auth.admin.inviteUserByEmail`; o convidado define senha; um trigger cria o perfil
  e as categorias-semente daquele usuário.
- **Chave de serviço** (`SUPABASE_SERVICE_ROLE_KEY`) só é usada em `lib/supabase/admin.ts`,
  módulo marcado `import 'server-only'`, exclusivamente para emitir convites. Nunca chega ao
  cliente.
- `middleware.ts` renova a sessão a cada requisição e redireciona usuário não autenticado
  para `/login`.

## O que não foi trazido do app antigo

- **Aba "Ciclos".** Existia no backend (`Code.gs.md:80-83`) mas nenhuma função do frontend a
  lia ou escrevia — era código morto. O período que ela tentava representar já é coberto por
  `scenarios.starts_on`/`ends_on`.
- **Contador `parcelasPagas` e campo `valorAtual` de meta como estado mutável isolado** — viram
  fatos derivados de linhas reais (`entries.is_settled`, `SUM(goal_contributions)`).

## Estrutura de pastas alvo

```
app/
  (auth)/login/  (auth)/definir-senha/  auth/callback/route.ts
  (app)/layout.tsx            # header com saldo + bottom nav
  (app)/page.tsx              # Início: saldo, próximos eventos, gráficos
  (app)/lancamentos/          # extrato: filtros por mês, categoria, pago/pendente
  (app)/novo/                 # lançamento rápido
  (app)/recorrentes/          # custos fixos + rendas recorrentes
  (app)/parcelas/
  (app)/metas/
  (app)/projecao/             # fluxo diário + cenários
  (app)/ajustes/{perfil,categorias,convites}/
  manifest.ts
components/
  ui/                         # shadcn
  finance/                    # BalanceHero, EntryRow, MoneyInput, CategoryPill,
                               # DailyFlowChart, CategoryDonut, UpcomingList
lib/
  supabase/{client,server,admin,middleware}.ts
  finance/{money,date,recurrence,installments,goals,projection,types}.ts
  db/queries/{entries,recurring,installments,goals,scenarios,categories}.ts
  actions/                    # Server Actions, uma por caso de uso
  validation/                 # schemas Zod por entidade
supabase/
  migrations/                 # 0001_extensions.sql … 0007_views.sql
  seed.sql
tests/
  unit/                       # Vitest sobre lib/finance
  rls/                        # dois usuários reais; cada um só enxerga o próprio
  e2e/                        # Playwright
docs/                         # este diretório
middleware.ts
```

Mutações passam por Server Actions, nunca por chamada Supabase direta a partir de Client
Component. A Action valida com Zod, executa, e chama `revalidatePath`. Isso resolve o "estado
não atualiza depois de salvar" do app antigo, onde `updateAll()` precisava ser chamado à mão
em cada handler.

## Verificação

**Local**
```bash
npx supabase start && npx supabase db reset   # aplica migrations + seed no Postgres local
npm run typecheck && npm run lint
npm run test           # Vitest — lib/finance
npm run test:rls       # dois usuários; cada um só enxerga o próprio dado
npm run test:e2e       # Playwright: login → lançar gasto → ver no saldo → projeção
npm run dev
```

**Cenários manuais que precisam passar** (cada um reproduz um bug real do app antigo):

1. Custo fixo com vencimento dia 31 aparece em 28/02 (ou 29 em ano bissexto) — não some.
2. Parcelamento de R$ 100,00 em 3× gera 33,34 + 33,33 + 33,33 — soma exata.
3. Marcar o mesmo custo fixo como pago duas vezes não duplica o lançamento.
4. Editar um custo fixo salva sem erro de "número de colunas inválido".
5. Lançamento em 01/03 continua em 01/03 depois de recarregar — sem deslocar um dia.
6. Usuário A não vê categoria nem lançamento do usuário B.
7. Ativar um cenário desativa o anterior atomicamente — nunca dois ativos ao mesmo tempo.
8. Editar um valor dentro do cenário não altera o lançamento real correspondente.

**Produção:** deploy na Vercel com preview por PR; `Site URL`/`Redirect URLs` do Supabase
apontando para produção e para os previews; `supabase db push` no projeto remoto; conferir
`get_advisors` (segurança e performance) sem alertas críticos antes de liberar convites.
