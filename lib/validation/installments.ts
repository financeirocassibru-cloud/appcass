import { z } from 'zod'
import { isISODate } from '@/lib/finance/date'

/**
 * Validação de parcelamento.
 *
 * O rateio em si não é validado aqui: quem o calcula é `planInstallments()`, e
 * quem confere que a soma bate com o total é a função do banco (migration
 * 0010). Estes schemas cuidam só do que o formulário manda.
 *
 * v1.1 — 2026-09-27: `paidCount` e `anchorDay`, para o parcelamento cadastrado já em
 * andamento. Ausentes, valem 0 e "o dia da primeira" — o formulário antigo segue válido.
 */

/** `''` ou ausente vira `fallback`; o resto precisa ser inteiro. */
const optionalInt = (fallback: number | null) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) =>
      value === null || value === undefined || value.trim() === '' ? fallback : Number(value),
    )

export const createInstallmentSchema = z
  .object({
    description: z.string().trim().min(1, 'Informe a descrição').max(100, 'Descrição longa demais'),
    totalAmountCents: z.coerce
      .number()
      .int('Valor inválido')
      .positive('Informe um valor maior que zero')
      .max(9_999_999_999, 'Valor acima do limite'),
    // O teto de 360 é o da constraint da tabela; o piso de 2 é de produto: uma
    // compra "em 1x" é um lançamento avulso, e criar um plano para ela só
    // adicionaria uma tela a mais para o mesmo resultado.
    installmentsCount: z.coerce
      .number()
      .int('Número de parcelas inválido')
      .min(2, 'Use ao menos 2 parcelas — para 1x, lance um gasto normal')
      .max(360, 'Máximo de 360 parcelas'),
    firstDueOn: z.string().trim().refine(isISODate, 'Data inválida'),
    categoryId: z
      .string()
      .trim()
      .transform((value) => (value === '' ? null : value))
      .refine(
        (value) => value === null || z.string().uuid().safeParse(value).success,
        'Categoria inválida',
      ),
    // v1.1 — 2026-09-27: quantas das primeiras já foram pagas. O teto (N−1) é conferido abaixo,
    // porque depende de `installmentsCount`; o banco confere de novo (migration 0017).
    paidCount: optionalInt(0).refine(
      (value) => value !== null && Number.isInteger(value) && value >= 0,
      'Parcelas já pagas inválidas',
    ),
    // v1.1 — 2026-09-27: dia de vencimento de todas; vazio é o dia de `firstDueOn`.
    anchorDay: optionalInt(null).refine(
      (value) => value === null || (Number.isInteger(value) && value >= 1 && value <= 31),
      'Dia de vencimento inválido',
    ),
  })
  .refine((data) => (data.paidCount ?? 0) < data.installmentsCount, {
    message: 'Ao menos uma parcela precisa estar por pagar — se já pagou todas, não há o que parcelar',
    path: ['paidCount'],
  })

export const installmentPlanIdSchema = z.object({
  id: z.string().uuid('Parcelamento inválido'),
})

export type CreateInstallmentInput = z.infer<typeof createInstallmentSchema>
