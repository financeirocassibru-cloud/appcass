import { formatCents } from '@/lib/finance/money'
import { formatMonthLabel, type CommitmentMonth } from '@/lib/finance/series'

/**
 * Quanto da renda de cada mês já estava comprometido antes de a pessoa decidir.
 *
 * v1.0 — 2026-09-27.
 *
 * É a pergunta que nenhum extrato responde: o total de saídas do mês não distingue o aluguel, que
 * não dá para não pagar, do delivery, que dá. A repartição sai de `entries.source`.
 *
 * **Forma: um medidor por mês**, cuja pista é a renda e cujo preenchimento são os compromissos —
 * o que sobra é a pista vazia. A skill `dataviz` indica medidor para "uma razão contra um limite",
 * e aqui o limite é a renda.
 *
 * **Cor: uma rampa ordinal de um só matiz**, não quatro cores. As faixas têm ordem — quanto menos
 * escolha a pessoa tem sobre aquele dinheiro, mais escura a faixa — e é a ordem que carrega a
 * informação. Quatro matizes gastariam o canal de identidade recodificando o que a largura já
 * mostra, e a própria skill chama isso de anti-padrão. A rampa passou na validação `--ordinal`
 * nos dois temas; no escuro ela inverte, porque num fundo escuro o passo de maior contraste é o
 * mais claro.
 *
 * **Vão de 2px entre as faixas**, e não borda em volta de cada uma: é o separador que a skill
 * pede, e some quando a faixa é estreita demais para aparecer.
 *
 * Server Component, como o ranking de categorias: nenhum estado, nenhuma interação, e uma barra
 * não precisa de Recharts. Sai zero JavaScript para o cliente, e os números estão escritos —
 * então nada depende de passar o cursor.
 */

interface Band {
  key: keyof Pick<
    CommitmentMonth,
    'fixedCents' | 'installmentCents' | 'savedCents' | 'variableCents'
  >
  label: string
  color: string
}

/** Do mais preso ao mais livre. A ordem é a informação. */
const BANDS: Band[] = [
  { key: 'fixedCents', label: 'Contas fixas', color: 'var(--chart-commit-fixed)' },
  { key: 'installmentCents', label: 'Parcelas', color: 'var(--chart-commit-installment)' },
  { key: 'savedCents', label: 'Guardado', color: 'var(--chart-commit-saved)' },
  { key: 'variableCents', label: 'Variável', color: 'var(--chart-commit-variable)' },
]

export function CommitmentBars({
  months,
  caption,
}: {
  months: CommitmentMonth[]
  caption: string
}) {
  const withIncome = months.filter((month) => month.incomeCents > 0)

  return (
    <section aria-labelledby="titulo-comprometimento" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="titulo-comprometimento" className="text-base font-semibold">
          Comprometimento da renda
        </h2>
        <span className="text-xs text-[var(--foreground-muted)]">{caption}</span>
      </div>

      {withIncome.length === 0 ? (
        <p className="rounded-xl bg-[var(--surface)] p-4 text-sm text-[var(--foreground-muted)]">
          Nenhuma entrada registrada neste período. Sem renda não há o que comprometer — lance o
          salário e este gráfico passa a fazer sentido.
        </p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--foreground-muted)]">
            {BANDS.map((band) => (
              <li key={band.key} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-sm"
                  style={{ background: band.color }}
                />
                {band.label}
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block size-2.5 rounded-sm border border-[var(--border)]"
              />
              Sobra
            </li>
          </ul>

          <ul className="flex flex-col gap-3">
            {months.map((month) => (
              <MonthRow key={month.month} month={month} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function MonthRow({ month }: { month: CommitmentMonth }) {
  // Mês sem renda: a pista não tem tamanho, então não há medidor a desenhar. O gasto do mês
  // continua dito em texto, para o mês não parecer vazio.
  if (month.incomeCents <= 0) {
    const spent =
      month.fixedCents + month.installmentCents + month.savedCents + month.variableCents

    return (
      <li className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium capitalize">{formatMonthLabel(month.month)}</span>
        <span className="text-xs text-[var(--foreground-muted)]">
          sem entrada · <span className="tabular">{formatCents(spent)}</span> de saídas
        </span>
      </li>
    )
  }

  const committed =
    month.fixedCents + month.installmentCents + month.savedCents + month.variableCents
  // Gastou mais do que entrou: as faixas passariam de 100% e a pista perderia sentido como
  // "a renda". A base passa a ser o total gasto, e o texto diz que a sobra é negativa.
  const base = Math.max(month.incomeCents, committed)
  const share = (cents: number) => (cents / base) * 100

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium capitalize">{formatMonthLabel(month.month)}</span>
        <span className="text-xs text-[var(--foreground-muted)]">
          sobra{' '}
          <span
            className={
              month.leftoverCents < 0
                ? 'tabular font-semibold text-[var(--expense)]'
                : 'tabular font-semibold text-[var(--foreground)]'
            }
          >
            {formatCents(month.leftoverCents)}
          </span>{' '}
          de {formatCents(month.incomeCents)}
        </span>
      </div>

      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface)] ring-1 ring-[var(--border)] ring-inset"
        role="img"
        aria-label={ariaLabelFor(month)}
      >
        {BANDS.map((band) => {
          const cents = month[band.key]
          if (cents <= 0) return null
          return (
            <span
              key={band.key}
              className="h-full"
              style={{
                width: `${share(cents)}%`,
                background: band.color,
                // O vão de 2px é o separador; numa faixa estreita ele comeria a própria faixa.
                marginRight: share(cents) > 3 ? 2 : 0,
              }}
            />
          )
        })}
      </div>

      <p className="text-[11px] text-[var(--foreground-muted)]">
        {BANDS.filter((band) => month[band.key] > 0)
          .map((band) => `${band.label} ${Math.round(share(month[band.key]))}%`)
          .join(' · ')}
      </p>
    </li>
  )
}

function ariaLabelFor(month: CommitmentMonth): string {
  const parts = BANDS.filter((band) => month[band.key] > 0).map(
    (band) => `${band.label}: ${formatCents(month[band.key])}`,
  )
  return `${formatMonthLabel(month.month)}. Renda: ${formatCents(month.incomeCents)}. ${parts.join('. ')}. Sobra: ${formatCents(month.leftoverCents)}.`
}
