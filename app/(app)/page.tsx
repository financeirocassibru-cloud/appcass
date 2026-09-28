import Link from 'next/link'
import { Plus } from 'lucide-react'
import { isAiConfigured } from '@/lib/ai/env'
import { getCurrentBalance } from '@/lib/db/queries/balance'
import { getAgendaItems } from '@/lib/db/queries/agenda'
import { DEFAULT_HORIZON_DAYS, splitAgenda } from '@/lib/finance/agenda'
import { todayISO } from '@/lib/finance/date'
import { BalanceHero } from '@/components/finance/balance-hero'
import { Upcoming } from '@/components/finance/upcoming'
import { AssistantComposer } from '@/components/ai/composer'
import { ImportStatementLink } from '@/components/import/import-sheet'
import { Logo } from '@/components/app/logo'

// v1.6 — 27/09/2026: só o nome da tela; o "· Cass" vem do `template` do layout raiz.
export const metadata = { title: 'Início' }

/**
 * `force-dynamic` porque tudo nesta tela depende de "hoje" e do banco.
 * Prerenderizada, ela congelaria o dia do build — e o saldo junto.
 */
export const dynamic = 'force-dynamic'

export default async function InicioPage() {
  // Uma única leitura do relógio para toda a página: duas chamadas a `todayISO()`
  // na mesma renderização podem cair em dias diferentes na virada da meia-noite,
  // e aí o saldo e a agenda falariam de dias distintos.
  const today = todayISO()

  // v1.2 — 2026-09-26: a leitura de `ai_insights_enabled` saiu daqui junto com o resumo,
  // que mudou para a Projeção. Uma query a menos na tela que mais se abre.
  // v1.5 — 2026-09-27: "Saídas por categoria" e "Mês a mês" saíram daqui para a Análise,
  // que já tinha a primeira e passou a ter a segunda no carrossel de "Como foi". O Início
  // fica com o que se olha todo dia: saldo, caixa do assistente e o que vem por aí.
  const [balance, agendaItems] = await Promise.all([
    getCurrentBalance(today),
    // Junta pendentes reais e ocorrências de contas fixas ainda não
    // materializadas, já deduplicadas entre si.
    getAgendaItems(today, DEFAULT_HORIZON_DAYS),
  ])

  const assistenteLigado = isAiConfigured()

  const agenda = splitAgenda(agendaItems, today, DEFAULT_HORIZON_DAYS)

  const isFirstUse =
    balance.countedEntries === 0 &&
    agendaItems.length === 0 &&
    !balance.isAnchorConfigured

  // v1.8 — 28/09/2026: layout de computador. A partir de `lg` (1024 px) a tela vira duas colunas —
  // saldo e assistente à esquerda, o que vem por aí à direita — e o logo do topo sai, porque a
  // barra lateral já o mostra. Os dois `div` de coluna são `contents` abaixo de `lg`: somem do
  // layout, e o celular continua com os mesmos blocos, na mesma ordem e com o mesmo espaçamento.
  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-6 py-8 lg:grid lg:max-w-6xl lg:grid-cols-2 lg:items-start lg:gap-10 lg:px-10 lg:py-10">
      {/* v1.6 — 27/09/2026: logo e nome do app no canto superior esquerdo, acima do saldo. */}
      {/* v1.7 — 27/09/2026: o logo é o destino da animação de abertura do PWA (`LaunchSplash`). */}
      <header className="lg:hidden">
        <Logo target />
      </header>

      <div className="contents lg:flex lg:flex-col lg:gap-8">
        <BalanceHero
          cents={balance.currentCents}
          anchorOn={balance.openingBalanceOn}
          isAnchorConfigured={balance.isAnchorConfigured}
          // v1.3 — 2026-09-27: o convite para informar o saldo é só do primeiro uso.
          hasEntries={balance.hasEntries}
          incomeCents={balance.settledIncomeCents}
          expenseCents={balance.settledExpenseCents}
        />

        {/* A caixa vem logo abaixo do saldo: é o caminho mais curto entre "isso
            acabou de acontecer" e o registro, e não exige saber em qual tela cada
            tipo de lançamento mora. */}
        {/* v1.4 — 2026-09-27: "Importar extrato" logo abaixo da caixa, discreto como o "Ver
            tudo" da agenda. Fica de fora do `assistenteLigado` porque importar não depende da
            IA — ela só sugere categorias quando está ligada. O `div` junta os dois para o
            link não ganhar o espaçamento de seção do `main`. */}
        <div className="flex flex-col gap-2">
          {assistenteLigado && <AssistantComposer variant="hero" />}
          <ImportStatementLink />
        </div>
      </div>

      <div className="contents lg:block">
        {/* Conta nova: em vez de três blocos vazios, um caminho. É o primeiro estado
            que a pessoa vê, e ele tem de dizer o que fazer. */}
        {isFirstUse ? (
          <section className="flex flex-col gap-4 rounded-xl bg-[var(--surface)] p-5">
            <h2 className="text-base font-semibold">Comece por aqui</h2>
            <ol className="flex flex-col gap-2 text-sm text-[var(--foreground-muted)]">
              <li>
                1.{' '}
                <Link href="/ajustes/saldo" className="text-[var(--brand)] underline">
                  Informe quanto você tem hoje
                </Link>{' '}
                — é a partir daí que o saldo é calculado.
              </li>
              <li>
                2.{' '}
                <Link href="/novo" className="text-[var(--brand)] underline">
                  Lance o primeiro gasto
                </Link>
                . Leva dois toques.
              </li>
            </ol>
            <Link
              href="/novo"
              className="bg-primary text-primary-foreground flex min-h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold"
            >
              <Plus className="size-5" aria-hidden />
              Novo lançamento
            </Link>
          </section>
        ) : (
          <Upcoming agenda={agenda} today={today} />
        )}
      </div>
    </main>
  )
}
