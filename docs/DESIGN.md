# Diretrizes de design — banco digital, mobile-first

Decisão fechada com o usuário: uso é **celular em primeiro lugar**, direção visual de
**banco digital** (referência: Nubank/Inter — cor de marca forte, saldo em destaque, extrato
como linha do tempo, feedback tátil). Consultar a skill `dataviz` antes de escrever o
primeiro gráfico do projeto.

## Navegação

Bottom tab bar com 5 itens: **Início · Extrato · [+] · Projeção · Mais**. O botão central
`[+]` é destacado (elevado, cor de marca) e abre o lançamento rápido. Nada de scroll
horizontal de abas, como o app antigo usava (`nav-tabs` com `overflow-x: auto`) — em telas
pequenas isso escondia opções sem indicação visual.

Mapeamento das 7 abas do app antigo (`legacy/google-apps-script/Index.html.md:327-334`) para
o novo desenho:

| Aba antiga | Vira |
|---|---|
| 📋 Planejamento | **Projeção** (fluxo diário + cenários) |
| 💳 Gastos / 💵 Renda | **Extrato** unificado, com filtro por tipo |
| 📅 Parcelas / 📌 Fixos | **Mais → Compromissos** (recorrentes e parcelas) |
| 🎯 Metas | **Mais → Metas** |
| 📊 Histórico | **Início** (gráficos) + Extrato com filtro por período |

A agenda de "próximos eventos" sai da aba Planejamento e vira um bloco fixo na tela Início,
calculado sempre — não pode depender da existência de um cenário ativo (bug do app antigo:
`getUpcomingEvents()` retornava lista vazia sem cenário ativo).

## Telas

- **Início:** herói de saldo no topo — número grande, cor semântica (verde se positivo,
  vermelho se negativo), com ícone de "olho" para ocultar valores em público. Abaixo, bloco
  de próximos eventos (contas a vencer, parcelas, metas do mês) e os gráficos principais.
- **Extrato:** lista agrupada por dia, cada linha com ícone da categoria, descrição e valor
  com sinal. Swipe para editar/excluir. Lançamento pendente tem marcador visual distinto do
  pago (não apenas uma cor sutil — precisa ser identificável em um relance).
- **Lançamento rápido (`/novo`):** abre com teclado numérico focado, valor é o primeiro campo,
  categoria em chips horizontais, data pré-preenchida com hoje. Meta: salvar em dois toques.
- **Projeção:** gráfico de área do saldo dia a dia, com destaque (cor de alerta) nos dias em
  que o saldo projetado fica negativo — informação que o app antigo calculava mas não
  destacava visualmente.

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
- **Área de saldo projetado (Projeção, fase 5).** O principal da tela de projeção.

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

ΔE sob deuteranopia: 12,3 no claro e 11,7 no escuro, ambos acima do alvo de 8, com contraste
≥ 3:1 contra a superfície nos dois temas.

`--chart-magnitude` é a cor de uma série só, usada onde o gráfico compara magnitude e a
identidade vem do rótulo ao lado da barra — aí verde e vermelho não são usados, porque no app
eles significam direção do dinheiro e nada mais.

**Ao mexer em qualquer uma dessas cores, rode o validador da skill de novo.** A regra não é
"escolher uma cor bonita", é passar nas seis checagens contra a superfície onde o gráfico
realmente aparece.
