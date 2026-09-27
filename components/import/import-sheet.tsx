'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { commitImport, prepareImport, suggestImportCategories } from '@/lib/actions/import'
import { formatCents } from '@/lib/finance/money'
import { checkTotals, ImportError, keyRows, type ParseResult } from '@/lib/import'
import { notesFrom } from '@/lib/import/describe'
import type { CategoryOption } from '@/lib/import/suggest'
import { FormMessage } from '@/components/auth/form-field'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { diaEMes, ImportReview, type ReviewRow, type RowPatch } from './import-review'

/**
 * Importar extrato: o gatilho discreto e a janela. v1.0 — 2026-09-27.
 *
 * O gatilho mora logo abaixo da caixa do assistente, no Início, com a mesma cara do "Ver
 * tudo" da agenda: um texto, não um botão. Importar é raro; o que se faz todo dia é contar
 * o que aconteceu, e a caixa continua sendo o destaque.
 *
 * O fluxo tem os mesmos tempos do assistente — ler, mostrar o que entendeu, deixar ajustar,
 * só então gravar:
 *
 *  1. **escolher** o arquivo (PDF ou CSV);
 *  2. **ler** — no aparelho. O arquivo nunca vai para o servidor nem para o banco;
 *  3. **conferir** — com a soma comparada ao total do extrato, o que já foi importado fora,
 *     o que parece lançado à mão desmarcado, e as categorias sugeridas (histórico, depois IA);
 *  4. **lançar** o que ficou marcado.
 */

type Phase = 'choose' | 'reading' | 'review' | 'saving'

export function ImportStatementLink() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="flex justify-end">
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-[var(--brand)] underline">
          Importar extrato
        </button>
      </div>
      <ImportSheet open={open} onOpenChange={setOpen} />
    </>
  )
}

function ImportSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('choose')
  const [erro, setErro] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [aiWorking, setAiWorking] = useState(false)

  const zerar = useCallback(() => {
    setPhase('choose')
    setErro(null)
    setParsed(null)
    setRows([])
    setAiWorking(false)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const fechar = useCallback(() => {
    onOpenChange(false)
    // Volta ao zero depois da animação — e larga da memória o que foi lido do arquivo.
    setTimeout(zerar, 250)
  }, [onOpenChange, zerar])

  const ler = useCallback(async (file: File) => {
    setErro(null)
    setPhase('reading')
    try {
      // Import dinâmico: o leitor de PDF (pdf.js, pesado) só desce quando alguém importa.
      const { readStatementFile } = await import('@/lib/import/read-file')
      const result = await readStatementFile(file)
      const keyed = await keyRows(result)

      const setup = await prepareImport(
        keyed.map((r) => ({
          occurredOn: r.occurredOn,
          kind: r.kind,
          amountCents: r.amountCents,
          description: r.description,
          importKey: r.importKey,
        })),
      )
      if (setup.error) throw new ImportError(setup.error)

      const imported = new Set(setup.alreadyImported)
      const duplicates = new Set(setup.possibleDuplicates)
      const inicial: ReviewRow[] = keyed.map((r) => {
        const suggestion = setup.suggestions[r.importKey] ?? null
        return {
          ...r,
          imported: imported.has(r.importKey),
          duplicate: duplicates.has(r.importKey),
          include: !imported.has(r.importKey) && !duplicates.has(r.importKey),
          categoryId: suggestion,
          categorySource: suggestion ? 'history' : null,
        }
      })

      setParsed(result)
      setCategories(setup.categories)
      setRows(inicial)
      setPhase('review')

      // O que o histórico não resolveu vai para a IA, um pedido por contraparte — enquanto a
      // pessoa já confere. A sugestão nunca passa por cima de escolha feita na tela.
      if (setup.aiAvailable) {
        const groups = new Map<string, { key: string; description: string; kind: 'income' | 'expense' }>()
        for (const r of inicial) {
          if (r.imported || r.categoryId) continue
          const key = `${r.kind}:${r.counterpartyKey}`
          if (!groups.has(key) && groups.size < 300) groups.set(key, { key, description: r.description, kind: r.kind })
        }
        if (groups.size > 0) {
          setAiWorking(true)
          const found = await suggestImportCategories([...groups.values()]).catch(() => ({}) as Record<string, string>)
          setAiWorking(false)
          setRows((atual) =>
            atual.map((r) => {
              const id = found[`${r.kind}:${r.counterpartyKey}`]
              return id && r.categorySource === null && r.categoryId === null
                ? { ...r, categoryId: id, categorySource: 'ai' }
                : r
            }),
          )
        }
      }
    } catch (error) {
      setPhase('choose')
      setErro(
        error instanceof ImportError
          ? error.message
          : 'Não consegui ler este arquivo. Confira se é o extrato em PDF ou CSV baixado do banco.',
      )
      if (inputRef.current) inputRef.current.value = ''
    }
  }, [])

  const patch = useCallback((index: number, change: RowPatch) => {
    setRows((atual) => atual.map((r) => (r.index === index ? { ...r, ...change } : r)))
  }, [])

  const patchGroup = useCallback(
    (counterpartyKey: string, kind: 'income' | 'expense', categoryId: string | null) => {
      setRows((atual) =>
        atual.map((r) =>
          r.counterpartyKey === counterpartyKey && r.kind === kind && !r.imported
            ? { ...r, categoryId, categorySource: 'user' }
            : r,
        ),
      )
    },
    [],
  )

  const selecionados = rows.filter((r) => r.include && !r.imported)

  const lancar = useCallback(async () => {
    setErro(null)
    setPhase('saving')
    const resposta = await commitImport(
      selecionados.map((r) => ({
        occurredOn: r.occurredOn,
        kind: r.kind,
        amountCents: r.amountCents,
        description: r.description,
        notes: notesFrom(r.original),
        categoryId: r.categoryId,
        importKey: r.importKey,
      })),
    )
    if (resposta.success) {
      toast.success(resposta.success)
      fechar()
      // Sem isto, o Início por trás continuaria mostrando o saldo velho.
      router.refresh()
      return
    }
    setErro(resposta.error ?? 'Não consegui importar.')
    setPhase('review')
  }, [selecionados, fechar, router])

  const totais = parsed ? checkTotals(rows, parsed.statementTotals) : null
  // Mínimo e máximo, não primeira e última: há banco que lista do mais novo para o mais velho.
  const datas = rows.map((r) => r.occurredOn).sort()
  const periodo = datas.length > 0 ? `${diaEMes(datas[0] ?? '')} a ${diaEMes(datas.at(-1) ?? '')}` : ''
  const jaImportados = rows.filter((r) => r.imported).length
  const duplicados = rows.filter((r) => r.duplicate && !r.imported).length

  return (
    <Sheet open={open} onOpenChange={(v) => (v ? onOpenChange(true) : fechar())}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Importar extrato</SheetTitle>
          <SheetDescription>
            PDF ou CSV do banco. Eu mostro o que li antes de lançar qualquer coisa.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          {phase === 'choose' && (
            <>
              <label className="bg-card flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-5 text-center">
                <span className="text-base font-semibold">Escolher arquivo</span>
                <span className="text-muted-foreground text-xs">PDF ou CSV · até 1000 lançamentos</span>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.csv,.txt,application/pdf,text/csv"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void ler(file)
                  }}
                />
              </label>
              <p className="text-muted-foreground text-xs">
                O arquivo é lido aqui no seu aparelho e não é guardado. Só os lançamentos que você
                confirmar são registrados.
              </p>
            </>
          )}

          {phase === 'reading' && (
            <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
              <Pontinhos /> Lendo o extrato…
            </p>
          )}

          <FormMessage error={erro ?? undefined} />

          {(phase === 'review' || phase === 'saving') && parsed && totais && (
            <>
              <div className="flex flex-col gap-1 rounded-xl bg-[var(--surface)] p-3 text-sm">
                <p className="font-medium">
                  {parsed.bankHint ? `${parsed.bankHint} · ` : ''}
                  {rows.length === 1 ? '1 lançamento' : `${rows.length} lançamentos`} · {periodo}
                </p>
                <p className="tabular text-muted-foreground text-xs">
                  Entradas <span className="text-[var(--color-income)]">+{formatCents(totais.incomeCents)}</span> · Saídas{' '}
                  <span className="text-[var(--color-expense)]">−{formatCents(totais.expenseCents)}</span>
                </p>
                {totais.matches === true && (
                  <p className="text-xs text-[var(--color-income)]">A soma bate com o total do extrato.</p>
                )}
              </div>

              {totais.message && <FormMessage error={totais.message} />}
              {parsed.warnings.map((aviso) => (
                <p key={aviso} className="text-muted-foreground text-xs">
                  {aviso}
                </p>
              ))}
              {jaImportados > 0 && (
                <p className="text-muted-foreground text-xs">
                  {jaImportados === rows.length
                    ? 'Tudo neste extrato já foi importado antes.'
                    : `${jaImportados} já foram importados antes e ficam de fora.`}
                </p>
              )}
              {duplicados > 0 && (
                <p className="text-muted-foreground text-xs">
                  {duplicados === 1
                    ? '1 parece já ter sido lançado à mão (mesmo dia e valor) e veio desmarcado.'
                    : `${duplicados} parecem já ter sido lançados à mão (mesmo dia e valor) e vieram desmarcados.`}
                </p>
              )}
              {aiWorking && (
                <p role="status" className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Pontinhos /> Sugerindo categorias…
                </p>
              )}

              <ImportReview rows={rows} categories={categories} onPatch={patch} onPatchCategoryGroup={patchGroup} />

              <div className="bg-background sticky bottom-0 -mx-4 flex flex-col gap-2 border-t px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
                <Button
                  onClick={() => void lancar()}
                  disabled={phase === 'saving' || selecionados.length === 0}
                  className="min-h-12 w-full text-base"
                >
                  {phase === 'saving'
                    ? 'Lançando…'
                    : selecionados.length === 1
                      ? 'Lançar 1 lançamento'
                      : `Lançar ${selecionados.length} lançamentos`}
                </Button>
                <Button variant="ghost" onClick={zerar} disabled={phase === 'saving'} className="min-h-11 w-full text-sm">
                  Escolher outro arquivo
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** Três pontos, como o "digitando" do assistente. */
function Pontinhos() {
  return (
    <span aria-hidden className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="bg-muted-foreground/50 size-1.5 animate-pulse rounded-full"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  )
}
