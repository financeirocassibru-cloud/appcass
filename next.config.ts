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

const nextConfig: NextConfig = {
  typedRoutes: true,
}

export default nextConfig
