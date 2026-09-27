import { formatCents } from '@/lib/finance/money'

/**
 * Quanto do limite está tomado — v1.0 — 2026-09-27 (Fase 13).
 *
 * A mesma barra do progresso de /parcelas: trilha um passo acima da superfície e
 * preenchimento na cor de magnitude — verde e vermelho ficam reservados à direção do dinheiro.
 * O número vem sempre em texto ao lado (nunca só a cor), e passar do limite é dito por
 * extenso.
 */
export function LimitMeter({ limitCents, usedCents }: { limitCents: number; usedCents: number }) {
  const pct = Math.min(100, Math.max(0, (usedCents / limitCents) * 100))
  const available = limitCents - usedCents

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="meter"
        aria-valuenow={usedCents}
        aria-valuemin={0}
        aria-valuemax={limitCents}
        aria-label={`${formatCents(usedCents)} usados de ${formatCents(limitCents)}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]"
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: 'var(--chart-magnitude)' }} />
      </div>
      <p className="text-muted-foreground text-xs">
        <span className="tabular">{formatCents(usedCents)}</span> usados de{' '}
        <span className="tabular">{formatCents(limitCents)}</span> ·{' '}
        {available >= 0 ? (
          <>
            disponível <span className="tabular">{formatCents(available)}</span>
          </>
        ) : (
          <>
            passou do limite em <span className="tabular">{formatCents(-available)}</span>
          </>
        )}
      </p>
    </div>
  )
}
