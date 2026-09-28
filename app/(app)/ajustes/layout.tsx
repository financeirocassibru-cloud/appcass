import { createClient } from '@/lib/supabase/server'
import { AjustesTabs } from './tabs'

// v1.1 — 28/09/2026: layout de computador — a partir de `lg` (1024 px) a largura vai a
// `lg:max-w-2xl`. No celular continua `max-w-md`.
export default async function AjustesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  // A aba de convites nem aparece para quem não é admin. A RLS e a verificação
  // dentro de cada Server Action são os cadeados de verdade; esconder a aba é
  // só para não oferecer o que não vai funcionar.
  const { data: isAdmin } = await supabase.rpc('is_admin')

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-8 lg:max-w-2xl lg:px-10 lg:py-10">
      <h1 className="text-2xl font-bold tracking-tight">Ajustes</h1>
      <AjustesTabs isAdmin={isAdmin === true} />
      {children}
    </section>
  )
}
