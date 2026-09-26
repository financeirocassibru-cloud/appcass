import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { advanceJob } from '@/lib/ai/jobs'
import { createSweeperClient } from '@/lib/supabase/sweeper'

/**
 * Varredura dos trabalhos da IA — chamada pelo cron, nunca por um navegador.
 * v1.0 — 2026-09-26.
 *
 * É a terceira e última camada que faz o trabalho continuar com o app fechado.
 * As duas primeiras cobrem o caso comum: o poll do cliente, enquanto a folha
 * está aberta, e o `after()` do Next, que roda depois da resposta e sobrevive ao
 * navegador fechar.
 *
 * **Esta roda UMA VEZ POR DIA**, e não de minuto em minuto como a primeira
 * versão tentou: o plano Hobby da Vercel recusa o deploy inteiro com "Hobby
 * accounts are limited to daily cron jobs" e nada sobe. Então ela não é o
 * fechador do dia a dia — é a rede de segurança para o que escapou: a função que
 * morreu no meio, o trabalho que ficou pendurado além do prazo. Quem fecha o
 * trabalho de quem escreveu e fechou o app é o `after()`, com orçamento
 * dimensionado para isso em `trackJob`.
 *
 * Se o projeto virar Pro, baixar a periodicidade em `vercel.json` é a única
 * mudança necessária — o código aqui não muda.
 *
 * SOBRE O INVARIANTE 14 ("antes de usar o cliente admin, verifique `is_admin()`
 * com o cliente normal"): aqui ele não tem como ser cumprido ao pé da letra, e
 * dizer isso em voz alta é melhor do que fingir que sim. Requisição de cron não
 * traz cookie, `auth.uid()` é nulo, e não existe usuário cujo privilégio
 * pudesse ser conferido. Mas o que o invariante protege — que a chave de serviço
 * não seja usada com base numa autorização que ninguém checou — continua
 * valendo, cumprido em outro tempo e em outro lugar:
 *
 *  1. Quem autoriza é o ENFILEIRAMENTO, não a varredura. A linha de `ai_jobs`
 *     nasceu na sessão da própria pessoa, e a policy "own rows: insert" já
 *     provou que `user_id = auth.uid()`. A varredura não escolhe de quem é o
 *     dado: ela lê o `user_id` de uma linha que a RLS já carimbou.
 *  2. Quem autoriza a ROTA é o segredo compartilhado, conferido em tempo
 *     constante logo abaixo. É o mesmo desenho de `claimInvite`, que também usa
 *     a chave de serviço sem sessão: a autoridade vem de um segredo de alta
 *     entropia e o alcance é estreito.
 *  3. O alcance é mesmo estreito: só `ai_jobs` com status 'queued' ou 'running',
 *     e só as colunas de andamento. Nenhum lançamento, nenhuma meta, nenhum
 *     perfil é tocado aqui.
 *
 * O que esta rota NÃO faz, e por quê: não chama Server Action nenhuma de
 * `lib/actions/`. Todas passam por `currentUserId()` → `cookies()`, que aqui
 * está vazio — as que exigem sessão lançariam, e as que não exigem rodariam como
 * anônimas, a RLS não casaria linha nenhuma e a resposta seria "não encontrado":
 * uma resposta ERRADA e silenciosa, que é pior que um erro. Aplicar a proposta
 * confirmada é trabalho de `confirmProposal`, na sessão de quem confirmou.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Quantos trabalhos uma varredura empurra. O cron roda de novo logo. */
const BATCH = 20

/**
 * Comparação em tempo constante.
 *
 * `a === b` vaza o tamanho e o prefixo pelo tempo de execução. `timingSafeEqual`
 * lança quando os tamanhos diferem, daí a checagem antes.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)

  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado.' }, { status: 503 })
  }

  const header = request.headers.get('authorization') ?? ''
  if (!secretMatches(header, `Bearer ${expected}`)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const supabase = createSweeperClient()

  const { data: jobs, error } = await supabase
    .from('ai_jobs')
    .select('*')
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: true })
    .limit(BATCH)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let advanced = 0
  for (const job of jobs ?? []) {
    try {
      const status = await advanceJob(supabase, job)
      if (status !== 'running' && status !== 'queued') advanced += 1
    } catch {
      // Um trabalho problemático não pode travar a fila inteira: a próxima
      // varredura tenta de novo, e o prazo acaba por marcá-lo como falho.
    }
  }

  return NextResponse.json({ scanned: jobs?.length ?? 0, finished: advanced })
}
