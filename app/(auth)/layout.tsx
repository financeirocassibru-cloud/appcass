import { Logo } from '@/components/app/logo'

// v1.1 — 27/09/2026: logo Cass no topo, acima do conteúdo. Fica no layout, e não em cada
// página, para aparecer igual em "Entrar", "Criar conta" e "Primeira conta".
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Logo height={56} className="mb-6" />
        {children}
      </div>
    </main>
  )
}
