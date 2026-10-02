import { revalidatePath } from 'next/cache'

/*
 * Telas a revalidar depois de escrever lançamentos. v1.0 — 02/10/2026.
 *
 * Saiu de `lib/actions/entries.ts` (onde era v1.6) quando o ajuste de saldo passou a criar e
 * apagar lançamentos: as duas escritas precisam da mesma lista, e uma cópia ficaria velha.
 */

/**
 * Rotas que exibem lançamentos e precisam ser revalidadas depois de escrever.
 *
 * v1.1 — 2026-09-26: `/analise` entrou na lista. Ela sempre exibiu lançamentos, e até aqui só
 * não ficava velha por ser `force-dynamic` — o que é sorte, não garantia. Agora que dá para
 * criar e editar lançamento de dentro dela (pela tela cheia do gráfico), a revalidação é o que
 * faz a curva mudar depois de salvar.
 */
export function revalidateEntryViews(): void {
  revalidatePath('/historico')
  // 28/09/2026 (Fase 14): a planilha lê os mesmos lançamentos.
  revalidatePath('/planilha', 'layout')
  revalidatePath('/analise')
  revalidatePath('/')
  // v1.2 — 2026-09-27: "Ver todos" também mostra lançamentos, e agora exclui em lote.
  revalidatePath('/novo/lancamentos')
  // v1.5 — 2026-09-27: a compra no cartão muda a fatura e o limite.
  revalidatePath('/cartoes', 'layout')
}
