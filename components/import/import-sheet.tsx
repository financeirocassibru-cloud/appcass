'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import { commitImport, prepareImport, suggestImportCategories } from '@/lib/actions/import'
import { matchCategoryByKeywords } from '@/lib/finance/keywords'
import { matchStatementRows } from '@/lib/finance/reconcile'
import { formatCents } from '@/lib/finance/money'
import { checkTotals, ImportError, keyRows, type ParseResult } from '@/lib/import'
import { notesFrom } from '@/lib/import/describe'
import type { CategoryOption } from '@/lib/import/suggest'
import { AI_BATCH_SIZE } from '@/lib/validation/import'
import { FormMessage } from '@/components/auth/form-field'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { diaEMes, ImportReview, type ReviewRow, type RowPatch } from './import-review'

/**
 * Importar extrato: o gatilho discreto e a janela. v1.2 — 2026-09-27.
 *
 * v1.2: a linha cujo texto contém a palavra-chave de um item cadastrado e pendente (conta
 * fixa, renda fixa, parcela, avulso, meta) vem **conectada**: lançar marca o item como pago em
 * vez de criar outro. A conexão já vem aceita; "Não é este" solta, "Conectar" devolve.
 *
 * v1.1: a categoria nasce, nesta ordem, da **palavra-chave** da categoria (regra da pessoa,
 * casada aqui no aparelho contra a descrição e o texto original do banco), do histórico, e
 * — só quando a pessoa toca em **"Categorizar com IA"** — da IA, em lotes de 100
 * contrapartes, só para o que nenhuma das anteriores nem a própria pessoa resolveram.
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
  const [aiAvailable, setAiAvailable] = useState(false)
  /** Progresso da IA: quantas contrapartes já foram, de quantas. `null` fora da rodada. */
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null)
  const [aiNote, setAiNote] = useState<string | null>(null)

  const zerar = useCallback(() => {
    setPhase('choose')
    setErro(null)
    setParsed(null)
    setRows([])
    setAiAvailable(false)
    setAiProgress(null)
    setAiNote(null)
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
      // v1.2 — 2026-09-27: o que cada linha liquida. O texto original entra, como na categoria:
      // é nele que o banco escreve o nome de quem pagou.
      const links = matchStatementRows(
        keyed
          .filter((r) => !imported.has(r.importKey))
          .map((r) => ({
            importKey: r.importKey,
            occurredOn: r.occurredOn,
            kind: r.kind,
            amountCents: r.amountCents,
            text: `${r.description} ${r.original}`,
          })),
        setup.candidates,
      )
      const inicial: ReviewRow[] = keyed.map((r) => {
        const link = links[r.importKey] ?? null
        // Palavra-chave primeiro: é regra que a pessoa escreveu. O texto original entra na
        // comparação porque é nele que o banco escreve o estabelecimento — e ele não sai
        // do aparelho, a comparação é aqui.
        const porPalavra = matchCategoryByKeywords(`${r.description} ${r.original}`, r.kind, setup.categories)
        const doHistorico = setup.suggestions[r.importKey] ?? null
        // Conectada não é "parece duplicada": a pendência que ela liquida é justamente o que
        // fazia a linha parecer lançada à mão.
        const duplicate = !link && duplicates.has(r.importKey)
        return {
          ...r,
          imported: imported.has(r.importKey),
          duplicate,
          include: !imported.has(r.importKey) && !duplicate,
          link,
          linkSuggestion: link,
          categoryId: porPalavra?.categoryId ?? doHistorico,
          categorySource: porPalavra ? 'keyword' : doHistorico ? 'history' : null,
        }
      })

      setParsed(result)
      setCategories(setup.categories)
      setAiAvailable(setup.aiAvailable)
      setRows(inicial)
      setPhase('review')
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
    setRows((atual) =>
      atual.map((r) => {
        if (r.index !== index) return r
        // v1.2 — 2026-09-27: trocar entrada/saída desfaz a conexão — ela foi achada para o
        // tipo que o extrato dizia, e uma saída nunca liquida uma renda.
        const kindChanged = change.kind !== undefined && change.kind !== r.kind
        return kindChanged ? { ...r, ...change, link: null, linkSuggestion: null } : { ...r, ...change }
      }),
    )
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

  // O que a IA pode tentar: nem palavra-chave, nem histórico, nem escolha na tela. A linha
  // conectada fica com a categoria do item que ela liquida.
  const semCategoria = rows.filter(
    (r) => !r.imported && !r.link && r.categoryId === null && r.categorySource === null,
  )

  /**
   * "Categorizar com IA". v1.0 — 2026-09-27.
   *
   * Um pedido por lote de até 100 contrapartes, em sequência, aplicando cada lote assim que
   * volta — a pessoa vê a lista se preenchendo. Lote que falha é pulado, não derruba os
   * outros. A aplicação confere de novo, na hora, que a linha continua sem categoria: se a
   * pessoa escolheu uma enquanto a IA trabalhava, a dela fica.
   */
  const categorizarComIa = useCallback(async () => {
    const groups = new Map<string, { key: string; description: string; kind: 'income' | 'expense' }>()
    for (const r of semCategoria) {
      const key = `${r.kind}:${r.counterpartyKey}`
      if (!groups.has(key)) groups.set(key, { key, description: r.description, kind: r.kind })
    }
    const todos = [...groups.values()]
    if (todos.length === 0) return

    setAiNote(null)
    setAiProgress({ done: 0, total: todos.length })
    let achados = 0
    let falhas = 0

    for (let inicio = 0; inicio < todos.length; inicio += AI_BATCH_SIZE) {
      const lote = todos.slice(inicio, inicio + AI_BATCH_SIZE)
      const found = await suggestImportCategories(lote).catch(() => null)
      if (found === null) falhas += 1
      else {
        achados += Object.keys(found).length
        setRows((atual) =>
          atual.map((r) => {
            const id = found[`${r.kind}:${r.counterpartyKey}`]
            return id && r.categorySource === null && r.categoryId === null && !r.imported
              ? { ...r, categoryId: id, categorySource: 'ai' }
              : r
          }),
        )
      }
      setAiProgress({ done: Math.min(inicio + lote.length, todos.length), total: todos.length })
    }

    setAiProgress(null)
    setAiNote(
      achados === 0
        ? 'A IA não encontrou categoria segura para esses lançamentos.'
        : `A IA sugeriu categoria para ${achados === 1 ? '1 contraparte' : `${achados} contrapartes`}.` +
            (falhas > 0 ? ' Um lote não respondeu; tocar de novo tenta o que sobrou.' : ''),
    )
  }, [semCategoria])

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
        link: r.link ? { target: r.link.target, id: r.link.id, dueOn: r.link.dueOn } : null,
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
  const conectados = rows.filter((r) => r.link && r.include && !r.imported).length

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
              {conectados > 0 && (
                <p className="text-xs text-[var(--color-income)]">
                  {conectados === 1
                    ? '1 lançamento do extrato marca como pago um item que você já cadastrou.'
                    : `${conectados} lançamentos do extrato marcam como pagos itens que você já cadastrou.`}
                </p>
              )}
              {aiAvailable && (semCategoria.length > 0 || aiProgress || aiNote) && (
                <div className="flex flex-col gap-1.5">
                  {aiProgress ? (
                    <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
                      <Pontinhos /> Categorizando {aiProgress.done} de {aiProgress.total} contrapartes…
                    </p>
                  ) : semCategoria.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void categorizarComIa()}
                      disabled={phase === 'saving'}
                      className="min-h-11 w-full gap-2"
                    >
                      <Sparkles className="size-4" aria-hidden />
                      Categorizar com IA ({semCategoria.length === 1 ? '1 sem categoria' : `${semCategoria.length} sem categoria`})
                    </Button>
                  ) : null}
                  {aiNote && !aiProgress && <p className="text-muted-foreground text-xs">{aiNote}</p>}
                </div>
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
