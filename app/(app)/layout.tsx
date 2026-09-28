import { AssistantBar } from '@/components/ai/assistant-bar'
import { BottomNav } from '@/components/app/bottom-nav'
import { LaunchSplash } from '@/components/app/launch-splash'
import { SideNav } from '@/components/app/side-nav'
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
 *
 * v1.3 — 28/09/2026: layout de computador. A partir de `lg` (1024 px) entra a barra lateral
 * (`SideNav`), e a barra inferior e a caixa flutuante do assistente saem. O conteúdo desloca
 * `lg:pl-64` para o lado da barra, e o `pb-36` — que só existe para não esconder o fim da página
 * atrás das barras do celular — vira `lg:pb-12`. Tudo com `lg:`: abaixo de 1024 px o shell é o
 * mesmo de antes, classe por classe.
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
      {/* v1.2 — 27/09/2026: abertura do PWA. Fica antes de `children` para chegar no primeiro
          pedaço do HTML, junto com o esqueleto, e não só quando o Início termina de carregar. */}
      <LaunchSplash />
      <div className="min-h-dvh pb-36 lg:pb-12 lg:pl-64">{children}</div>
      <AssistantBar />
      <BottomNav />
      {/* v1.3 — 28/09/2026: depois de `children`, como a barra inferior — o logo de destino da
          abertura é procurado na ordem do documento, e no celular o do Início vem primeiro. */}
      <SideNav />
      <Toaster position="top-center" />
    </>
  )
}
