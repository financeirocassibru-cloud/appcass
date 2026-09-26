/**
 * Build do service worker.
 *
 * Duas decisões aqui, e as duas vieram de erro medido em produção.
 *
 * ## Por que não é o modo plugin do Serwist
 *
 * Embrulhar o `next.config.ts` com `withSerwistInit` injeta configuração de
 * webpack, e o Next 16 usa Turbopack por padrão: o build morre com "This build
 * is using Turbopack, with a `webpack` config". Daí o modo configurador, em que
 * o worker é compilado pelo `@serwist/cli` a partir deste arquivo.
 *
 * ## Por que o worker é gerado ANTES do `next build`
 *
 * A primeira versão rodava `next build && serwist build`, usando
 * `@serwist/next/config` para varrer a saída do Next e montar um precache
 * grande. Funcionava localmente com `next start` e **não funcionava na
 * Vercel**: `/sw.js` respondia 404 em produção.
 *
 * O motivo é que `public/` é coletado a partir do código-fonte, não do estado
 * do disco depois do build. Os ícones funcionavam porque estão no git; o
 * `sw.js`, gerado durante o build, chegava tarde demais para entrar no deploy.
 *
 * A correção é inverter a ordem: `serwist build && next build`. Assim o arquivo
 * **já existe** quando o Next coleta `public/`, e isso vale qualquer que seja o
 * mecanismo de coleta — é o que tira a suposição do caminho.
 *
 * O custo é que o precache não pode mais varrer a saída do Next, que ainda não
 * existe. Em troca ele cobre o essencial, e o resto fica com o cache de tempo
 * de execução:
 *
 * - os ícones e os arquivos estáticos de `public/`, por glob;
 * - a página de offline, por `additionalPrecacheEntries`;
 * - **tudo mais** — páginas, chunks do `_next/static`, dados — pelo
 *   `defaultCache`.
 *
 * Que o segundo item baste foi **medido**, não suposto: uma página
 * `force-dynamic`, que o Next serve com `cache-control: no-store`, foi visitada
 * com rede e depois aberta sem rede — veio do cache, com o mesmo conteúdo
 * (mesmo `Date.now()` renderizado), e não da página de offline.
 *
 * Quem guarda é a última regra de `defaultCache` que casa uma navegação: a do
 * cache `others`, `NetworkFirst` sobre qualquer GET de mesma origem fora de
 * `/api/`. Vale notar que a regra anterior, a do cache `pages`, testa
 * `request.headers.get('Content-Type')` — cabeçalho de *resposta*, que pedido de
 * navegação não manda —, então ela não casa nada e o `others` é o que sustenta a
 * promessa da fase 6. O `cacheOnNavigation` do provider é um reforço: ele manda
 * `CACHE_URLS` a cada `pushState`, o que aquece a rota do App Router antes de a
 * pessoa abrir a tela.
 */

/**
 * Revisão da página de offline.
 *
 * Precisa mudar a cada deploy para a versão guardada não ficar velha. O SHA do
 * commit é o que a Vercel e o GitHub Actions oferecem; fora deles, um valor
 * fixo basta, porque em desenvolvimento o worker está desligado.
 */
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'desenvolvimento'

const config = {
  swSrc: 'app/sw.ts',
  // Na raiz de `public/`: um service worker só controla o escopo do caminho de
  // onde é servido, e daqui ele controla o app inteiro.
  swDest: 'public/sw.js',

  globDirectory: 'public',
  globPatterns: ['icons/**/*.{png,svg}'],
  // O próprio worker não se precacheia.
  globIgnores: ['sw.js', 'swe-worker-*.js'],

  // A página de offline é rota do Next, não arquivo em `public/`, então entra
  // pela URL. É ela que o `fallbacks` do `app/sw.ts` serve quando uma navegação
  // falha sem versão em cache — sem estar no precache, o fallback não teria o
  // que mostrar.
  additionalPrecacheEntries: [{ url: '/~offline', revision }],
}

export default config
