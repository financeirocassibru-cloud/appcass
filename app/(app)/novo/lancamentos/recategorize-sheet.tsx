'use client'

import { useMemo, useState } from 'react'
import { Sparkles, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { applyCategories, prepareRecategorize, type RecategorizeSetup } from '@/lib/actions/entries'
import { suggestImportCategories } from '@/lib/actions/import'
import {
  aiGroups,
  aiProposals,
  keywordProposals,
  type Proposal,
} from '@/lib/import/recategorize'
import { AI_BATCH_SIZE } from '@/lib/validation/import'
import { FormMessage } from '@/components/auth/form-field'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

/**
 * "Categorizar" na seleção de "Todos os lançamentos". v1.0 — 2026-09-27.
 *
 * As mesmas duas fontes da importação — a palavra-chave da categoria e a IA —, aplicadas a
 * lançamentos que já existem: uma importação antiga que entrou sem categoria, ou o que foi
 * lançado antes de a palavra-chave existir.
 *
 * Três tempos, e nada é gravado antes do último:
 *  1. **escolher** — por palavra-chave, ou palavra-chave + IA; e se troca também os que já têm
 *     categoria (desligado por padrão: o que já está categorizado não muda sem pedido);
 *  2. **prévia** — "lançamento: atual → sugerida", cada linha com caixa de marcar;
 *  3. **aplicar** — só o que ficou marcado.
 *
 * "Com IA" roda a palavra-chave primeiro e manda à IA só o resto, em lotes de 100
 * contrapartes, como a importação: a regra escrita pela pessoa vence o palpite do modelo.
 */

type Phase = 'choose' | 'loading' | 'review' | 'saving'

export function RecategorizeSheet({
  open,
  onOpenChange,
  ids,
  importBatchIds,
  count,
  aiAvailable,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ids: string[]
  importBatchIds: string[]
  count: number
  aiAvailable: boolean
  onDone: () => void
}) {
  const [overwrite, setOverwrite] = useState(false)
  const [phase, setPhase] = useState<Phase>('choose')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [setup, setSetup] = useState<RecategorizeSetup | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set())
  const [note, setNote] = useState<string | null>(null)

  function reset() {
    setPhase('choose')
    setError(null)
    setProgress(null)
    setSetup(null)
    setProposals([])
    setUnchecked(new Set())
    setNote(null)
  }

  function close() {
    onOpenChange(false)
    setTimeout(reset, 250)
  }

  async function run(mode: 'keyword' | 'ai') {
    setError(null)
    setPhase('loading')
    setProgress('Lendo os lançamentos…')

    const loaded = await prepareRecategorize({ ids, importBatchIds }).catch(() => null)
    if (!loaded || loaded.error) {
      setError(loaded?.error ?? 'Não consegui ler os lançamentos.')
      setPhase('choose')
      setProgress(null)
      return
    }
    setSetup(loaded)

    const byKeyword = keywordProposals(loaded.targets, loaded.categories, overwrite)
    let result = byKeyword
    let aiFailures = 0

    if (mode === 'ai') {
      // A IA só vê o que a palavra-chave não resolveu.
      const decided = new Set(byKeyword.map((p) => p.id))
      const rest = loaded.targets.filter((t) => !decided.has(t.id))
      const { groups, idsByKey } = aiGroups(rest, overwrite)
      const found: Record<string, string> = {}

      for (let start = 0; start < groups.length; start += AI_BATCH_SIZE) {
        const batch = groups.slice(start, start + AI_BATCH_SIZE)
        setProgress(
          `Categorizando ${Math.min(start + batch.length, groups.length)} de ${groups.length} contrapartes…`,
        )
        const answer = await suggestImportCategories(batch).catch(() => null)
        if (answer === null) aiFailures += 1
        else Object.assign(found, answer)
      }

      result = [...byKeyword, ...aiProposals(rest, idsByKey, found)]
    }

    setProposals(result)
    setUnchecked(new Set())
    setNote(aiFailures > 0 ? 'Um lote da IA não respondeu; rodar de novo tenta o que sobrou.' : null)
    setProgress(null)
    setPhase('review')
  }

  async function apply() {
    const items = proposals
      .filter((p) => !unchecked.has(p.id))
      .map((p) => ({ id: p.id, categoryId: p.categoryId }))
    if (items.length === 0) return
    setPhase('saving')
    const result = await applyCategories({ items }).catch(() => null)
    if (!result || result.error) {
      setError(result?.error ?? 'Não foi possível categorizar.')
      setPhase('review')
      return
    }
    toast.success(result.success ?? 'Lançamentos categorizados.')
    close()
    onDone()
  }

  const names = useMemo(
    () => new Map((setup?.categories ?? []).map((c) => [c.id, c.name])),
    [setup],
  )
  const targetById = useMemo(
    () => new Map((setup?.targets ?? []).map((t) => [t.id, t])),
    [setup],
  )
  const chosen = proposals.filter((p) => !unchecked.has(p.id)).length

  return (
    <Sheet open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Categorizar</SheetTitle>
          <SheetDescription>
            {count === 1 ? '1 lançamento selecionado' : `${count} lançamentos selecionados`}. Nada
            muda antes de você conferir.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          {phase === 'choose' || phase === 'loading' ? (
            <>
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(event) => setOverwrite(event.target.checked)}
                  disabled={phase === 'loading'}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">Trocar também os que já têm categoria</span>
                  <span className="text-muted-foreground text-xs">
                    Desligado, só os lançamentos sem categoria recebem uma.
                  </span>
                </span>
              </label>

              {phase === 'loading' ? (
                <p role="status" className="text-muted-foreground text-sm">
                  {progress}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void run('keyword')}
                    className="min-h-11 justify-start gap-2"
                  >
                    <Tags className="size-4" aria-hidden />
                    Por palavra-chave
                  </Button>
                  {aiAvailable ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void run('ai')}
                      className="min-h-11 justify-start gap-2"
                    >
                      <Sparkles className="size-4" aria-hidden />
                      Palavra-chave + IA
                    </Button>
                  ) : null}
                  <p className="text-muted-foreground text-xs">
                    A palavra-chave usa as que você cadastrou em Ajustes › Categorias.
                    {aiAvailable
                      ? ' Com IA, o que nenhuma palavra resolver vai para a IA, em lotes de 100.'
                      : ''}
                  </p>
                </div>
              )}
            </>
          ) : null}

          <FormMessage error={error ?? undefined} />

          {phase === 'review' || phase === 'saving' ? (
            proposals.length === 0 ? (
              <>
                <p className="text-muted-foreground text-sm">
                  Nenhuma categoria nova para sugerir
                  {overwrite ? '.' : ' — os sem categoria não casaram com nada.'}
                </p>
                {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
                <Button type="button" variant="ghost" onClick={reset} className="min-h-11">
                  Voltar
                </Button>
              </>
            ) : (
              <>
                {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
                <ul className="divide-border bg-card divide-y rounded-xl border">
                  {proposals.map((proposal) => {
                    const target = targetById.get(proposal.id)
                    const current = target?.categoryId ? names.get(target.categoryId) : null
                    return (
                      <li key={proposal.id}>
                        <label className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={!unchecked.has(proposal.id)}
                            onChange={() => {
                              const next = new Set(unchecked)
                              if (next.has(proposal.id)) next.delete(proposal.id)
                              else next.add(proposal.id)
                              setUnchecked(next)
                            }}
                            className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-sm font-medium">
                              {target?.description}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {current ?? 'Sem categoria'} →{' '}
                              <span className="text-foreground font-medium">
                                {names.get(proposal.categoryId)}
                              </span>
                              {' · '}
                              {proposal.source.type === 'keyword'
                                ? `palavra-chave “${proposal.source.keyword}”`
                                : 'IA'}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>

                <div className="bg-background sticky bottom-0 -mx-4 flex flex-col gap-2 border-t px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
                  <Button
                    type="button"
                    onClick={() => void apply()}
                    disabled={phase === 'saving' || chosen === 0}
                    className="min-h-12 w-full text-base"
                  >
                    {phase === 'saving'
                      ? 'Aplicando…'
                      : chosen === 1
                        ? 'Aplicar a 1 lançamento'
                        : `Aplicar a ${chosen} lançamentos`}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={reset}
                    disabled={phase === 'saving'}
                    className="min-h-11 w-full text-sm"
                  >
                    Voltar
                  </Button>
                </div>
              </>
            )
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
