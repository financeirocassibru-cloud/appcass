import { AssistantBar } from '@/components/ai/assistant-bar'
import { BottomNav } from '@/components/app/bottom-nav'
import { Toaster } from '@/components/ui/sonner'

/**
 * Shell autenticado.
 *
 * v1.1 — 2026-09-26: fase 7. A caixa do assistente entra aqui, ancorada acima
 * da barra inferior, e é isso que a torna alcançável de QUALQUER tela sem
 * gastar um sexto item na navegação — que `docs/DESIGN.md` fixa em cinco, e por
 * um bom motivo: foi a barra com scroll horizontal que escondia opções no app
 * antigo. A caixa também dispensa ícone, que é o que o pedido desta fase queria:
 * o convite é o texto dentro dela, não uma figura que precisa ser decifrada.
 */
/**
 * Teto de duração das funções deste segmento.
 *
 * A caixa do assistente vive no shell, então `submitMessage` pode ser chamado a
 * partir de QUALQUER tela autenticada — e é o `after()` dele que acompanha o
 * trabalho depois de a resposta já ter saído. Declarado só em `/assistente`, o
 * acompanhamento seria cortado cedo em todas as outras telas e o trabalho
 * cairia sempre para a varredura, que é mais lenta.
 */
export const maxDuration = 60

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/*
        `pb-36` reserva a altura da barra inferior fixa MAIS a da caixa do
        assistente. Sem isso o último item de qualquer lista fica embaixo delas,
        inalcançável. Era `pb-24` antes da fase 7.
      */}
      <div className="min-h-dvh pb-36">{children}</div>
      <AssistantBar />
      <BottomNav />
      <Toaster position="top-center" />
    </>
  )
}
