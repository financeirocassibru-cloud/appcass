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
