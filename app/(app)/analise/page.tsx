import Link from 'next/link'
import { AlertTriangle, TrendingUp } from 'lucide-react'
import { getWindow } from '@/lib/db/queries/projection'
import { getActiveScenarioId, listScenarios } from '@/lib/db/queries/scenarios'
import { listActiveCategories } from '@/lib/db/queries/categories'
import { listEntriesInRange } from '@/lib/db/queries/entries'
import { formatDayLabel } from '@/lib/finance/grouping'
import { formatCents } from '@/lib/finance/money'
import { addDays, todayISO } from '@/lib/finance/date'
import { bucketCountBetween } from '@/lib/finance/buckets'
import type { EntryWithCategory } from '@/lib/db/queries/entries'
import { isAiConfigured } from '@/lib/ai/env'
import { createClient } from '@/lib/supabase/server'
import { InsightsPanel } from '@/components/ai/insights-panel'
import { Balance } from '@/components/finance/money'
import { AnalysisWindow } from './analysis-window'
import { MonthlyAnalysis } from './monthly-analysis'
import { parseAnalysisParams, SCALE_PARAM, type RawAnalysisParams } from './params'
import { PeriodPicker } from './period-picker'
import { ScaleTabs } from './scale-tabs'
import { ScenarioBar } from './scenario-bar'
import { ScenarioEntries } from './scenario-entries'

export const metadata = { title: 'Análise · Finanças' }
/** Depende de "hoje" e do banco: prerenderizada, congelaria os dois. */
export const dynamic = 'force-dynamic'

/**
 * A Análise.
 *
 * v2.0 — 2026-09-27: era a Projeção, em `/projecao`, e olhava só para frente — `?dias=30|90|180`
 * a partir de hoje, num gráfico de largura fixa sem clique e sem arrasto. Agora a janela
 * atravessa passado e futuro numa curva só, a escala é dia/semana/mês, arrastar navega pelo
 * período, e tocar num ponto abre o detalhamento daquele período com lançar, alterar e excluir.
 *
 * `maxDuration = 60` continua aqui pelo motivo de sempre: a Server Action do diagnóstico é
 * POSTada para a rota atual, então ela roda sob o orçamento desta página, e `runInsights` espera
 * até 40s pela resposta do modelo. Sem a linha, a plataforma corta a função no meio e a pessoa
 * recebe um erro de rede em vez do resumo.
 *
 * v2.1 — 2026-09-27: os itens hipotéticos recebem as categorias, porque passaram a ser
 * editáveis — inclusive os que vieram de "Duplicar hábitos".
 */
export const maxDuration = 60

export default async function AnalisePage({
  searchParams,
}: {
  // Next 16: `searchParams` é assíncrono (invariante 12).
  searchParams: Promise<RawAnalysisParams>
}) {
  const raw = await searchParams
  const today = todayISO()
  const { focusFrom, focusTo, granularity, scenarioParam, months } = parseAnalysisParams(raw, today)

  const supabase = await createClient()

  const [scenarios, activeId, { data: profile }] = await Promise.all([
    listScenarios(),
    getActiveScenarioId(),
    // Desligado nos ajustes, o diagnóstico não aparece acinzentado: ele não é renderizado.
    supabase.from('profiles').select('ai_insights_enabled').maybeSingle(),
  ])

  // `cenario=real` é a escolha explícita de ver a projeção sem cenário; sem o parâmetro, abre o
  // cenário marcado como padrão. Sem essa distinção não haveria como voltar à projeção real
  // depois de marcar um padrão.
  const selectedId =
    scenarioParam === 'real' ? undefined : (scenarioParam ?? activeId ?? undefined)

  // A janela é buscada com folga de uma tela para cada lado: arrastar uma extensão inteira passa
  // a custar zero requisição, e só ao chegar perto da borda da folga é que a URL muda.
  const pad = Math.min(Math.max(bucketCountBetween(focusFrom, focusTo, 'day'), 30), 180)

  const window = await getWindow({
    from: addDays(focusFrom, -pad),
    to: addDays(focusTo, pad),
    today,
    scenarioId: selectedId,
  })

  // Os lançamentos reais da janela, para o formulário de edição abrir preenchido. O motor entrega
  // ocorrências, que não carregam categoria nem `notes`; quem tem isso é a linha de `entries`.
  const [entries, expenseCategories, incomeCategories] = await Promise.all([
    listEntriesInRange(window.from, window.to, 2_000),
    listActiveCategories('expense'),
    listActiveCategories('income'),
  ])

  const entriesById: Record<string, EntryWithCategory> = {}
  for (const entry of entries) entriesById[entry.id] = entry

  const adjustedTargets = (window.scenario?.overrides ?? []).map(
    (override) =>
      `${override.targetType}:${override.targetId}:${override.occurrenceKey ?? ''}`,
  )

  // A escala efetiva volta para a URL dos controles, senão trocar de período com a escala
  // implícita a faria pular de dia para mês sem ninguém ter pedido.
  const params: RawAnalysisParams = { ...raw, escala: SCALE_PARAM[granularity] }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Análise</h1>
        <p className="text-sm text-[var(--foreground-muted)]">
          O que já aconteceu e o que está por vir, na mesma curva.
        </p>
      </div>

      {/* Uma fileira de controles acima de tudo que eles recortam — nunca um por gráfico. */}
      <div className="flex flex-col gap-3">
        <PeriodPicker
          params={params}
          today={today}
          focusFrom={focusFrom}
          focusTo={focusTo}
          historyStartsOn={window.historyStartsOn}
        />
        <ScaleTabs current={granularity} params={params} />
        <ScenarioBar
          scenarios={scenarios}
          selectedId={window.scenario?.id ?? null}
          params={params}
          today={today}
          // O cenário novo nasce cobrindo o período que está na tela: é o que a pessoa está
          // olhando quando decide simular.
          defaultEnd={focusTo}
        />
      </div>

      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface)] p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--foreground-muted)]">Saldo hoje</p>
            <Balance cents={window.currentBalanceCents} className="text-xl" />
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--foreground-muted)]">
              Em {formatDayLabel(focusTo, today)}
            </p>
            <Balance
              cents={
                window.days.find((day) => day.date === focusTo)?.balanceCents ??
                window.days.at(-1)?.balanceCents ??
                window.currentBalanceCents
              }
              className="text-xl"
            />
          </div>
        </div>

        <AnalysisWindow
          days={window.days}
          realDays={window.realDays}
          granularity={granularity}
          today={today}
          windowFrom={window.from}
          focusFrom={focusFrom}
          focusTo={focusTo}
          historyStartsOn={window.historyStartsOn}
          firstNegativeDay={window.firstNegativeDay}
          entriesById={entriesById}
          expenseCategories={expenseCategories}
          incomeCategories={incomeCategories}
          scenarioId={window.scenario?.id ?? null}
          adjustedTargets={adjustedTargets}
        />
      </section>

      {/* O alerta é texto, não só a cor do gráfico: quem não distingue a área vermelha tem de
          receber o mesmo aviso. E ele nomeia o DIA, mesmo na escala mensal — sai da série diária,
          antes de qualquer agrupamento. */}
      {window.firstNegativeDay ? (
        <p className="flex items-start gap-2 rounded-xl bg-[var(--surface)] p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--expense)]" aria-hidden />
          <span>
            <span className="font-semibold text-[var(--expense)]">
              O saldo fica negativo em {formatDayLabel(window.firstNegativeDay, today)}
            </span>
            . Dá para adiar ou cancelar algo antes disso?
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-xl bg-[var(--surface)] p-4 text-sm">
          <TrendingUp className="mt-0.5 size-4 shrink-0 text-[var(--income)]" aria-hidden />
          <span>O saldo não fica negativo neste período.</span>
        </p>
      )}

      {/* O corte à esquerda é dito, não escondido: antes da âncora o app não sabe qual era o
          saldo, e desenhar zero ali seria inventar. */}
      {window.isTruncatedAtAnchor ? (
        <p className="text-xs text-[var(--foreground-muted)]">
          O histórico começa em {formatDayLabel(window.historyStartsOn, today)}, o dia em que você
          informou quanto tinha. Antes disso o app não sabe qual era o seu saldo
          {window.isAnchorConfigured ? (
            '.'
          ) : (
            <>
              {' — '}
              <Link href="/ajustes/saldo" className="text-[var(--brand)] underline">
                ajuste o saldo
              </Link>
              .
            </>
          )}
        </p>
      ) : null}

      {window.overdueCents !== 0 ? (
        <p className="text-xs text-[var(--foreground-muted)]">
          {window.overdueIsOutsideWindow ? (
            <>
              Não mostrado aqui:{' '}
              <span className="tabular">{formatCents(Math.abs(window.overdueCents))}</span> de
              contas vencidas neste período e ainda não pagas. Elas contam a partir de hoje.
            </>
          ) : (
            <>
              Inclui{' '}
              <span className="tabular">{formatCents(Math.abs(window.overdueCents))}</span> de
              contas já vencidas, contadas no primeiro dia —{' '}
              <Link
                href="/historico?status=pendente"
                className="text-[var(--brand)] underline"
              >
                ver quais
              </Link>
              .
            </>
          )}
        </p>
      ) : null}

      {window.scenario ? <ScenarioEntries
          scenario={window.scenario}
          today={today}
          expenseCategories={expenseCategories}
          incomeCategories={incomeCategories}
        /> : null}

      <MonthlyAnalysis months={months} params={params} today={today} />

      {isAiConfigured() && profile?.ai_insights_enabled && <InsightsPanel />}
    </main>
  )
}
