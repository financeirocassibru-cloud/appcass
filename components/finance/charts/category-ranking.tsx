import { formatCents } from '@/lib/finance/money'
import { formatMonthLong, type CategorySlice } from '@/lib/finance/series'

/**
 * Para onde foi o dinheiro no mês, por categoria.
 *
 * **Barras ordenadas, e não rosca.** A skill `dataviz` desaconselha rosca e pizza
 * para este trabalho, e `docs/DESIGN.md` manda seguir a skill "para paleta,
 * formas e legibilidade". A pergunta aqui é de magnitude — "onde gastei mais" —
 * e comparar comprimentos é preciso onde comparar ângulos é chute. A relação com
 * o total, que era o argumento da rosca, continua explícita: cada linha traz sua
 * porcentagem, e o total vem no cabeçalho.
 *
 * Como consequência a cor não precisa carregar identidade: o nome da categoria
 * está ao lado da própria barra. Uma série, um matiz — `--chart-magnitude`, que é
 * a cor de marca, validada para preenchimento nos dois temas. Verde e vermelho
 * ficam reservados a entrada e saída de dinheiro, como manda o projeto.
 *
 * Server Component: não tem estado nem interação, e não precisa de Recharts para
 * desenhar uma barra. Sai zero JavaScript para o cliente.
 */

export function CategoryRanking({
  slices,
  totalCents,
  month,
}: {
  slices: CategorySlice[]
  totalCents: number
  month: string
}) {
  const maxCents = slices.reduce((max, slice) => Math.max(max, slice.totalCents), 0)

  return (
    <section aria-labelledby="titulo-categorias" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="titulo-categorias" className="text-base font-semibold">
          Saídas por categoria
        </h2>
        <span className="text-xs text-[var(--foreground-muted)]">
          {formatMonthLong(month)}
        </span>
      </div>

      {slices.length === 0 ? (
        <p className="rounded-xl bg-[var(--surface)] p-4 text-sm text-[var(--foreground-muted)]">
          Nenhuma saída registrada neste mês.
        </p>
      ) : (
        <div className="flex flex-col gap-4 rounded-xl bg-[var(--surface)] p-4">
          <p className="text-sm text-[var(--foreground-muted)]">
            Total de saídas:{' '}
            <span className="tabular font-semibold text-[var(--foreground)]">
              {formatCents(totalCents)}
            </span>
          </p>

          <ul className="flex flex-col gap-3">
            {slices.map((slice) => {
              // A barra é proporcional à **maior** categoria, não ao total: é o que
              // torna a comparação entre linhas legível quando uma categoria
              // domina. A relação com o total vem escrita, na porcentagem.
              const width = maxCents === 0 ? 0 : (slice.totalCents / maxCents) * 100
              const share = totalCents === 0 ? 0 : (slice.totalCents / totalCents) * 100

              return (
                <li key={slice.categoryId ?? slice.name} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm">{slice.name}</span>
                    <span className="shrink-0 text-sm">
                      <span className="tabular font-semibold">{formatCents(slice.totalCents)}</span>{' '}
                      <span className="text-xs text-[var(--foreground-muted)]">
                        {share.toFixed(0)}%
                      </span>
                    </span>
                  </div>
                  {/* Barra fina, ponta arredondada, crescendo de uma base única. A
                      trilha é a superfície elevada, um passo da cor de fundo. */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${width}%`,
                        backgroundColor: 'var(--chart-magnitude)',
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
