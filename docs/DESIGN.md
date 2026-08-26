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

- Área de saldo projetado (o principal, na tela Projeção).
- Rosca de gastos por categoria (Início).
- Barras de comparação mês a mês (Início ou Extrato, na visão de histórico).

Seguir a skill `dataviz` do projeto para paleta, formas e legibilidade em ambos os temas antes
de implementar qualquer um desses três.
