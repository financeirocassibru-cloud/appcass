import { z } from 'zod'
import { parseKeywords } from '@/lib/finance/keywords'

/**
 * O campo de palavras-chave dos itens cadastrados. v1.0 — 2026-09-27.
 *
 * Lançamento, conta/renda fixa, parcelamento e meta guardam as palavras que, no texto do
 * extrato, os identificam (migration 0019). Chega como o texto do campo escondido do
 * `KeywordField` (separado por vírgula) e sai como a lista limpa de `parseKeywords` — a mesma
 * que a tela usa para mostrar os chips.
 *
 * **Ausente não é vazio.** Um formulário que não tem o campo (o assistente, uma tela antiga)
 * devolve `undefined`, e a action não mexe na coluna: apagar as palavras de quem editou só o
 * valor seria perder a conexão com o extrato sem ninguém ter pedido. Vazio (`''`) apaga.
 */
export const keywordsField = z
  .union([z.string().max(2_000, 'Palavras-chave demais'), z.null(), z.undefined()])
  .transform((raw) => (raw === null || raw === undefined ? undefined : parseKeywords(raw)))

/** `{ keywords }` só quando o formulário mandou o campo — para espalhar no insert/update. */
export function keywordsPatch(keywords: string[] | undefined): { keywords?: string[] } {
  return keywords === undefined ? {} : { keywords }
}
