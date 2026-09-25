import { BottomNav } from '@/components/app/bottom-nav'
import { Toaster } from '@/components/ui/sonner'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/*
        `pb-24` reserva a altura da barra inferior fixa. Sem isso o último item
        de qualquer lista fica embaixo dela, inalcançável.
      */}
      <div className="min-h-dvh pb-24">{children}</div>
      <BottomNav />
      <Toaster position="top-center" />
    </>
  )
}
