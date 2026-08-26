export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6">
      <h1 className="text-2xl font-bold tracking-tight">Finanças</h1>
      <p className="text-[var(--foreground-muted)]">
        Fundação instalada. As telas chegam na fase 03 — ver{' '}
        <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-sm">docs/ROADMAP.md</code>.
      </p>
    </main>
  )
}
