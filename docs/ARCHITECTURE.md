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
  (app)/historico/            # histórico: filtros por mês, categoria, pago/pendente; editar e excluir
  (app)/novo/                 # lançamento rápido
  (app)/recorrentes/          # custos fixos + rendas recorrentes
  (app)/parcelas/
  (app)/metas/
  (app)/analise/              # janela passado+futuro, escala dia/semana/mês, cenários, análises mensais
  (app)/ajustes/{perfil,categorias,convites}/
  manifest.ts
components/
  ui/                         # shadcn
  finance/                    # BalanceHero, EntryRow, MoneyInput, CategoryPill,
                               # DailyFlowChart, CategoryDonut, UpcomingList
lib/
  supabase/{client,server,admin,proxy}.ts
  finance/{money,date,recurrence,installments,goals,projection,buckets,series,types}.ts
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
| `lib/ai/triage.ts` | **Puro.** O rascunho da conversa: Zod, a leitura em português e o bloco do prompt |
| `lib/ai/briefing.ts` | A chamada da triagem — sem contexto, sem ferramentas, sem background |
| `lib/ai/edits.ts` | **Puro.** A lista branca dos ajustes da tela de confirmação |
| `lib/ai/json.ts` | **Puro.** Lê o JSON do modelo tolerando cerca de markdown e frase em volta |
| `lib/ai/insights.ts` | O resumo: o retrato com histórico, o executor no pedido e a leitura do texto |

### Os dois tempos da conversa (fase 7b)

Escrever uma frase não dispara mais o caminho pesado de uma vez. São dois tempos, e a
diferença entre eles é o que a experiência pedia.

**Primeiro tempo — a triagem.** Uma chamada curta, **sem nenhuma query ao banco, sem
ferramenta e sem background**, que responde três coisas: isto é assunto deste app? o que
dá para preencher? como dizer isso em português? Em um ou dois segundos a pessoa lê o que
a IA entendeu e corrige ali mesmo se estiver errado. Nada foi gravado em lugar nenhum.

**Segundo tempo — a proposta.** Só depois do "É isso" nasce a linha em `ai_jobs`, com o
retrato financeiro, as 27 ferramentas e o rascunho já aprovado num bloco próprio do
prompt. Esse bloco não é economia de tokens: é o que evita a proposta contradizer o que a
pessoa acabou de confirmar.

Por que a triagem **não** é um trabalho no banco: `ai_jobs` existe para o trabalho
sobreviver ao app fechar, e isso vale quando perder o trabalho custaria a frase da pessoa.
A triagem custa uma chamada de um segundo e é re-derivável. Somado a isso, a 0012 revoga
`update` em `ai_jobs.input` de propósito — acrescentar falas a uma linha existente é
impossível sem migration nova. As duas coisas apontam para o mesmo desenho: a conversa
vive no cliente e entra no banco de uma vez, no `insert` da aprovação.

A triagem **nunca pode ser um jeito novo de a tela travar**. Toda falha dela devolve
`null` e o app segue pelo caminho que já tinha (`submitMessage`, agora caminho de
reserva). Ela é uma gentileza, não uma dependência.

### Ajustar a proposta sem abrir uma porta

`confirmProposal` relia a proposta do banco e não confiava no corpo do formulário, e era
isso que tornava verdadeira a frase "foi isto que a IA propôs". Deixar a pessoa corrigir um
valor parece exigir jogar isso fora. Não exige, e a divisão é esta:

- **a identidade continua vindo do banco.** Qual operação é, e em que linha ela mexe, sai
  de `ai_jobs.result`. `op`, `id`, `rule_id`, `goal_id` e `scenario_id` não são editáveis;
- **só o que uma pessoa digitaria muda** — valor, data, descrição, categoria, liquidado —
  e a mesclagem inteira passa de novo pelo `operationSchema`.

A lista branca está em `lib/ai/edits.ts`, e o motivo dela é específico: a RLS barra um id de
outra pessoa, mas **não** barraria trocar "apague o lançamento do mercado" por "apague o
salário" — as duas linhas são dela. Operação que apaga não tem campo para ajustar; o que se
faz com ela é remover da proposta.

### O diagnóstico não é um trabalho (fase 7c)

**Na tela ele se chama Diagnóstico; no código, `insights`.** O invariante 10 pede
identificadores em inglês e interface em português, então `ai_insights_enabled`,
`runInsights` e o enum `ai_job_kind` continuam como estão — só o texto que a pessoa lê
mudou.

O diagnóstico mora em `/projecao`, **não** passa por `ai_jobs` e **não é gravado**. Três decisões
que vêm do mesmo lugar.

**Texto livre, não formato fixo.** A primeira versão pedia `{summary, tips}`, mandava um
`response_format` e validava com Zod. Pareceu prudente e falhou três vezes em produção, sempre
com o conteúdo certo na mão: um modelo devolve a mesma coisa em mil formas ligeiramente
diferentes, e prever cada uma é uma corrida que não se ganha. Agora a validação inteira é "veio
texto?". Some com isso uma classe de falha, e de lado some a dependência do `response_format`.

**Nada gravado.** O diagnóstico não era um registro, era uma leitura. Guardá-lo acumulava análises
que ninguém ia reler, no mesmo histórico dos lançamentos que a pessoa de fato pediu. Ele roda
dentro do pedido, por `runInsights`, e volta como texto na resposta da Server Action. Quem
quiser guardar, copia — a tela tem o botão.

A consequência está dita na tela e não escondida: **enquanto o diagnóstico é gerado, a pessoa precisa
ficar ali.** Sem linha no banco não há varredura para retomar nem push para chamar de volta. Foi
a troca aceita, porque refazer um diagnóstico custa um toque e manter um histórico de coisas que
ninguém consulta custa para sempre. É por isso também que `/projecao` declara `maxDuration = 60`:
a action roda sob o orçamento da rota que a serve.

O valor `insights` continua no enum `ai_job_kind` — migrations são imutáveis (invariante 16) —
e as três linhas antigas seguem lá, terminais. Simplesmente não se cria mais nenhuma.

**O aviso de privacidade mudou junto, e não por estilo.** `/ajustes/ia` dizia que o resumo
enviava "totais já calculados". Deixou de ser verdade no instante em que o diagnóstico passou a
ler os lançamentos do período, então a tela passou a dizer o que de fato sai: descrição, valor,
data e categoria de cada lançamento pedido. Num app de dinheiro, um aviso de privacidade
desatualizado é pior que nenhum — ele promete uma coisa e o código faz outra.

**O histórico de verdade.** Antes o modelo recebia só agregados e nenhum lançamento; o prompt
saía com 492 caracteres, e com tão pouco na mão ele tinha pouco a dizer. Agora ele lê os
lançamentos dos últimos N dias, com N escolhido na tela (campo livre, 1 a 60), por
`listEntriesInRange`. O período não é guardado: é uma escolha do momento.

Por que uma query nova em vez de reaproveitar: `listEntriesByMonth` recorta por mês de
calendário, e `listRecentEntries(N)` **não tem limite superior de data** — uma conta a pagar do
mês que vem consome o limite, e quem tem muitas contas futuras receberia zero lançamento dos
últimos N dias. Seria um bug silencioso.

### Dois bugs que este desenho fechou

**O trabalho que ficava preso para sempre.** `advanceJob` só colhia o resultado com
`status === 'completed'`, e `shouldFallback` listava os status "em andamento" pelo NOME —
`undefined` e `'in_progress'`. Uma interação com ferramentas para em `requires_action`
esperando o retorno das chamadas, e este app é o lado que **não** responde ferramenta: ele
propõe a operação a uma pessoa. Fora da lista, o prazo nunca era avaliado, e nem o poll,
nem o `after()`, nem a varredura conseguiam fechar a linha. Agora `shouldFallback` pergunta
"o status é final?" — um backstop que nenhum status novo da API consegue furar — e
`advanceJob` colhe pela presença da chamada, não pelo nome do status.

**O resumo que voltava "em formato inesperado".** A instrução do sistema não pedia JSON:
apostava tudo em o provedor honrar o `response_format`. E `parseInsights` fazia `JSON.parse`
cru, então o mesmo objeto correto dentro de uma cerca ```json era descartado. O contrato
agora está escrito no prompt e a leitura passa por `parseLooseJson`. O `response_format`
segue com `type: 'text'` de propósito: o corpo atual é aceito, e um `type` que a API não
reconheça derrubaria o corpo inteiro com 400 — que não é retentável.

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

### A janela da Análise (v1.0 — 2026-09-27)

A Projeção virou **Análise** e passou a atravessar passado e futuro numa curva só. Três coisas
valem registro porque foram erros pegos no caminho, e não escolhas de estilo:

- **A janela nunca começa antes da âncora do saldo.** `getCurrentBalance(d)` com `d` anterior à
  âncora cai no atalho de janela vazia e devolve o próprio valor dela — que já embute tudo o que
  foi liquidado antes. Acumular esses lançamentos em cima disso os contaria **duas vezes**,
  falsificando o histórico e, pela costura em `today`, o saldo de hoje. Antes da âncora o app não
  sabe qual era o saldo, e a tela diz isso em vez de desenhar zero.
- **Recorrência, meta e cenário são expandidos de `max(from, hoje)`, nunca de `from`.**
  `expandGoal` divide o que falta pelos meses **da janela**: com um `from` no passado, o aporte
  futuro sai menor, sem erro e sem aviso. E `expandRecurringRule` com `from` no passado ressuscita
  a conta fixa do mês passado que nunca virou lançamento.
- **Uma janela inteiramente no passado descarta o vencido** em vez de somá-lo num dia qualquer:
  empurrá-lo para um dia passado fabricaria história que contradiz os liquidados daquele mesmo
  dia. O total sai em texto, dizendo que conta a partir de hoje.

`projectRange` continua existindo e intocada, ao lado de `projectWindow`. As duas não são a mesma
função com um parâmetro a mais: `projectRange` exige que o chamador já tenha rodado
`entriesAheadOf` e `rollOverdueTo`, e um booleano que ligasse e desligasse a prevenção de
contagem em dobro teria exatamente a forma do bug que ela previne.
`tests/unit/projection-span.test.ts` prova que, com `from = hoje`, as duas devolvem a mesma série.

**O agregado não esconde o mergulho.** O ponto de um bucket é o saldo de **fechamento**, nunca a
média, e o piso do período viaja junto. O domínio do eixo vem do piso, não dos fechamentos: com os
fechamentos, uma terça a −R$ 800 numa semana que fecha positiva sai fora da escala e o gráfico
afirma que o saldo nunca ficou negativo. O alerta de texto continua apontando o **dia**, porque
sai da série diária antes de qualquer agrupamento.

**Constantes puras não podem morar na camada de query.** `MAX_WINDOW_DAYS` e `ANALYSIS_MONTHS`
moram em `lib/finance/`, e não em `lib/db/queries/`, porque a tela valida a URL com elas — e
importá-las de lá arrastaria `lib/supabase/server` para o bundle do navegador. O `next build`
recusa, e é o invariante 4 sendo cobrado pela ferramenta.

**Tela cheia em paisagem, e o que não existe.** `requestFullscreen` não existe no Safari do
iPhone; `screen.orientation.lock` não existe em nenhum Safari e exige fullscreen onde existe. A
expansão é em três camadas independentes — camada `fixed inset-0`, depois fullscreen, depois o
lock — e cai na rotação por CSS onde as duas últimas faltam. Enquanto um formulário está aberto a
rotação sai de cena: num conteúdo girado 90° o teclado sobe pelo lado físico e cobre o campo.
`manifest.orientation` teve de virar `'any'`: com `'portrait'` o sistema não gira o PWA instalado
de jeito nenhum.

**Dois detalhes que a ferramenta pegou e valem lembrar:** `flushSync` é obrigatório antes de
`requestFullscreen()`, senão a camada ainda não existe e a chamada nunca acontece (um `await` no
lugar gastaria a ativação do usuário); e a variante `landscape:` lê a orientação do **aparelho**,
que está em retrato exatamente quando a rotação é por CSS — ali a decisão de layout tem de vir do
estado.

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
16. Diagnóstico desligado em `/ajustes/ia` → o botão "Ver diagnóstico" não existe em
    `/projecao` (e não fica acinzentado: ele não é renderizado).
17. Usuário A não vê trabalho nem inscrição de push do usuário B.

**Cenários da conversa em dois tempos (fase 7b):**

18. "Recebi dois mil ontem. fui ao mercado hoje e já gastei 200 reais" devolve o briefing em
    segundos, com **dois** itens e as duas datas certas, e nenhum trabalho fica `em
    andamento` além do prazo. Era a frase que travava para sempre.
19. "que horas são?" recebe resposta de que não é assunto financeiro, e **nenhuma linha é
    criada em `ai_jobs`**.
20. Corrigir por frase ("na verdade foram 250 no mercado") gera novo briefing sem enfileirar
    trabalho nenhum entre os dois.
21. Ajustar um valor na tela de aprovação registra o valor **ajustado**, e o histórico marca
    o pedido como editado.
22. Tentar reapontar uma exclusão para outro lançamento não muda o alvo — a lista branca de
    `lib/ai/edits.ts` ignora o campo.
23. A espera é narrada pela IA: "Um instante…" na hora e a fala dos 15 segundos depois, as duas
    como balões. Ligar "Mostrar as etapas" não adianta a segunda.

**Cenários do diagnóstico (fase 7c):**

24. O diagnóstico aparece em `/projecao` e **não** no Início nem em `/assistente`, e em nenhum
    lugar da interface ele é chamado de "resumo".
25. Pedir o diagnóstico devolve **texto corrido** em português, sem lista de dicas.
26. Nenhuma linha nova em `ai_jobs` com `kind = 'insights'` depois de pedir o diagnóstico — a
    consulta `select count(*) from ai_jobs where kind = 'insights'` não muda.
27. Campo de período: 60 e 1 funcionam; 90 é recortado em 60; **campo vazio cai em 30, não em
    1** — `Number('')` é `0`, e sem o corte o piso daria um resumo de um dia só.
28. O botão Copiar põe o texto na área de transferência; barrada, a tela diz isso em vez de
    não fazer nada.

**Cenários do Histórico e da Análise (v1.0 — 2026-09-27):**

29. `/lancamentos` e `/projecao` redirecionam para `/historico` e `/analise`, com a query
    preservada — `/lancamentos?status=pendente` chega com o filtro intacto.
30. Tocar numa linha do Histórico abre a edição; salvar muda o valor na lista **e na Análise**.
    Excluir remove. Uma parcela mostra o aviso de que faz parte de um plano.
31. O ponto de **hoje** na Análise mostra exatamente o mesmo saldo que o herói do Início — é a
    costura entre fato e previsão, e é onde a contagem em dobro apareceria.
32. Arrastar o gráfico para trás revela o passado e **para** na data da âncora, com a frase
    explicando o corte. A vista não salta quando a janela amplia, e não há uma requisição por
    quadro do gesto.
33. Trocar dia → semana → mês mantém período e cenário. Numa semana que fecha positiva mas teve
    um dia negativo, a linha do piso aparece e o alerta de texto nomeia **o dia**.
34. Tocar num ponto abre o detalhamento **do período** tocado: na escala semanal, os lançamentos
    da semana inteira, com a data em cada linha.
35. Duplo toque (ou o botão) abre em tela cheia; lançar, alterar e excluir funcionam ali e o
    gráfico atualiza sem fechar; `Escape` e o botão voltar do Android fecham e devolvem o retrato.
36. Com um cenário escolhido aparecem as duas curvas — com e sem ele. Um ajuste só afeta de hoje
    para frente e **não** altera nenhum lançamento real (é o cenário 8, por outro caminho).

**Produção:** deploy na Vercel com preview por PR; `Site URL`/`Redirect URLs` do Supabase
apontando para produção e para os previews; `supabase db push` no projeto remoto; conferir
`get_advisors` (segurança e performance) sem alertas críticos antes de liberar convites.
