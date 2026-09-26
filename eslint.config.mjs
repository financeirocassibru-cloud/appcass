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
      // Saída do `serwist build`: bundle gerado, não código-fonte.
      'public/sw.js',
      'public/swe-worker-*.js',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // Toda Server Action deste app tem a assinatura `(prev, formData)` que o
      // `useActionState` exige, e algumas não usam nenhum dos dois. O padrão do
      // ESLint (`args: 'after-used'`) já perdoa o primeiro quando o segundo é
      // usado; o prefixo `_` — que o projeto inteiro já usa — passa a valer para
      // os dois casos, em vez de obrigar a inventar um uso para o parâmetro.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
]

export default eslintConfig
