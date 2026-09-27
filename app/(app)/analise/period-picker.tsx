'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import type { ISODate } from '@/lib/finance/date'
import {
  ANALYSIS_PERIOD_LABELS,
  ANALYSIS_PERIODS,
  analysisPeriodRange,
  isAnalysisPeriod,
  matchAnalysisPeriod,
} from '@/lib/finance/periods'
import { saveAnalysisPeriod } from '@/lib/actions/profile'
import { analysisHref, type RawAnalysisParams } from './params'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * O período que a Análise mostra. v2.0 — 2026-09-27.
 *
 * v2.0: um menu no lugar da fileira de botões. O padrão é **Período específico** — as duas
 * datas, De e Até —, e os atalhos (Últimos 30 dias, Mês passado, Este ano…) moram só dentro do
 * menu: o topo da tela ficou com um controle em vez de cinco. Escolhido um atalho, as datas
 * somem e fica só a legenda do intervalo; voltar a "Período específico" as traz de volta com o
 * intervalo que estava na tela.
 *
 * **O último período escolhido vira o padrão da pessoa** (`saveAnalysisPeriod`, colunas
 * `analysis_*` do perfil). Guarda o atalho, não as datas, para "Próximos 30 dias" andar com o
 * calendário. Arrastar o gráfico também muda o período, mas não é uma escolha de filtro — e
 * não mexe no padrão.
 *
 * Escolher um atalho tira a escala da URL: a escala padrão acompanha a extensão, e "Este ano"
 * herdando a escala diária de "Últimos 30 dias" abriria 365 pontos.
 *
 * v1.0 — 2026-09-27: atalhos em botões e, atrás deles, as duas datas.
 */

const CUSTOM = 'custom'

export function PeriodPicker({
  params,
  today,
  focusFrom,
  focusTo,
  historyStartsOn,
}: {
  params: RawAnalysisParams
  today: ISODate
  focusFrom: ISODate
  focusTo: ISODate
  historyStartsOn: ISODate
}) {
  const router = useRouter()
  const matched = matchAnalysisPeriod(focusFrom, focusTo, today)
  // "Período específico" escolhido no menu enquanto a tela mostra um atalho: as datas
  // aparecem sem navegar, com o intervalo que já está na tela.
  const [customOpen, setCustomOpen] = useState(false)
  const value = customOpen || !matched ? CUSTOM : matched

  function remember(input: Parameters<typeof saveAnalysisPeriod>[0]) {
    // Sem esperar: a tela já mostra o período pedido, e uma falha aqui só deixa o padrão
    // como estava.
    void saveAnalysisPeriod(input).catch(() => undefined)
  }

  function choose(next: string) {
    if (next === CUSTOM) {
      setCustomOpen(true)
      remember({ period: CUSTOM, from: focusFrom, to: focusTo })
      return
    }
    if (!isAnalysisPeriod(next)) return
    setCustomOpen(false)
    remember({ period: next })
    const range = analysisPeriodRange(next, today)
    router.replace(analysisHref(params, { de: range.from, ate: range.to, escala: undefined }) as Route, {
      scroll: false,
    })
  }

  function goCustom(from: ISODate, to: ISODate) {
    if (from > to) return
    setCustomOpen(true)
    remember({ period: CUSTOM, from, to })
    router.replace(analysisHref(params, { de: from, ate: to }) as Route, { scroll: false })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="analise-periodo" className="text-xs">
          Período
        </Label>
        <select
          id="analise-periodo"
          value={value}
          onChange={(event) => choose(event.target.value)}
          className="border-input bg-card focus-visible:border-primary min-h-11 rounded-lg border px-3 text-base outline-none"
        >
          <option value={CUSTOM}>Período específico</option>
          {ANALYSIS_PERIODS.map((period) => (
            <option key={period} value={period}>
              {ANALYSIS_PERIOD_LABELS[period]}
            </option>
          ))}
        </select>
        {value !== CUSTOM ? (
          <p className="text-muted-foreground text-xs">
            {formatShort(focusFrom)} a {formatShort(focusTo)}
          </p>
        ) : null}
      </div>

      {value === CUSTOM ? (
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="analise-de" className="text-xs">
              De
            </Label>
            <Input
              id="analise-de"
              type="date"
              value={focusFrom}
              // O histórico não existe antes da âncora do saldo, então o campo não deixa pedir
              // antes dela: seria um pedido que a tela teria de recusar depois.
              min={historyStartsOn}
              max={focusTo}
              onChange={(event) => event.target.value && goCustom(event.target.value, focusTo)}
              className="min-h-11 text-sm"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="analise-ate" className="text-xs">
              Até
            </Label>
            <Input
              id="analise-ate"
              type="date"
              value={focusTo}
              min={focusFrom}
              onChange={(event) => event.target.value && goCustom(focusFrom, event.target.value)}
              className="min-h-11 text-sm"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** `2026-09-27` → `27/09/26`, fatiando a string — nunca `Date` (invariante 2). */
function formatShort(date: ISODate): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year?.slice(2)}`
}
