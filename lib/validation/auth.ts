import { z } from 'zod'
import {
  DEFAULT_EXPIRY_DAYS,
  isWellFormedInviteCode,
  MAX_EXPIRY_DAYS,
  normalizeInviteCode,
} from '@/lib/invite-code'

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Informe o e-mail')
  .email('E-mail inválido')
  .transform((value) => value.toLowerCase())

export const passwordSchema = z
  .string()
  .min(8, 'A senha precisa de pelo menos 8 caracteres')
  .max(72, 'A senha pode ter no máximo 72 caracteres')

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha'),
})

export const inviteCodeSchema = z
  .string()
  .trim()
  .min(1, 'Informe o código de convite')
  .refine(isWellFormedInviteCode, 'Código inválido ou expirado')
  .transform(normalizeInviteCode)

/** Resgate de convite: código, e-mail e senha, tudo de uma vez. */
export const redeemSchema = z
  .object({
    code: inviteCodeSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  })

/** Primeira conta do sistema: mesmo formulário, sem código. */
export const firstAccountSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  })

export const createInviteSchema = z.object({
  label: z
    .string()
    .trim()
    .max(60, 'O rótulo pode ter no máximo 60 caracteres')
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  expiryDays: z.coerce
    .number()
    .int('Prazo inválido')
    .min(1, 'O prazo precisa ser de pelo menos 1 dia')
    .max(MAX_EXPIRY_DAYS, `O prazo pode ser de no máximo ${MAX_EXPIRY_DAYS} dias`)
    .default(DEFAULT_EXPIRY_DAYS),
})

export const revokeInviteSchema = z.object({
  id: z.string().uuid('Convite inválido'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RedeemInput = z.infer<typeof redeemSchema>
export type CreateInviteInput = z.infer<typeof createInviteSchema>
