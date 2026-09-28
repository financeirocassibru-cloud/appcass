import { isAiConfigured } from '@/lib/ai/env'
import { listRecentJobs, type JobView } from '@/lib/ai/jobs'
import { formatISODateBR } from '@/lib/ai/proposal'
import { AssistantComposer } from '@/components/ai/composer'

// v1.2 — 27/09/2026: só o nome da tela; o "· Cass" vem do `template` do layout raiz.
export const metadata = { title: 'Assistente' }

/**
 * A tela do assistente. v1.0 — 2026-09-26.
 *
 * `force-dynamic` pelo mesmo motivo do Início: tudo aqui depende do banco e de
 * "agora". Prerenderizada, mostraria o histórico do build.
 */
export const dynamic = 'force-dynamic'

/**
 * Orçamento de tempo do `after()` que acompanha um trabalho depois da resposta.
 *
 * Sem isto a função usaria o padrão da plataforma, que é menor que o que o
 * acompanhamento precisa — e o trabalho cairia sempre para a varredura do cron,
 * que é mais lenta.
 */
export const maxDuration = 60

// v1.3 — 28/09/2026: layout de computador — a partir de `lg` (1024 px) a largura vai a `lg:max-w-2xl` (formulário). No celular continua `max-w-md`.
export default async function AssistentePage() {
  // v1.1 — 2026-09-26: a leitura de `ai_insights_enabled` saiu daqui junto com o resumo,
  // que mudou para a Projeção.
  const jobs = await listRecentJobs()

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8 lg:max-w-2xl lg:px-10 lg:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Assistente</h1>
        <p className="text-muted-foreground text-sm">
          Conte o que aconteceu com o seu dinheiro. Eu mostro o que entendi antes de registrar.
        </p>
      </header>

      {isAiConfigured() ? (
        <AssistantComposer variant="page" />
      ) : (
        <p className="rounded-xl bg-[var(--surface)] p-5 text-sm">
          O assistente ainda não está configurado neste ambiente. Falta a variável{' '}
          <code className="font-mono text-xs">GEMINI_API_KEY</code>.
        </p>
      )}


      <History jobs={jobs} />
    </main>
  )
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'na fila',
  running: 'em andamento',
  completed: 'pronto',
  failed: 'falhou',
  canceled: 'descartado',
}

/**
 * O que mostrar como situação.
 *
 * Confirmar e descartar levam o pedido ao mesmo status — `canceled` — porque os
 * dois o encerram e impedem uma segunda confirmação. O que os separa é a marca
 * `confirmedAt`, gravada na mesma escrita que encerra. Sem ela, um pedido
 * confirmado apareceria aqui como "descartado", que é o contrário do que
 * aconteceu.
 */
function statusLabel(job: JobView): string {
  const confirmado = (job.result as { confirmedAt?: string } | null)?.confirmedAt
  if (job.status === 'canceled' && confirmado) return 'confirmado'

  return STATUS_LABEL[job.status] ?? job.status
}

/**
 * O histórico.
 *
 * Existe porque o trabalho continua com o app fechado: quem enviou uma frase e
 * saiu precisa de um lugar onde o resultado esteja esperando. Sem ele, o aviso
 * de "terminei" não teria para onde levar.
 */
function History({ jobs }: { jobs: JobView[] }) {
  if (jobs.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">O que você já pediu</h2>
      <ul className="divide-border flex flex-col divide-y">
        {jobs.map((job) => (
          <li key={job.id} className="flex flex-col gap-1 py-3">
            <p className="text-sm font-medium">{jobTitle(job)}</p>
            <p className="text-muted-foreground text-xs">
              {formatISODateBR(job.createdAt.slice(0, 10))} · {statusLabel(job)}
              {job.model ? ` · ${job.model}` : ''}
            </p>
            {job.error && <p className="text-[var(--color-expense)] text-xs">{job.error}</p>}
            {job.kind === 'apply' && <AppliedSummary result={job.result} />}
          </li>
        ))}
      </ul>
    </section>
  )
}

function jobTitle(job: JobView): string {
  // As linhas antigas, de quando o diagnóstico ainda era um trabalho salvo. Não se cria
  // mais nenhuma, mas o histórico continua mostrando as que existem.
  if (job.kind === 'insights') return 'Diagnóstico'
  return job.input?.text?.trim() || 'Pedido sem texto'
}

/** O que entrou e o que não entrou numa confirmação. */
function AppliedSummary({ result }: { result: unknown }) {
  const report = result as { applied?: { description: string; ok: boolean; error?: string }[] } | null
  const applied = report?.applied ?? []
  if (applied.length === 0) return null

  return (
    <ul className="flex flex-col gap-1 pt-1">
      {applied.map((item, index) => (
        <li key={index} className="text-xs">
          <span className={item.ok ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'}>
            {item.ok ? '✓' : '✗'}
          </span>{' '}
          {item.description}
          {item.error ? ` — ${item.error}` : ''}
        </li>
      ))}
    </ul>
  )
}
