import type { Route } from 'next'

/**
 * `true` se a string tem espaço em branco ou caractere de controle.
 *
 * Verificado por código, e não por regex com escapes de controle: o código
 * fica legível e o arquivo continua sendo texto puro.
 */
function hasUnsafeChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    // C0 (0–31), espaço (32) e DEL (127).
    if (code <= 32 || code === 127) return true
  }
  return false
}

/**
 * Valida um destino de redirecionamento vindo da URL.
 *
 * Checar apenas `startsWith('/')` não basta: `//exemplo.com` e `/\exemplo.com`
 * também começam com barra e o navegador os trata como URL absoluta para outro
 * host — redirecionamento aberto, útil para phishing.
 *
 * Aceita somente caminho relativo de host único. Qualquer outra coisa cai no
 * padrão informado.
 */
export function safeRedirectPath(value: unknown, fallback = '/'): Route {
  if (typeof value !== 'string' || value === '') return fallback as Route
  if (!value.startsWith('/')) return fallback as Route

  // Barra dupla ou barra + contrabarra viram host externo no navegador.
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback as Route

  if (hasUnsafeChars(value)) return fallback as Route

  // `redirect` do Next exige um tipo de rota conhecido; aqui o caminho é
  // dinâmico por natureza (veio da tentativa de acesso do usuário), então o
  // cast só acontece depois da validação acima.
  return value as Route
}
