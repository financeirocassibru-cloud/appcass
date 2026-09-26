/**
 * Leitura tolerante do JSON que um modelo devolve. v1.0 — 2026-09-26.
 *
 * Módulo **puro** (invariante 9): sem I/O, sem relógio, sem Supabase.
 *
 * Existe por um bug real. O resumo financeiro pedia saída estruturada pelo
 * `response_format` e lia a resposta com `JSON.parse` cru. Quando o modelo respondeu
 * o mesmo objeto correto **dentro de uma cerca de markdown** — que é o hábito dele,
 * porque é assim que JSON aparece em quase todo texto que ele já leu — o parse
 * estourou e a tela mostrou "O resumo voltou em formato inesperado".
 *
 * A lição não é que o modelo errou: é que "JSON válido" e "corpo da resposta" não são
 * a mesma coisa, e supor que sejam deixa o app na mão de um detalhe de formatação.
 *
 * Tolerância tem limite, e o limite é rígido: aqui se aceita **envelope** — cerca de
 * markdown, uma frase de cortesia antes, espaço em volta. Não se aceita **conteúdo**
 * torto. Quem chama continua validando com Zod, e um objeto que não bate com o schema
 * continua sendo recusado: num app de dinheiro, meio resumo é pior que nenhum.
 */

/** Cerca de markdown: ```json … ``` ou ``` … ```, com ou sem rótulo de linguagem. */
const FENCE = /```[a-z]*\s*\n?([\s\S]*?)```/i

/**
 * Sentinela para distinguir "o parse falhou" de "o parse devolveu undefined".
 *
 * `JSON.parse('null')` é `null` e não existe `JSON.parse` que devolva `undefined`,
 * mas usar `undefined` como sinal de falha aqui deixaria a próxima pessoa a mexer
 * nisto com uma armadilha na mão.
 */
const FALHOU = Symbol('json-invalido')

function tentar(candidate: string): unknown {
  const limpo = candidate.trim()
  if (limpo === '') return FALHOU

  try {
    return JSON.parse(limpo)
  } catch {
    return FALHOU
  }
}

/**
 * Lê o JSON que veio no texto, ou `undefined` se não houver nenhum.
 *
 * Três tentativas, da mais honesta para a mais escavadora:
 *
 *  1. o texto inteiro já é JSON;
 *  2. o texto tem uma cerca de markdown, e o JSON está dentro dela;
 *  3. o texto tem um objeto ou uma lista em algum lugar — do primeiro `{` ao último
 *     `}` (ou `[`…`]`), que é o caso do "Claro! Aqui está: {…}".
 *
 * Devolve `undefined`, e não `null`, de propósito: `null` é um valor JSON legítimo, e
 * confundir "o modelo respondeu null" com "não achei JSON" apagaria a diferença.
 */
export function parseLooseJson(text: string | undefined | null): unknown {
  if (!text) return undefined

  const direto = tentar(text)
  if (direto !== FALHOU) return direto

  const cercado = FENCE.exec(text)?.[1]
  if (cercado !== undefined) {
    const dentro = tentar(cercado)
    if (dentro !== FALHOU) return dentro
  }

  for (const [abre, fecha] of [
    ['{', '}'],
    ['[', ']'],
  ] as const) {
    const inicio = text.indexOf(abre)
    const fim = text.lastIndexOf(fecha)
    if (inicio === -1 || fim <= inicio) continue

    const recortado = tentar(text.slice(inicio, fim + 1))
    if (recortado !== FALHOU) return recortado
  }

  return undefined
}
