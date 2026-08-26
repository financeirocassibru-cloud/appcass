import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Suíte de RLS: exige um Postgres real (stack local do Supabase ou o projeto
 * remoto) e as variáveis de ambiente preenchidas. Fica fora de `npm run test`
 * de propósito, para que a suíte de unidade continue rodando em qualquer lugar.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/rls/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
