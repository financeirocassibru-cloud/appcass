import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

/**
 * Flat config nativo. No Next 16 o `eslint-config-next` já exporta arrays de
 * flat config, então não é preciso a ponte `FlatCompat` — usá-la aqui quebra
 * com "Converting circular structure to JSON".
 */
const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'legacy/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
]

export default eslintConfig
