# Diretrizes de design — banco digital, mobile-first

Decisão fechada com o usuário: uso é **celular em primeiro lugar**, direção visual de
**banco digital** (referência: Nubank/Inter — cor de marca forte, saldo em destaque, extrato
como linha do tempo, feedback tátil). Consultar a skill `dataviz` antes de escrever o
primeiro gráfico do projeto.

## Navegação

Bottom tab bar com 5 itens: **Início · Histórico · [+] · Análise · Mais**
(v1.1 — 2026-09-27: eram "Extrato" e "Projeção"; as rotas acompanharam os nomes). O botão central
`[+]` é destacado (elevado, cor de marca) e abre o lançamento rápido. Nada de scroll
horizontal de abas, como o app antigo usava (`nav-tabs` com `overflow-x: auto`) — em telas
pequenas isso escondia opções sem indicação visual.

Mapeamento das 7 abas do app antigo (`legacy/google-apps-script/Index.html.md:327-334`) para
o novo desenho:

| Aba antiga | Vira |
|---|---|
| 📋 Planejamento | **Análise** (janela passado+futuro + cenários) |
| 💳 Gastos / 💵 Renda | **Histórico** unificado, com filtro por tipo |
| 📅 Parcelas / 📌 Fixos | **Mais → Compromissos** (recorrentes e parcelas) |
| 🎯 Metas | **Mais → Metas** |
| 📊 Histórico | **Início** (gráficos) + **Histórico** com filtro por período + **Análise** |

A agenda de "próximos eventos" sai da aba Planejamento e vira um bloco fixo na tela Início,
calculado sempre — não pode depender da existência de um cenário ativo (bug do app antigo:
`getUpcomingEvents()` retornava lista vazia sem cenário ativo).

## Telas

- **Início:** herói de saldo no topo — número grande, cor semântica (verde se positivo,
  vermelho se negativo), com ícone de "olho" para ocultar valores em público. Abaixo, bloco
  de próximos eventos (contas a vencer, parcelas, metas do mês) e os gráficos principais.
- **Histórico:** lista agrupada por dia, cada linha com ícone da categoria, descrição e valor
  com sinal. Lançamento pendente tem marcador visual distinto do pago (não apenas uma cor sutil —
  precisa ser identificável em um relance).
  **Editar e excluir (v1.1 — 2026-09-27):** a linha tem dois alvos de toque, e isso é deliberado.
  O círculo à esquerda alterna pago/pendente, que é a ação mais usada da tela e não pode custar
  dois toques; o resto da linha abre o painel de edição. O plano original pedia *swipe*, e ele
  nunca foi implementado — dois alvos explícitos resolvem o mesmo problema sem um gesto invisível,
  que em celular ninguém descobre e teclado nenhum alcança.
- **Lançamento rápido (`/novo`):** abre com teclado numérico focado, valor é o primeiro campo,
  categoria em chips horizontais, data pré-preenchida com hoje. Meta: salvar em dois toques.
- **Análise (v2.0 — 2026-09-27):** a curva do saldo atravessando passado e futuro, com destaque
  (cor de alerta) onde o saldo fica negativo — informação que o app antigo calculava mas não
  destacava visualmente. O passado é traço cheio e o futuro é tracejado, porque tracejado lê como
  "projeção", que é o que é. Escala de dia, semana ou mês; arrastar navega pelo período; tocar num
  ponto abre o detalhamento **do período** tocado, com lançar, alterar e excluir; duplo toque (ou
  o botão, que é a via primária) amplia para tela cheia em paisagem. Além do gráfico, a mesma
  janela em lista, no formato do Histórico — e é ela o caminho acessível aos números, porque o
  gráfico é `aria-hidden`.

## Cor

Uma cor de marca forte para superfícies e ações primárias. Verde e vermelho são **reservados
exclusivamente** para entrada/saída de dinheiro — nunca usados de forma decorativa em outro
contexto, para não competir com o significado financeiro.

## Tema e acessibilidade

- Tema claro e escuro via CSS variables desde o primeiro componente — não como retrofit.
- Alvos de toque ≥ 44px.
- Contraste mínimo AA.
- Respeitar `prefers-reduced-motion`.

## Gráficos

Seguir a skill `dataviz` do projeto para paleta, formas e legibilidade em ambos os temas antes
de implementar qualquer gráfico. Ela decide a **forma**, não só a cor — e já mudou uma decisão
desta lista, como está registrado abaixo.

- **Saídas por categoria (Início).** Barras ordenadas da maior para a menor, com nome, valor e
  porcentagem escritos em cada linha. **Não é rosca**, embora a primeira versão deste documento
  pedisse uma: a skill desaconselha rosca e pizza quando a pergunta é de magnitude ("onde gastei
  mais"), porque comparar comprimento é preciso e comparar ângulo é chute. A relação com o total
  — o argumento a favor da rosca — continua explícita na porcentagem de cada linha e no total do
  cabeçalho. Em tela de celular a lista ainda ganha por caber o nome inteiro da categoria, que
  numa legenda de rosca seria truncado.
- **Mês a mês (Início).** Colunas agrupadas, entrada e saída lado a lado, seis meses. Ordem fixa
  — entrada à esquerda, saída à direita — para que a posição carregue a mesma informação que a
  cor. Mês sem lançamento ocupa seu lugar no eixo, zerado: se sumisse, os meses vizinhos leriam
  como consecutivos.
- **Curva de saldo (Análise).** O principal da tela. Linha contra a linha de base do zero, com
  a parte negativa em cor de alerta — duas áreas ancoradas em `baseValue={0}`, e não um gradiente,
  que o Recharts ancora na caixa do traçado e pinta vermelho **acima** do zero.

  **Emenda à regra "uma série só, então sem legenda" (v1.1 — 2026-09-27).** Nas escalas de semana
  e mês, quando algum período tem piso diferente do fechamento, entra uma segunda linha: o **menor
  saldo do período**. Sem ela o agregado esconde o mergulho — uma semana que vai a −R$ 800 na
  terça e fecha positiva na sexta apagaria o único dia que importa —, e este documento coloca o
  dia negativo como o motivo de a tela existir. Duas séries obrigam legenda, então ela aparece
  junto, com traço (não quadrado) espelhando a marca. Na escala diária, que é o padrão, piso e
  fechamento são o mesmo número e a regra original continua valendo: uma série, nenhuma legenda.
  A mesma coisa vale para a curva "sem o cenário", que só existe quando há um cenário escolhido.

- **Comprometimento da renda (Análise).** Um medidor por mês: a pista é a renda, o preenchimento
  são os compromissos, o que sobra é a pista vazia. **Rampa ordinal de um só matiz**, não quatro
  cores — a ordem das faixas é a informação (quanto menos escolha a pessoa tem sobre aquele
  dinheiro, mais escura a faixa), e quatro matizes gastariam o canal de identidade recodificando
  o que a largura já mostra, que a skill chama de anti-padrão. Vão de 2px entre as faixas, que
  desaparece quando a faixa é estreita demais para contê-lo.

- **Fora da curva (Análise).** Barra divergente a partir do zero: média por mês do período contra
  a média dos meses anteriores. Quente para quem subiu, frio para quem caiu, cinza no meio. A cor
  não carrega a direção sozinha — a barra fica de um lado ou do outro do zero e a variação está
  escrita. Categoria sem histórico é dita "nova", nunca "+∞%".

### Cores de gráfico

`--income` e `--expense` são calibrados para **texto**. Como preenchimento de barra eles
reprovam na validação: no tema escuro ficam claros demais e a separação entre verde e vermelho
sob deuteranopia cai para ΔE 6,5, dentro da faixa em que a cor sozinha não distingue os dois.

Por isso existem `--chart-income` e `--chart-expense`, que são as mesmas duas rampas
reposicionadas para a faixa de preenchimento e medidas com `scripts/validate_palette.js` da
skill contra a superfície real de cada tema:

| Token | Claro | Escuro |
|---|---|---|
| `--chart-income` | `#10a373` | `#15ad7c` |
| `--chart-expense` | `#c2181d` | `#bf3b3b` |
| `--chart-magnitude` | `var(--brand)` | `var(--brand)` |
| `--chart-below` | `#2a78d6` | `#3987e5` |
| `--chart-commit-fixed` | `#3b1478` | `#ede9fe` |
| `--chart-commit-installment` | `#5b21b6` | `#c4b5fd` |
| `--chart-commit-saved` | `#7c3aed` | `#a78bfa` |
| `--chart-commit-variable` | `#a78bfa` | `#8b5cf6` |

`--chart-below` é o polo frio do divergente de "fora da curva"; o quente é `--chart-expense`. A
skill recusa dois polos frios, porque aí o meio deixa de ler como "nada". Verde ficou fora de
propósito: no app ele significa dinheiro entrando, e gastar menos que a média não é uma entrada.

Os quatro `--chart-commit-*` são uma **rampa ordinal**, validada com `--ordinal` (L monótono,
degrau ≥ 0,06, ponta próxima da superfície ≥ 2:1, matiz único) e não com as seis checagens
categóricas. Ela **inverte no escuro**: o mais comprometido continua sendo o de maior contraste,
que num fundo escuro é o passo mais claro — e não é o claro virado do avesso, são passos escolhidos
para a faixa do tema escuro e medidos contra ele.

Medidas de 2026-09-27, contra as superfícies reais (`#f8fafc` / `#131a2e`):

| Par | Claro | Escuro |
|---|---|---|
| saldo × piso do período (`--chart-magnitude` × `--chart-expense`) | ΔE 31,9 | ΔE 28,6 |
| divergente (`--chart-expense` × `--chart-below`) | ΔE 27,1 | ΔE 25,1 |

ΔE sob deuteranopia, contra o alvo de 8, com contraste ≥ 3:1 nos dois temas.

ΔE sob deuteranopia: 12,3 no claro e 11,7 no escuro, ambos acima do alvo de 8, com contraste
≥ 3:1 contra a superfície nos dois temas.

`--chart-magnitude` é a cor de uma série só, usada onde o gráfico compara magnitude e a
identidade vem do rótulo ao lado da barra — aí verde e vermelho não são usados, porque no app
eles significam direção do dinheiro e nada mais.

**Ao mexer em qualquer uma dessas cores, rode o validador da skill de novo.** A regra não é
"escolher uma cor bonita", é passar nas seis checagens contra a superfície onde o gráfico
realmente aparece.
