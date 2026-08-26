import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    // A suíte de RLS precisa de um banco de verdade e roda por vitest.rls.config.ts.
    exclude: ['tests/rls/**', 'tests/e2e/**', 'node_modules/**'],
  },
})
