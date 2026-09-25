import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Une classes condicionais resolvendo conflitos do Tailwind. Usado pelo shadcn/ui. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
