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
| Framework | Next.js 16, App Router, TypeScript strict | Server Components leem o Postgres sem expor chave; Server Actions substituem `google.script.run` |
| Hospedagem | Vercel | Preview por PR, variáveis de ambiente por ambiente |
| Banco/Auth | Supabase (Postgres + GoTrue + RLS) | RLS move a autorização para o banco — elimina a classe de bug do filtro manual por e-mail |
| Cliente Supabase | `@supabase/ssr` | Sessão via cookie; funciona em Server Component, Server Action e no proxy |
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
- **Privilégio de coluna onde a RLS não alcança.** A RLS decide quais *linhas*; ela não tem
  granularidade de coluna. `profiles` concede `update` apenas em `display_name`, `timezone`,
  `opening_balance_cents` e `opening_balance_on`; `role` e `id` ficam de fora.

  Isto nasceu de um bug real, corrigido na migration 0008: a policy "edite a própria linha"
  combinada com o `grant` amplo que o Supabase dá por padrão permitia a qualquer usuário
  logado rodar `update profiles set role='admin' where id = auth.uid()` e se promover. As
  duas checagens da policy passavam, porque as duas olham só a linha.
- **Cadastro público desligado** no painel do Supabase (Authentication → Sign In / Providers).
  As contas nascem pela API de admin, que ignora essa chave; desligá-la fecha o cadastro aberto.
- **Convite por código, sem e-mail.** Um admin (`profiles.role = 'admin'`) gera um código em
  `/ajustes/convites` e repassa por fora. A pessoa usa em `/entrar` e escolhe e-mail e senha
  ali mesmo. Nenhum e-mail é enviado, e portanto não há dependência de SMTP. O e-mail existe
  só como identificador de login.
  - O banco guarda apenas o `sha256` do código, nunca o código em claro — ele aparece uma
    única vez, na geração. O hash é determinístico (e não bcrypt) porque o resgate precisa
    buscar **pelo** código; com ~116 bits de entropia, pré-computar não leva a lugar nenhum.
  - Uso único e com prazo, garantidos por um `UPDATE` condicional
    (`where status='pending' and expires_at > now()`), que também fecha a corrida entre duas
    pessoas usando o mesmo código.
  - **Bootstrap:** enquanto `profiles` está vazia, `/entrar` dispensa o código e cria a
    primeira conta já como `admin`. Sem essa porta o sistema seria impossível de iniciar —
    convite-só sem nenhum admin não deixa ninguém entrar. Ela fecha sozinha na primeira conta.

    Quem atribui o papel é o trigger `handle_new_user`, na mesma transação do insert em
    `auth.users`. Era um `update` separado feito pela aplicação, que em produção não teve
    efeito e deixou o sistema sem administrador nenhum — e sem volta, porque a porta de
    bootstrap já havia fechado.
- **Chave de serviço** (`SUPABASE_SERVICE_ROLE_KEY`) só é usada em `lib/supabase/admin.ts`,
  módulo marcado `import 'server-only'`: para criar a conta no resgate (quem resgata ainda não
  tem sessão) e para ler o convite pelo hash. As policies de `invites` continuam restritas a
  admin, então anônimo nunca enumera convites. Nunca chega ao cliente.
- `proxy.ts` renova a sessão a cada requisição e redireciona usuário não autenticado
  para `/login`. No Next 16 o antigo `middleware.ts` foi renomeado para `proxy.ts` e a
  função exportada passou a se chamar `proxy`.
- A validação de sessão em servidor é sempre `supabase.auth.getClaims()`, que confere a
  assinatura do JWT contra as chaves públicas do projeto. `getSession()` aceita o que vier
  no cookie sem revalidar — nunca use para proteger rota.

## O que não foi trazido do app antigo

- **Aba "Ciclos".** Existia no backend (`Code.gs.md:80-83`) mas nenhuma função do frontend a
  lia ou escrevia — era código morto. O período que ela tentava representar já é coberto por
  `scenarios.starts_on`/`ends_on`.
- **Contador `parcelasPagas` e campo `valorAtual` de meta como estado mutável isolado** — viram
  fatos derivados de linhas reais (`entries.is_settled`, `SUM(goal_contributions)`).

## Estrutura de pastas alvo

```
app/
  (auth)/login/  (auth)/entrar/        # entrar = resgate de convite / primeira conta
  auth/logout/route.ts
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
  supabase/{client,server,admin,proxy}.ts
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
proxy.ts                      # renomeado de middleware.ts no Next 16
```

Mutações passam por Server Actions, nunca por chamada Supabase direta a partir de Client
Component. A Action valida com Zod, executa, e chama `revalidatePath`. Isso resolve o "estado
não atualiza depois de salvar" do app antigo, onde `updateAll()` precisava ser chamado à mão
em cada handler.

## Assistente de IA (fase 7)

A caixa que convida a contar o que aconteceu e traduz a frase em operações do app. O desenho
inteiro gira em torno de uma frase: **a saída do modelo é dado, nunca comando.**

| Peça | Papel |
|---|---|
| `lib/ai/tools.ts` | O vocabulário da IA: 27 declarações de função, uma por Server Action existente |
| `lib/ai/proposal.ts` | **Puro.** Zod da proposta, o texto em português da confirmação e a tradução para `FormData` |
| `lib/ai/models.ts` | **Puro.** A cadeia de modelos e a regra de queda para o próximo |
| `lib/ai/gemini.ts` | Cliente REST da Interactions API, com `fetch` injetável |
| `lib/ai/context.ts` | O retrato financeiro que vai no prompt, das queries que as telas já usam |
| `lib/ai/jobs.ts` | O ciclo de vida do trabalho: enfileirar, avançar, cair para o próximo, fechar |
| `lib/ai/apply.ts` | Executa a proposta confirmada **chamando as Server Actions**, sem escrever no banco |

### Por que nada disto abre um caminho de escrita novo

O que o modelo devolve vira uma proposta, passa por Zod, é lida por uma pessoa em português e só
então executa — e executa pela mesma Server Action que o formulário da tela usa. Disso decorre
tudo o que importa de graça: a validação, a exigência de `settled_on` quando liquidado, as
guardas `.eq()` + `.select()` com verificação de linha casada, o `revalidatePath`.

A autorização continua sendo da RLS. Um id de outra pessoa numa proposta não casa linha nenhuma
e volta como "não encontrado" — e é assim que tem de ser: uma checagem de dono em JavaScript aqui
seria a segunda fonte de verdade que o app antigo tinha, e que errava.

### Por que o trabalho é uma linha no banco

A Interactions API do Gemini tem execução em background: `background: true` devolve um `id` na
hora e o Google segura a execução. `ai_jobs` guarda o ponteiro. Fechar o app no meio de uma frase
não perde nada, e é isso que permite avisar depois, por Web Push.

Três caminhos fecham um trabalho, e os três chamam o mesmo `advanceJob`:

1. o poll do cliente, enquanto a folha está aberta;
2. o `after()` do Next, que roda **depois** de a resposta sair e sobrevive ao navegador fechar;
3. a varredura do cron, em `/api/ai/sweep`, uma vez por dia.

O peso entre os três não é igual. A varredura é diária porque o plano Hobby da Vercel recusa o
deploy com qualquer coisa mais frequente, então quem fecha o trabalho de quem escreveu e fechou o
app é o `after()` — e é por isso que o orçamento de `trackJob` é dimensionado para cobrir o prazo
de interpretar mais uma queda de modelo, em vez de um valor redondo qualquer. A varredura é a rede
de segurança para o que escapou.

O pedido inteiro — prompt, instrução e os rótulos dos ids — fica gravado em `ai_jobs.input`. Sem
isso a varredura não conseguiria trocar de modelo: ela roda sem sessão, e remontar o contexto
exige queries que passam pela RLS. Não é cópia de dado de domínio (invariante 6): é o registro do
que foi perguntado, e o lançamento continua morando só em `entries`.

### A cadeia de modelos

Ordem de lançamento, do mais recente para o mais antigo, em `DEFAULT_MODEL_CHAIN` e
sobrescritível por `GEMINI_MODELS`. A escolha manual em `/ajustes/ia` é o **ponto de partida**,
não uma amarra: passado o prazo do tipo de trabalho (20s para interpretar, 45s para o resumo), ou
diante de 429/404/5xx, a interação é cancelada e a pergunta segue para o próximo da cadeia. Um
modelo aposentado gravado em `profiles.ai_model` não trava nada — cai de volta no mais recente.

### Onde a chave mora

`GEMINI_API_KEY` e `VAPID_PRIVATE_KEY` são lidas por `lib/ai/env.ts`, que abre com
`import 'server-only'`. O invariante 4 continua valendo sem alteração: a
`SUPABASE_SERVICE_ROLE_KEY` não saiu de `lib/supabase/`. A varredura usa
`lib/supabase/sweeper.ts`, separado de `admin.ts` de propósito — o docblock de lá diz "existe por
um único motivo: emitir convites", e alargar aquele escopo em silêncio aposentaria um guarda.

### O invariante 14 numa rota de cron

`/api/ai/sweep` não tem sessão, então `is_admin()` não tem o que conferir. O que o invariante
protege — chave de serviço usada com base numa autorização que ninguém checou — continua valendo,
cumprido em outro tempo: quem autorizou foi o **enfileiramento**, na sessão da pessoa, sob a
policy `own rows: insert`; a varredura só lê o `user_id` de uma linha que a RLS já carimbou. A
rota em si é autorizada por `CRON_SECRET`, comparado em tempo constante. O raciocínio completo
está escrito no topo do arquivo, porque quem o ler depois vai bater o olho no invariante e
precisar da resposta ali.

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

**Cenários do assistente (fase 7):**

9. "paguei 87,50 no mercado hoje" propõe **uma** despesa de 8750 centavos na data de hoje em
   `America/Sao_Paulo` — não 87 centavos, não o dia anterior.
10. "aluguel de 2.400 todo dia 10" propõe conta fixa mensal, não um lançamento avulso.
11. "comprei uma geladeira em 3x de 100" gera parcelas que somam exatamente 30000 centavos.
12. "apaga o lançamento do mercado" mostra **qual** lançamento, em vermelho, e nada some antes do
    Confirmar.
13. Descartar a proposta não escreve nada em lugar nenhum.
14. Com `GEMINI_MODELS` apontando para um modelo inexistente seguido de um válido, o trabalho cai
    no segundo e termina; `ai_jobs.model` registra qual respondeu.
15. Enviar uma frase, fechar o app e reabrir: o trabalho aparece concluído em `/assistente`.
16. Resumo desligado em `/ajustes/ia` → o botão "Ver resumo" não existe no Início nem em
    `/assistente`.
17. Usuário A não vê trabalho nem inscrição de push do usuário B.

**Produção:** deploy na Vercel com preview por PR; `Site URL`/`Redirect URLs` do Supabase
apontando para produção e para os previews; `supabase db push` no projeto remoto; conferir
`get_advisors` (segurança e performance) sem alertas críticos antes de liberar convites.
