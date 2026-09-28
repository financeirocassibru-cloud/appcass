import Link from 'next/link'
import { listScenarios } from '@/lib/db/queries/scenarios'
import { todayISO, addMonths } from '@/lib/finance/date'
import { NewScenarioForm } from './new-form'
import { ScenarioRow } from './scenario-row'

// v1.1 — 27/09/2026: só o nome da tela; o "· Cass" vem do `template` do layout raiz.
export const metadata = { title: 'Cenários' }
export const dynamic = 'force-dynamic'

// v1.2 — 28/09/2026: layout de computador — a partir de `lg` (1024 px) a largura vai a `lg:max-w-4xl` (lista) e os cartões ficam em duas colunas. No celular continua `max-w-md`, uma coluna.
export default async function CenariosPage() {
  const today = todayISO()
  const scenarios = await listScenarios()

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8 lg:max-w-4xl lg:px-10 lg:py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Cenários</h1>
        <p className="text-sm text-[var(--foreground-muted)]">
          Um cenário é uma pergunta: e se eu adiasse esta conta? E se comprasse aquilo? Ele muda a
          projeção e <strong>não toca nos seus lançamentos</strong> — dá para apagar a qualquer
          momento sem perder nada.
        </p>
      </div>

      {scenarios.length > 0 ? (
        <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
          {scenarios.map((scenario) => (
            <ScenarioRow key={scenario.id} scenario={scenario} />
          ))}
        </ul>
      ) : null}

      <section className="flex flex-col gap-3 rounded-xl bg-[var(--surface)] p-5">
        <h2 className="text-base font-semibold">
          {scenarios.length === 0 ? 'Criar o primeiro cenário' : 'Novo cenário'}
        </h2>
        <NewScenarioForm today={today} defaultEnd={addMonths(today, 6)} />
      </section>

      <p className="text-xs text-[var(--foreground-muted)]">
        Os ajustes — excluir uma conta, mudar valor, mudar data — você faz na{' '}
        <Link href="/analise" className="text-[var(--brand)] underline">
          projeção
        </Link>
        , com o cenário selecionado.
      </p>
    </main>
  )
}
