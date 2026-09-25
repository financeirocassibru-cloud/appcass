export const metadata = { title: 'Projeção · Finanças' }

export default function ProjecaoPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Projeção</h1>
      <p className="text-muted-foreground text-sm">
        O fluxo diário e os cenários entram na fase 5. O motor de cálculo já existe e está
        testado em <code className="bg-muted rounded px-1.5 py-0.5 text-xs">lib/finance/projection.ts</code>;
        falta a tela.
      </p>
    </main>
  )
}
