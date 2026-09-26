import 'server-only'

import { todayISO, type ISODate } from '@/lib/finance/date'
import { geminiModelChain } from './env'
import { runInteraction } from './gemini'
import { parseLooseJson } from './json'
import { nextModel } from './models'
import {
  parseTriage,
  TRIAGE_RESPONSE_SCHEMA,
  TRIAGE_SYSTEM_INSTRUCTION,
  type Triage,
} from './triage'

/**
 * A chamada da triagem. v1.0 — 2026-09-26.
 *
 * O primeiro tempo da conversa, e a razão de ele ser rápido está toda aqui:
 *
 *  - **nenhuma query ao banco.** `buildContext()` são oito leituras para montar o
 *    retrato financeiro, e a triagem não precisa de nenhuma delas: ela não escolhe
 *    categoria real, não conhece id e não decide entre conta fixa e parcelamento. A
 *    latência da triagem é a do modelo, e mais nada;
 *  - **nenhuma ferramenta.** As 27 declarações de `tools.ts` são o vocabulário do
 *    segundo tempo. Mandá-las aqui só engordaria o prompt;
 *  - **sem background.** A interação resolve na mesma viagem, por `runInteraction`.
 *
 * E a regra que segura tudo isso: **a triagem nunca pode ser um jeito novo de a tela
 * travar.** Toda falha — provedor fora, resposta ilegível, cadeia esgotada — devolve
 * `null`, e quem chama segue pelo caminho que o app já tinha. Ela é uma gentileza, não
 * uma dependência.
 */

/**
 * Quantos modelos tentar antes de desistir da triagem.
 *
 * Dois, não a cadeia inteira. A triagem existe para responder rápido; insistir por
 * cinco modelos trocaria o problema que ela resolve pelo que ela deveria evitar. Se os
 * dois primeiros falharem, o caminho pesado assume, e ele tem a cadeia completa.
 */
const MAX_MODELOS = 2

export interface BriefingTurn {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Roda a triagem sobre o que a pessoa escreveu.
 *
 * `turns` são as falas anteriores desta mesma conversa, quando ela está corrigindo um
 * mal-entendido ("na verdade foram 250"). Elas entram como HISTÓRICO delimitado, no
 * `input` — nunca em `system_instruction`, que é onde moram as regras. Misturar os dois
 * convidaria uma frase da pessoa a se passar por regra, e é a mesma separação que
 * `lib/ai/jobs.ts` já faz com o texto dela.
 */
export async function runTriage(
  text: string,
  turns: readonly BriefingTurn[] = [],
  today: ISODate = todayISO(),
): Promise<Triage | null> {
  const input = montarInput(text, turns, today)
  const chain = geminiModelChain()
  let model = chain[0]

  for (let tentativa = 0; tentativa < MAX_MODELOS && model; tentativa += 1) {
    const triagem = await tentar(model, input)
    if (triagem) return triagem

    model = nextModel(chain, model) ?? undefined
  }

  return null
}

async function tentar(model: string, input: string): Promise<Triage | null> {
  try {
    const interaction = await runInteraction({
      model,
      input,
      systemInstruction: TRIAGE_SYSTEM_INSTRUCTION,
      responseSchema: TRIAGE_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    })

    if (!interaction) return null

    return parseTriage(parseLooseJson(interaction.output_text))
  } catch {
    // Silencioso de propósito: a triagem que falha não é um erro para a pessoa ler, é
    // um caminho que não deu. Quem chama já sabe o que fazer com `null`, e o erro de
    // verdade — se houver — aparece no caminho pesado, com mensagem e tudo.
    return null
  }
}

/**
 * O prompt da triagem.
 *
 * A data de hoje vem por parâmetro e fixada em `America/Sao_Paulo` por `todayISO()`.
 * Sem isso o modelo calcularia "ontem" por conta própria e erraria o dia em fuso
 * negativo — é o invariante 2 valendo também para o que se pede ao modelo.
 */
function montarInput(text: string, turns: readonly BriefingTurn[], today: ISODate): string {
  const blocos = [`Data de hoje: ${today}.`]

  if (turns.length > 0) {
    blocos.push(
      'CONVERSA ATÉ AGORA (a pessoa pode estar corrigindo algo que você entendeu errado):',
      ...turns.map((turn) => `${turn.role === 'user' ? 'Pessoa' : 'Você'}: ${turn.content}`),
    )
  }

  blocos.push(`A PESSOA ESCREVEU AGORA:\n"""\n${text}\n"""`)

  return blocos.join('\n\n')
}
