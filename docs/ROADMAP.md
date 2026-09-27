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

Tela da Análise (então `/projecao`) com fluxo diário, gráfico de saldo projetado e destaque visual dos dias em
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

Entregue em dois PRs: **6a** (metas com aportes) e **6b** (PWA e acabamento).

Duas notas para quem mexer no PWA depois:

- O Serwist roda em **modo configurador**, não no modo plugin. O modo plugin injeta configuração
  de webpack e o Next 16 usa Turbopack por padrão — o build falha com "This build is using
  Turbopack, with a `webpack` config". Por isso o service worker é compilado pelo `@serwist/cli`
  **depois** do `next build`, e o script `build` encadeia os dois. Invertida, a ordem produz um
  precache vazio.
- `sw.js`, `~offline` e `icons/` ficam **fora do matcher do `proxy.ts`**. Um service worker
  servido com redirecionamento é recusado pelo navegador, e o guarda manda para `/login` tudo que
  não é público: dentro do matcher, o worker nunca registra e o app nunca funciona offline — sem
  erro visível, só sem funcionar.

## Fase 7 — Assistente de IA

Uma caixa que convida a contar o que aconteceu, em português corrido, e uma IA (Gemini) que
traduz a frase nas operações que o app já sabe executar. **Sem ícone de IA**: o convite é o
texto dentro da caixa. A mesma caixa aparece em três lugares — grande no Início, em uma linha
ancorada acima da barra inferior (logo, em qualquer tela) e na tela própria `/assistente`.

A IA alcança tudo: lançamentos, contas fixas, parcelamentos, metas, aportes, categorias,
cenários e a âncora do saldo — criar, alterar **e excluir**. Nada executa antes de a pessoa ler,
em português, o que foi entendido e tocar em Confirmar.

Também gera resumo da situação financeira e dicas, **só sob demanda**, ligáveis e desligáveis
em `/ajustes/ia` junto com o aviso de conclusão e a escolha do modelo.

**Pronto quando:** "paguei 87,50 no mercado hoje" vira uma despesa de 8750 centavos na data de
hoje em `America/Sao_Paulo`; descartar a proposta não escreve nada; enviar uma frase, fechar o
app e voltar mostra o trabalho concluído.

Três decisões que explicam o desenho:

- **Nada de caminho de escrita próprio.** `lib/ai/apply.ts` traduz cada operação confirmada em
  `FormData` e chama a Server Action que a tela já usa. Validação Zod, guardas `.eq()`/`.select()`
  e `revalidatePath` vêm de graça, e continuam existindo em um lugar só. Consequência: a execução
  só roda dentro do request de quem confirmou — toda action passa por `currentUserId()`, que lê
  cookie. É por isso que a varredura do cron nunca chama uma action.
- **O trabalho é uma linha no banco, e a execução é do Gemini.** A Interactions API tem
  `background: true`: ela devolve um `id` na hora e segura a execução do lado deles. Fechar o app
  não perde nada. Três caminhos fecham um trabalho e os três são o mesmo código — o poll do
  cliente, o `after()` do Next (roda depois da resposta, sobrevive ao navegador fechar) e a
  varredura do cron.
- **O pedido inteiro fica gravado em `ai_jobs.input`.** A varredura roda sem sessão, então não
  teria como remontar o contexto financeiro — toda query passa pela RLS. Com o pedido gravado,
  cair para o próximo modelo é reenviar o mesmo texto, o que além de possível é mais correto.

Duas notas para quem mexer nisto depois:

- **`/api/ai/sweep` precisa estar em `PUBLIC_PREFIXES`** (`lib/supabase/proxy.ts`). `/api/**` está
  dentro do matcher de `proxy.ts`, a requisição do cron não traz cookie, e sem a exceção o guarda
  a redireciona para `/login` antes de o handler existir — com aparência de "o cron não faz nada".
- **A varredura roda uma vez por dia, e isso não é preguiça.** O plano Hobby da Vercel recusa o
  deploy inteiro com "Hobby accounts are limited to daily cron jobs" — a primeira versão pediu
  `* * * * *` e nada subiu. Quem fecha o trabalho de quem escreveu e fechou o app é o `after()`,
  com orçamento dimensionado em `trackJob` para cobrir o prazo de interpretar mais uma queda de
  modelo; a varredura é a rede de segurança para o que escapou. Virando Pro, baixar a
  periodicidade em `vercel.json` é a única mudança necessária.
- **`vercel.json` passou a chamar `npm run build`**, e não `next build`: como estava, o deploy não
  compilava o service worker — o que quebraria justamente o push desta fase.

## Fase 7b — A conversa antes do lançamento

A caixa deixou de ser um tiro só. Escrever uma frase disparava de uma vez o caminho pesado —
oito queries de contexto e uma interação com 27 ferramentas — e a primeira coisa na tela era
"Pode fechar o app", **antes de nada ter acontecido**. Se a IA entendesse errado, só se
descobria no fim, e a tela de aprovação mostrava texto sem edição.

Agora são dois tempos. A **triagem** responde em um ou dois segundos: diz se o assunto é
dinheiro, preenche um rascunho e lê de volta, em português, o que entendeu — sem tocar no
banco, sem ferramenta e sem background. A pessoa confirma ou corrige conversando, quantas
vezes precisar. Só depois do "É isso" nasce o trabalho pesado, levando o rascunho aprovado. E
na aprovação dá para ajustar valor, data, descrição e categoria campo a campo.

**Pronto quando:** "Recebi dois mil ontem. fui ao mercado hoje e já gastei 200 reais" devolve
o briefing em segundos com dois itens; "que horas são?" recebe resposta sem enfileirar
trabalho nenhum; ajustar um valor na aprovação registra o valor ajustado; e nenhum trabalho
fica `em andamento` além do prazo.

Quatro decisões que explicam o desenho:

- **A triagem é efêmera, e isso é o desenho.** `ai_jobs` existe para o trabalho sobreviver ao
  app fechar, e isso vale quando perder o trabalho custaria a frase da pessoa. A triagem custa
  uma chamada de um segundo e é re-derivável — é justamente por isso que ela dispensa
  `background: true`. Somado a isso, a 0012 revoga `update` em `ai_jobs.input`: acrescentar
  falas a uma linha existente seria impossível sem migration nova. A conversa vive no cliente e
  entra no banco de uma vez, no `insert` da aprovação.
- **A triagem nunca pode travar a tela.** Toda falha devolve `null` e o app segue pelo caminho
  que já tinha — `submitMessage` continua existindo, agora como reserva. O pior caso da etapa
  nova é o comportamento antigo, nunca uma regressão.
- **Ajuste não é confiar no formulário.** A identidade de cada operação continua vindo do
  banco; do corpo vem só o que uma pessoa digitaria, por lista branca, e a mesclagem inteira
  passa de novo pelo `operationSchema`. `op`, `id`, `rule_id`, `goal_id` e `scenario_id` nunca
  são editáveis — a RLS barra um id de outra pessoa, mas não barraria trocar "apague o mercado"
  por "apague o salário".
- **O aviso de fechar o app espera silêncio, não tempo.** Cinco segundos sem nada de
  substantivo na tela (`useQuietFor`). A trilha de etapas, ativável em `/ajustes/ia`, **não**
  conta como resposta — senão o app pareceria ocupado sem nunca admitir que está demorando.

Dois bugs bloqueantes entraram junto, e os dois ganharam o teste que os teria pegado:

- **O trabalho preso para sempre.** `shouldFallback` listava os status "em andamento" pelo
  nome, e `requires_action` — onde a interação para quando o modelo emite chamada de
  ferramenta — não estava na lista. O prazo nunca era avaliado. Agora a pergunta é "o status é
  final?", e `advanceJob` colhe pela presença da chamada.
- **O resumo "em formato inesperado".** A instrução não pedia JSON e o parser era `JSON.parse`
  cru, então uma cerca ```json descartava a resposta certa.

## Fase 7c — O diagnóstico como leitura, e a conversa mais humana

O resumo continuou falhando depois da 7b, e por outro motivo: o parser tolerante resolveu a
cerca de markdown, mas o **schema rígido** seguia recusando o conteúdo. Dois pedidos seguidos
terminaram em "O resumo voltou em formato inesperado" com a resposta certa na mão.

Então o formato saiu. Ele mudou de nome — na tela é **Diagnóstico**, no código segue
`insights`, como o invariante 10 pede — e agora é **texto corrido**, lê os **lançamentos** dos últimos N
dias (campo livre, 1 a 60, escolhido na tela e não guardado), mora em **`/projecao`** e **não é
gravado em lugar nenhum** — quem quiser guardar, copia. Junto, o convite virou "Ajuda para
atualizar?" e a espera passou a ser narrada pela própria IA, em balões, aos 0 e aos 15 segundos.

**Pronto quando:** pedir o diagnóstico devolve prosa em português sem nenhuma linha nova em
`ai_jobs`; o campo de período vazio cai em 30 dias e não em 1; e o "pode fechar o app" não
aparece antes dos 15 segundos.

Quatro decisões que explicam o desenho:

- **Texto livre em vez de formato fixo.** Pedir `{summary, tips}` e validar com Zod pareceu
  prudente e falhou três vezes, sempre com o conteúdo certo: um modelo devolve a mesma coisa em
  mil formas ligeiramente diferentes, e prever cada uma é uma corrida que não se ganha. A
  validação inteira passou a ser "veio texto?". De lado, sai a dependência do `response_format`,
  o campo cujo contrato não dava para verificar na API beta.
- **O diagnóstico não é um registro.** Guardá-lo em `ai_jobs` acumulava análises que ninguém ia
  reler, no mesmo histórico dos lançamentos que a pessoa pediu de verdade. Ele roda dentro do
  pedido e volta como texto. O custo está dito na tela, não escondido: enquanto ele é gerado, a
  pessoa precisa ficar ali — sem linha no banco não há varredura para retomar nem push para
  avisar. O aviso de privacidade em `/ajustes/ia` foi corrigido junto: ele dizia "totais já
  calculados", e passou a dizer que os lançamentos do período são enviados, porque é o que
  acontece. Refazer custa um toque; manter um histórico morto custa para sempre.
- **Uma query nova, e não a tentadora.** `listRecentEntries(N)` ordena por data desc **sem
  limite superior**: uma conta a pagar do mês que vem consome o limite, e quem tem muitas contas
  futuras receberia zero lançamento do período. `listEntriesInRange(de, até)` recorta por data,
  como o pedido exige.
- **A espera é fala, não aviso.** O texto cinza fora dos balões parecia mensagem de erro. Agora
  são duas falas da IA — e elas são derivadas do estado da fase, nunca empurradas para o
  histórico da conversa: se entrassem, viajariam de volta ao modelo, e "Um instante" não é
  informação sobre o dinheiro de ninguém.

Um bug encontrado por um teste que eu escrevi para isso: `Number('')` é `0`, então limpar o
campo de período dava um resumo de **um dia** em vez do padrão de 30 — silenciosamente, sem
ninguém ter pedido.

---

## Fase 8 — Histórico que edita, Análise que atravessa o tempo

As duas telas do meio não faziam o que o nome prometia. O **Extrato** só listava e alternava
pago/pendente: `updateEntry` e `deleteEntry` existiam em `lib/actions/entries.ts` desde a fase 3,
com Zod e o guarda do invariante 17, **sem nenhuma interface que os chamasse** — corrigir um valor
errado não era possível, nem excluindo e lançando de novo, porque excluir também não tinha botão.
E a **Projeção** só olhava para frente, em janelas de 30/90/180 dias a partir de hoje, num gráfico
de largura fixa, `aria-hidden`, sem clique e sem arrasto: a única forma de ler um valor era passar
o cursor, que em celular não existe.

Extrato virou **Histórico** e Projeção virou **Análise**, com as rotas acompanhando os nomes e as
antigas redirecionando em 308 — elas estão nos atalhos do PWA já instalado.

**Pronto quando:** o ponto de hoje na Análise mostra o mesmo saldo que o herói do Início; arrastar
para trás revela o passado e para na data da âncora; trocar de escala mantém período e cenário; e
uma semana que fecha positiva depois de um dia negativo mostra o piso, com o alerta nomeando **o
dia**.

Cinco decisões que explicam o desenho:

- **A janela nunca começa antes da âncora, e a de cálculo sempre alcança hoje.** Antes da âncora,
  `getCurrentBalance` devolve o próprio valor dela — que já embute os liquidados anteriores —, e
  acumular em cima disso os contaria duas vezes. Começar depois de hoje ignoraria todo pendente no
  caminho, e a projeção pareceria melhor do que é. Os dois cortes são o mesmo cuidado que a fase 5
  já tinha, aplicado a uma janela que agora se move.
- **`projectRange` ficou intocada, e `projectWindow` nasceu ao lado.** Não são a mesma função com
  um parâmetro a mais: `projectRange` exige que o chamador já tenha feito a partição, e um booleano
  que ligasse e desligasse a prevenção de contagem em dobro teria a forma exata do bug que ela
  previne. Um teste prova que, com `from = hoje`, as duas devolvem a mesma série.
- **O ponto do bucket é o fechamento, nunca a média, e o piso viaja junto.** A média de um período
  que foi de 5.000 a −200 é 2.400, número que não existiu em momento nenhum. O domínio do eixo vem
  do piso: com os fechamentos, o mergulho sai da escala e o gráfico afirma o contrário do dado.
- **As análises de "como foi" trabalham em meses fechados**, e não na janela do gráfico. Comparar
  17 dias de setembro com a média de meses cheios acusaria queda em tudo, e somar previsão ao
  "onde gastei" responderia a pergunta com o próprio palpite.
- **A tela cheia em paisagem é em três camadas independentes**, porque `requestFullscreen` não
  existe no iPhone e `orientation.lock` não existe em nenhum Safari. Onde as duas faltam, a rotação
  é por CSS — e ela é desligada enquanto um formulário está aberto, porque num conteúdo girado 90°
  o teclado sobe pelo lado físico e cobre o campo.

Três problemas que as ferramentas pegaram antes de virarem tela:

- O `next build` recusou `app/(app)/analise/params.ts` importando constantes da camada de query:
  isso arrastava `lib/supabase/server` para o bundle do **cliente**, contra o invariante 4.
  `MAX_WINDOW_DAYS` e `ANALYSIS_MONTHS` mudaram para `lib/finance/`, que é puro.
- O lint (`react-hooks/refs`) revelou que `requestFullscreen()` era chamado antes de a camada
  existir — a tela cheia nunca funcionaria. `flushSync` monta a camada ainda dentro do gesto.
- A decisão de layout usava a variante `landscape:`, que lê a orientação do **aparelho** — que
  está em retrato exatamente quando a rotação é por CSS, porque foi isso que sobrou. A media query
  respondia o oposto do que estava na tela.

Migration **0014**, com `v_source_breakdown`, para o comprometimento da renda. A prova de RLS
afirma o isolamento da view nova e que repartir o mês por origem não muda o total dele — se
discordassem, a tela mostraria uma sobra que não fecha com o mês.

## Fase 9 — Importar extrato bancário (PDF e CSV)

v1.0 — 2026-09-27. Um texto "Importar extrato" logo abaixo da caixa do assistente, no Início,
abre a janela: escolher o arquivo, conferir o que foi lido, ajustar, lançar. Primeiro banco:
Nubank (conta), nos dois formatos.

**Pronto quando:** o extrato Nubank em CSV e o mesmo período em PDF dão os mesmos lançamentos,
com a soma batendo com o total que o PDF declara; importar o segundo depois do primeiro não
grava nada novo; e o arquivo não passa pelo servidor.

Decisões:

- **O arquivo é lido no navegador** (`lib/import/read-file.ts`, com `unpdf` carregado sob
  demanda). Para o servidor só vão as linhas confirmadas. "Não guardar o arquivo" vale por
  construção, e o limite de corpo das Server Actions deixa de ser problema para PDF grande.
- **Os parsers são puros** (`lib/import/`), no mesmo regime de `lib/finance/`: sem I/O, sem
  `Date`, sem `parseFloat`. O CSV acha as colunas **pelo nome** (e, sem cabeçalho, pelo
  conteúdo); o PDF refaz linhas e células pelas coordenadas, remove cabeçalho e rodapé por
  repetição entre páginas e descobre as colunas de cada lançamento pelo `x` relativo dele.
  Nada depende de coordenada fixa nem de frase exata do banco.
- **O sentido vem do extrato sempre que ele diz**: sinal no valor, grupo "Total de entradas /
  saídas", coluna crédito/débito. Só sem nada disso é deduzido por palavra-chave — e a linha
  vem marcada "conferir entrada/saída".
- **`import_key` (migration 0016) e não `source = 'import'`.** Importado é lançamento manual
  feito em lote; um valor novo no enum faria projeção e edição o tratarem como ocorrência de
  regra. A chave é o sha256 de data, tipo, valor, texto original só com letras e números, e
  ordinal entre linhas idênticas — por isso CSV e PDF do mesmo extrato geram a mesma chave.
- **Categoria: histórico primeiro, IA para o resto.** A IA recebe só a descrição curta de
  cada contraparte e os nomes das categorias, numa chamada curta como a triagem; falhar não
  impede importar.

**Para adaptar um banco novo:** rode o arquivo dele pelos parsers (os testes em
`tests/unit/import-parsers.test.ts` mostram como montar o PDF em itens posicionados). Se algo
não sair certo, o ajuste é quase sempre um sinônimo de cabeçalho em `lib/import/csv.ts`, uma
palavra de grupo em `groupKind` (`lib/import/pdf-layout.ts`) ou uma regra de descrição em
`lib/import/describe.ts` — não um parser por banco. Acrescente um teste com o layout novo,
com dados inventados: extrato real tem dados de terceiros e não entra no repositório.


## Fase 10 — Tudo nasce no [+], "Ver lançamentos" e "Duplicar hábitos"

v1.0 — 2026-09-27. Conta fixa, renda fixa e parcelamento moravam na aba Mais, e cadastrar um
deles custava quatro telas. Agora são um chip no [+]: Saída oferece Avulso · Conta fixa ·
Parcelado; Entrada oferece Avulsa · Renda fixa. O avulso continua o padrão e em dois toques.
Conta fixa e renda fixa passaram a ter listas próprias (`/compromissos` e `/rendas`), no rodapé
do [+] conforme o tipo escolhido.

**Pronto quando:** um parcelamento cadastrado "em andamento" com 3 de 12 pagas mostra "3 de 12" e
as três pagas no Histórico na data de cada uma; "Ver lançamentos" lista o que foi cadastrado pela
data de criação, com o parcelamento uma vez só; um cenário com "Duplicar hábitos" de agosto põe o
gasto do 2º sábado no 2º sábado dos meses seguintes, nada antes de hoje, nenhuma regra duplicada,
e cada item se edita sozinho.

Decisões:

- **Um formulário, e nenhum caminho de escrita novo.** `components/finance/launch-form.tsx`
  chama `createEntry`, `createRecurring` ou `createInstallmentPlan` com os nomes de campo de cada
  schema. Valor, categoria, descrição e data são compartilhados, e trocar de modo não perde o
  que foi digitado. A conta fixa mensal vence no dia da data de início — um campo a menos.
- **Parcelas já pagas vão na função do banco** (migration 0017, `p_paid_count`). Um `update`
  depois da criação não sabe dar a cada linha a sua própria data de liquidação, e se falhasse
  deixaria as pagas como pendentes, cobradas de novo pela agenda. A assinatura antiga é trocada
  pela nova com `default 0`, e não sobrecarregada: com as duas, o PostgREST não saberia qual
  escolher. Quem informa a *próxima* parcela ganha a primeira recuada por `firstDueFromNext`, e
  o dia de vencimento viaja como `anchorDay` — sem ele, uma próxima no dia 31 arrastaria todas
  para o dia 30.
- **E para o parcelamento que já está no app** (v1.1 — 2026-09-27), `set_installments_paid`
  na mesma 0017: em `/parcelas/[id]`, "Quantas já foram pagas?" deixa 1..N pagas e as seguintes
  pendentes. A declaração é o estado inteiro, não um acréscimo; quem já tinha marcado uma parcela
  pelo Histórico mantém a data em que marcou, e as demais ficam com a data de vencimento.
- **"Ver lançamentos" junta três tabelas** (lançamento avulso, regra, plano) por `created_at`,
  com cursor de instante **e id**: uma importação grava dezenas de linhas no mesmo instante, e
  um cursor só de instante pularia as que sobraram na virada da página. O dia de criação é o de
  São Paulo (`todayISO(fuso, instante)`), e a ordenação respeita os microssegundos do Postgres.
- **Hábito é hipótese, não cópia.** Os duplicados são `scenario_entries` datados em outros meses,
  sem vínculo de escrita com `entries` (invariante 6): mudar agosto depois não muda o cenário, que
  é justamente o retrato do hábito. Só `source = 'manual'` é hábito — conta fixa, renda fixa,
  parcela e meta já entram na projeção pela própria regra, e duplicá-las contaria duas vezes.
- **O dia da semana manda, não o dia do mês.** O lazer do 2º sábado de agosto vai para o 2º
  sábado de setembro, e não para o dia 8, que é uma terça. O 5º que não existe cai no último.
- **Nada antes de hoje.** A projeção aplica o cenário só à previsão; item datado no passado seria
  gravado e nunca apareceria. A prévia diz isso, e pergunta — sem opção pré-marcada — se é tudo,
  só saídas ou só entradas.

## Fase 11 — Palavras-chave, "Ver todos" que exclui, Análise que respira, e o Diagnóstico de volta

v1.0 — 2026-09-27. Um pacote de experiência e um conserto.

**Pronto quando:** "iFood" em Alimentação categoriza sozinho a linha do extrato e o [+]; a IA só
categoriza a importação quando a pessoa toca no botão, em lotes de 100, sem passar por cima de
palavra-chave, histórico ou escolha feita na tela; uma importação ruim some inteira em "Ver
todos" com um atalho e uma confirmação; a Análise abre no último período escolhido; e o
Diagnóstico devolve texto.

Decisões:

- **O Diagnóstico nunca falhou por tempo.** O código lia `output_text`, um campo que só os SDKs
  do Google montam; o JSON da API REST entrega o texto em `steps[] (model_output) → content[]
  → text`. A interação completava, a leitura dava vazio e a cadeia de modelos inteira era
  percorrida à toa. `interactionText` (`lib/ai/gemini.ts`) lê dos `steps`, e o mesmo conserto
  destravou a triagem e a sugestão de categoria da importação, que falhavam em silêncio. O mock
  dos testes tinha o formato dos SDKs — por isso passavam. Junto: `incomplete` é status final,
  o erro real do provedor (chave, cota, 400) chega à tela, e o orçamento vale dentro do poll.
- **Palavra-chave na própria categoria** (`categories.keywords`, migration 0018), e não numa
  tabela de regras: é uma lista curta, com o mesmo dono e o mesmo tipo da categoria. A regra
  escrita pela pessoa vence o histórico, que vence a IA. Palavra de até 3 letras só casa inteira
  ("bar" não pega "barbearia"); empate entre categorias diferentes não decide.
- **`import_batch_id` e não `created_at`** para "selecionar a importação": o instante coincide
  hoje por acaso de implementação. O backfill usou esse acaso uma vez, para as importações que
  já existiam. Excluir um importado libera a `import_key`, e reimportar o extrato o traz de
  volta — é o conserto que a pessoa quer para uma importação ruim.
- **O período salvo é o atalho, não as datas** (`profiles.analysis_period`, com grant nominal
  pelo invariante 15): "Próximos 30 dias" guardado ontem começa hoje. Arrastar o gráfico não é
  escolha de filtro e não mexe no padrão.
- **Duplicar hábitos aceita o mês em aberto.** Não dobra nada: o destino continua começando no
  mês seguinte à origem, e do mês atual entra o que já foi lançado.
- **Categorizar depois do fato** (v1.1 — 2026-09-27). A seleção de "Todos os lançamentos" ganhou
  "Categorizar": a mesma palavra-chave e a mesma IA da importação, aplicadas ao que já existe
  (`lib/import/recategorize.ts`). Nada é gravado antes da prévia, e o que já tem categoria só
  muda se a pessoa ligar "Trocar também os que já têm categoria" — sem isso, nem vai para a IA.

## Fase 12 — O extrato liquida o que já foi cadastrado, e Meta no [+]

v1.0 — 2026-09-27. O que a pessoa cadastrava no [+] ficava pendente até ela marcar à mão, e a
importação do extrato não sabia disso: a mesma movimentação entrava como lançamento **novo**. O
salário continuava "a receber" e aparecia de novo como "Pix de Empresa X", e o saldo contava os
dois. Agora cada item cadastrado tem **palavras-chave**, e a linha do extrato que contém uma
delas marca o item como pago em vez de criar outro.

**Pronto quando:** uma renda fixa com a palavra "Empresa X" (escolhida na sugestão do que já
foi importado) aparece paga, com o valor do extrato, depois de importar o extrato do mês — sem
lançamento duplicado no Histórico e fora da agenda do Início; reimportar o mesmo extrato não
grava nada; a parcela conectada mantém o valor dela; "Não é este" na conferência deixa o item
pendente e grava a linha como lançamento novo; e um aporte pelo [+] sai do saldo e entra na meta.

Decisões:

- **Vale o valor do extrato** — é o que aconteceu. **Menos na parcela:** a soma das parcelas é o
  total do plano (invariante 1), e a conferência só avisa a diferença. `occurred_on` vira a data
  do extrato, porque o saldo soma por ela: com a data de vencimento, a conta vencida no dia 5 e
  paga no dia 7 cairia antes de uma âncora de saldo do dia 6 e sairia do saldo. A competência da
  conta fixa continua no `occurrence_key`, que sai do vencimento.
- **A conexão aparece na conferência, já aceita.** Nada é liquidado sem a pessoa ver; um toque
  solta. O casamento (`lib/finance/reconcile.ts`) é puro e roda no navegador, como o da
  categoria, porque o texto original do banco não sai do aparelho. Mesmo tipo, palavra-chave no
  texto e vencimento a até 15 dias; vence a palavra mais longa, depois a data mais perto, depois
  o valor mais perto; cada item uma vez só, menos a meta, que recebe quantos aportes vierem.
  Avulso pendente de mesmo dia, tipo e valor casa sem palavra-chave — era o "parece já lançado"
  da fase 9, que só desmarcava a linha.
- **Uma função por linha, e a recusa volta a ser lançamento novo.** `reconcile_import_row`
  (migration 0019) é uma transação por linha e devolve `null` quando o item já não está pendente
  (outra aba pagou, a pessoa marcou à mão). A linha nunca se perde: vira lançamento novo, como
  antes desta fase. A `import_key` vai para a linha conectada, e é isso que faz reimportar não
  criar nada.
- **Parcela e ocorrência conectadas não recebem o lote da importação.** "Excluir esta
  importação" em Ver todos não pode apagar a parcela ou o lançamento que a pessoa digitou. A
  ocorrência de conta fixa e o aporte, que a importação cria, recebem — desfazer a importação os
  devolve a "previsto".
- **Palavras-chave em cada tabela, e a parcela usa a do plano** — copiar para cada parcela
  duplicaria o dado (invariante 6). As sugestões são as descrições únicas já importadas, por
  tipo e por frequência: quem cadastra o salário escolhe como o banco escreveu o nome da empresa
  no mês passado, em vez de adivinhar.
- **Aporte de meta é uma saída amarrada.** Pelo [+] (Saída › Meta) ou pela importação, o aporte
  é um lançamento `source = 'goal'` e um `goal_contributions` com `entry_id`, numa transação
  (`record_goal_contribution`). O progresso continua sendo `SUM(goal_contributions)`
  (invariante 7); o `entry_id` virou `on delete cascade` e um trigger mantém valor e data iguais
  aos da saída — excluir ou editar a saída no Histórico não deixa a meta mentindo. O
  `occurrence_key` é o mês, o mesmo do aporte previsto por `expandGoal`, e por isso a projeção
  descarta o previsto quando o real acontece. Resgate continua na tela da meta, sem saída.
- **Metas saiu da aba Mais.** A lista mora no rodapé do [+] quando Saída está escolhida, como
  Contas fixas; `/metas/nova` redireciona para `/novo?modo=meta`.
