import { createClient } from '@/lib/supabase/server'
import { AjustesTabs } from './tabs'

export default async function AjustesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  // A aba de convites nem aparece para quem não é admin. A RLS e a verificação
  // dentro de cada Server Action são os cadeados de verdade; esconder a aba é
  // só para não oferecer o que não vai funcionar.
  const { data: isAdmin } = await supabase.rpc('is_admin')

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Ajustes</h1>
      <AjustesTabs isAdmin={isAdmin === true} />
      {children}
    </section>
  )
}
