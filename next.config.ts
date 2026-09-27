import { existsSync } from 'node:fs'
import path from 'node:path'
import type { NextConfig } from 'next'

/**
 * O service worker tem de existir antes de o `next build` terminar.
 *
 * Esta checagem existe por causa de um bug que durou três deploys. O
 * `vercel.json` fixava `"buildCommand": "next build"`, e com isso a Vercel
 * **nunca executava o script `build` do `package.json`** — que é quem chama o
 * `serwist build`. O worker nunca foi gerado em nenhum deploy, `/sw.js`
 * respondia 404 em produção, e o build passava verde: não há nada no
 * `next build` que perceba a falta de um arquivo que ele não gera.
 *
 * Duas coisas, então. O `vercel.json` não fixa mais o comando, para o
 * `package.json` ser a única fonte da verdade. E esta asserção mora aqui, e não
 * num passo depois do build, porque `next build` é justamente o único comando
 * que a Vercel tinha sido mandada rodar: um guarda fora dele teria sido pulado
 * pelo mesmo motivo. Se alguém apontar o comando de build para `next build` de
 * novo — no `vercel.json` ou no painel da Vercel, que o repositório não vê —, o
 * build **falha** em vez de publicar um PWA quebrado em silêncio.
 *
 * `process.argv[2]` em vez de `NEXT_PHASE`: essa variável não existe mais no
 * Next 16 (medido — vem `undefined` tanto no build quanto no `start`), e um
 * guarda que nunca dispara é pior que nenhum.
 */
if (process.argv[1]?.endsWith('next') && process.argv[2] === 'build') {
  const worker = path.join(process.cwd(), 'public', 'sw.js')
  if (!existsSync(worker)) {
    throw new Error(
      'public/sw.js não existe. O build precisa rodar `serwist build` antes do ' +
        '`next build` — use `npm run build`, não `next build` direto.',
    )
  }
}

/**
 * v1.1 — 2026-09-26: as abas Extrato e Projeção viraram Histórico e Análise, e as rotas
 * acompanharam. Os redirecionamentos existem porque as URLs antigas estão nos atalhos do
 * PWA já instalado e em qualquer link que a pessoa tenha guardado — um 404 ali seria o
 * app aberto no vazio depois de uma atualização que ela não pediu.
 *
 * `permanent: true` (308) preserva o método e a query string, então
 * `/lancamentos?status=pendente` chega em `/historico?status=pendente` com o filtro intacto.
 */
const nextConfig: NextConfig = {
  typedRoutes: true,
  async redirects() {
    return [
      { source: '/lancamentos', destination: '/historico', permanent: true },
      { source: '/projecao', destination: '/analise', permanent: true },
    ]
  },
}

export default nextConfig
