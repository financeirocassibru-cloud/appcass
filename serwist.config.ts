import { serwist } from '@serwist/next/config'

/**
 * Build do service worker, no **modo configurador** do Serwist.
 *
 * O modo mais comum — embrulhar o `next.config.ts` com `withSerwistInit` —
 * injeta configuração de webpack, e o Next 16 usa Turbopack por padrão. O build
 * falhava com "This build is using Turbopack, with a `webpack` config"; a saída
 * que o próprio erro aponta é esta.
 *
 * Aqui o worker é compilado **depois** do `next build`, pelo `@serwist/cli`,
 * que lê a saída para montar o manifesto de precache. É por isso que o script
 * `build` do package.json encadeia os dois — a ordem importa: invertida, o
 * precache sairia vazio.
 */
export default serwist({
  swSrc: 'app/sw.ts',
  // Na raiz de `public/`: um service worker só controla o escopo do caminho de
  // onde é servido, e daqui ele controla o app inteiro.
  swDest: 'public/sw.js',
})
