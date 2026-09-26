import { z } from 'zod'
import { isISODate } from '@/lib/finance/date'

/**
 * Validação de parcelamento.
 *
 * O rateio em si não é validado aqui: quem o calcula é `planInstallments()`, e
 * quem confere que a soma bate com o total é a função do banco (migration
 * 0010). Estes schemas cuidam só do que o formulário manda.
 */

export const createInstallmentSchema = z.object({
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
})

export const installmentPlanIdSchema = z.object({
  id: z.string().uuid('Parcelamento inválido'),
})

export type CreateInstallmentInput = z.infer<typeof createInstallmentSchema>
