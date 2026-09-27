'use client'

import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { addDays, type ISODate } from '@/lib/finance/date'
import { analysisHref, type RawAnalysisParams } from './params'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * O período que a Análise mostra: atalhos e, atrás deles, as duas datas.
 *
 * v1.0 — 2026-09-27.
 *
 * Os atalhos vêm primeiro porque é o que se usa; as duas datas existem porque o pedido é poder
 * recortar um período específico do passado **ou** do futuro, e nenhum conjunto de atalhos cobre
 * isso. Arrastar o gráfico também muda o período — este controle é a via explícita, e a única
 * alcançável por teclado.
 */

interface Preset {
  label: string
  from: (today: ISODate) => ISODate
  to: (today: ISODate) => ISODate
}

const PRESETS: Preset[] = [
  { label: '30 dias atrás', from: (t) => addDays(t, -30), to: (t) => t },
  // O padrão da tela: o passado recente mais o que vem.
  { label: 'Agora', from: (t) => addDays(t, -30), to: (t) => addDays(t, 90) },
  { label: '6 meses à frente', from: (t) => t, to: (t) => addDays(t, 180) },
  { label: '1 ano', from: (t) => addDays(t, -180), to: (t) => addDays(t, 180) },
]

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

  function go(from: ISODate, to: ISODate) {
    router.replace(analysisHref(params, { de: from, ate: to }) as Route, { scroll: false })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
        {PRESETS.map((preset) => {
          const from = preset.from(today)
          const to = preset.to(today)
          const active = from === focusFrom && to === focusTo

          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={active}
              onClick={() => go(from, to)}
              className={cn(
                'min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-card text-foreground',
              )}
            >
              {preset.label}
            </button>
          )
        })}
      </div>

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
            onChange={(event) => event.target.value && go(event.target.value, focusTo)}
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
            onChange={(event) => event.target.value && go(focusFrom, event.target.value)}
            className="min-h-11 text-sm"
          />
        </div>
      </div>
    </div>
  )
}
