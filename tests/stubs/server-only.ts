/**
 * `server-only` de mentira, para o Vitest.
 *
 * O pacote real tem exports condicionais: no caminho do navegador ele lança
 * "This module cannot be imported from a Client Component module". O Vitest
 * resolve por esse caminho, então qualquer módulo com `import 'server-only'` no
 * topo — e são vários em `lib/ai/`, de propósito — derrubaria a suíte inteira
 * na importação.
 *
 * Trocar o pacote por este arquivo vazio no teste **não** enfraquece a
 * proteção: quem faz o guarda valer é o `next build`, e ele continua usando o
 * pacote de verdade.
 */
export {}
