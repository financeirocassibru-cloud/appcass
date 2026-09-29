import Link from 'next/link'

/**
 * O aviso do celular — v1.0 — 28/09/2026 (Fase 14).
 *
 * A planilha é só do computador: doze colunas de valor não cabem numa tela de celular sem virar
 * rolagem lateral, que é o que `docs/DESIGN.md` proíbe. O link mora só na barra lateral (que só
 * existe a partir de `lg`); quem chegar pelo endereço no celular lê isto no lugar da grade.
 */
export function DesktopOnly() {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-[var(--surface)] p-5 lg:hidden">
      <p className="font-semibold">A planilha é para o computador.</p>
      <p className="text-muted-foreground text-sm">
        Abra o app numa tela maior para ver e editar mês a mês. No celular, os mesmos lançamentos
        estão no Histórico e na Análise.
      </p>
      <div className="flex gap-4 text-sm">
        <Link href="/historico" className="text-[var(--brand)] underline">
          Histórico
        </Link>
        <Link href="/analise" className="text-[var(--brand)] underline">
          Análise
        </Link>
      </div>
    </div>
  )
}
