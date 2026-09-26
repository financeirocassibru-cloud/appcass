import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      // Ver tests/stubs/server-only.ts: o pacote real lança quando resolvido
      // pelo caminho do navegador, que é o que o Vitest faz. O guarda de
      // verdade continua sendo o `next build`.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    // A suíte de RLS precisa de um banco de verdade e roda por vitest.rls.config.ts.
    exclude: ['tests/rls/**', 'tests/e2e/**', 'node_modules/**'],
  },
})
