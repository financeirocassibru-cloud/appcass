'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { ScenarioSummary } from '@/lib/db/queries/scenarios'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { NewScenarioForm } from '@/app/(app)/cenarios/new-form'
import { ScenarioPicker } from './scenario-picker'
import type { RawAnalysisParams } from './params'

/**
 * A escolha do cenário, e a criação de um novo sem sair da Análise.
 *
 * v1.0 — 2026-09-27: criar um cenário exigia ir a Mais → Cenários, marcar como padrão e voltar.
 * A simulação nasce aqui, olhando a curva, então é aqui que ela tem de poder começar. `/cenarios`
 * continua existindo para renomear, ativar e excluir.
 */
export function ScenarioBar({
  scenarios,
  selectedId,
  params,
  today,
  defaultEnd,
}: {
  scenarios: ScenarioSummary[]
  selectedId: string | null
  params: RawAnalysisParams
  today: string
  defaultEnd: string
}) {
  const [creating, setCreating] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <ScenarioPicker scenarios={scenarios} selectedId={selectedId} params={params} />

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setCreating(true)}
          className="text-muted-foreground min-h-11 gap-2 text-xs"
        >
          <Plus className="size-4" aria-hidden />
          Novo cenário
        </Button>

        {scenarios.length > 0 ? (
          <Link href="/cenarios" className="text-xs text-[var(--brand)] underline">
            Gerenciar
          </Link>
        ) : null}
      </div>

      {scenarios.length === 0 ? (
        <p className="text-xs text-[var(--foreground-muted)]">
          Um cenário simula uma mudança — adiar uma conta, mudar um valor, somar um gasto que ainda
          não existe — sem mexer nos seus lançamentos.
        </p>
      ) : null}

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto px-6 pt-6 pb-8">
          <SheetHeader className="px-0">
            <SheetTitle>Novo cenário</SheetTitle>
            <SheetDescription>
              Ele começa vazio: os ajustes entram tocando num período do gráfico.
            </SheetDescription>
          </SheetHeader>

          <NewScenarioForm
            today={today}
            defaultEnd={defaultEnd}
            onCreated={() => setCreating(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}
