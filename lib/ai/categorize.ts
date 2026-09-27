import 'server-only'

import { readCategorySuggestions, type CategoryOption, type SuggestGroup } from '@/lib/import/suggest'
import { geminiModelChain } from './env'
import { interactionText, runInteraction } from './gemini'
import { parseLooseJson } from './json'
import { nextModel } from './models'

/**
 * Categorias sugeridas pela IA para um extrato importado. v1.1 — 2026-09-27.
 *
 * v1.1: a resposta é lida dos `steps` (`interactionText`) — antes lia `output_text`, que a
 * API REST não manda, e a sugestão voltava sempre vazia. As palavras-chave de cada categoria
 * vão junto com o nome, como pista. E o pedido tem no máximo 100 itens: quem divide em
 * lotes é a tela, a pedido da pessoa, para o modelo não se perder numa lista longa.
 *
 * Mesmo desenho da triagem (`briefing.ts`): uma chamada curta, sem ferramentas e sem
 * contexto financeiro, com resposta em esquema fixo, tentando no máximo dois modelos. Falhou,
 * devolve `{}` e a conferência segue sem sugestão — a IA aqui é gentileza, nunca condição
 * para importar.
 *
 * O que viaja é só a **descrição curta** de cada contraparte ("Pix para Fulano", "Compra no
 * débito · iFood") e os nomes das categorias. O texto original do banco — CPF mascarado,
 * agência, conta — e o arquivo não saem do aparelho.
 */

const MAX_MODELOS = 2

export const CATEGORIZE_SYSTEM_INSTRUCTION = `Você classifica lançamentos de um extrato bancário brasileiro em categorias que a pessoa já tem.

Regras:
- Para cada item, escolha no máximo UMA categoria da lista, pelo id, e só uma categoria do MESMO tipo do item (expense com expense, income com income).
- Use o nome da categoria e, quando houver, as palavras-chave dela ("keywords") como pista do que ela reúne.
- Se nenhuma categoria servir com segurança, devolva category_id null. Errar é pior que não sugerir.
- Transferência para pessoa física sem pista do motivo: null.
- Responda só o JSON pedido, com a mesma "key" de cada item.`

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          category_id: { type: 'string', nullable: true },
        },
        required: ['key'],
      },
    },
  },
  required: ['items'],
} as const

function montarInput(groups: readonly SuggestGroup[], categories: readonly CategoryOption[]): string {
  const cats = categories.map((c) =>
    c.keywords.length > 0
      ? { id: c.id, name: c.name, kind: c.kind, keywords: c.keywords }
      : { id: c.id, name: c.name, kind: c.kind },
  )
  const items = groups.map((g) => ({ key: g.key, description: g.description, kind: g.kind }))
  // Dados delimitados, nunca misturados às regras: uma descrição de extrato não pode se
  // passar por instrução.
  return `CATEGORIAS:\n${JSON.stringify(cats)}\n\nITENS DO EXTRATO:\n${JSON.stringify(items)}`
}

export async function suggestCategoriesWithAi(
  groups: readonly SuggestGroup[],
  categories: readonly CategoryOption[],
): Promise<Record<string, string>> {
  if (groups.length === 0 || categories.length === 0) return {}

  const input = montarInput(groups, categories)
  const chain = geminiModelChain()
  let model = chain[0]

  for (let tentativa = 0; tentativa < MAX_MODELOS && model; tentativa += 1) {
    try {
      const interaction = await runInteraction({
        model,
        input,
        systemInstruction: CATEGORIZE_SYSTEM_INSTRUCTION,
        responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      })
      if (interaction) {
        const parsed = parseLooseJson(interactionText(interaction))
        // Resposta legível encerra, mesmo que toda nula: "não sei" também é resposta, e
        // perguntar ao próximo modelo só gastaria cota.
        if (typeof parsed === 'object' && parsed !== null && 'items' in parsed) {
          return readCategorySuggestions(parsed, groups, categories)
        }
      }
    } catch {
      // Silencioso de propósito, como na triagem: quem chama já sabe seguir sem sugestão.
    }
    model = nextModel(chain, model) ?? undefined
  }
  return {}
}
