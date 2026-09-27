import type { MetadataRoute } from 'next'

/**
 * Manifest do PWA.
 *
 * Em arquivo TypeScript, e não num `manifest.json` solto, para que o typecheck
 * verifique os campos — um `purpose` errado ou um tamanho que não bate com o
 * arquivo só apareceria no celular de outra forma.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // v1.2 — 27/09/2026: nome do app passa a ser Cass.
    name: 'Cass',
    short_name: 'Cass',
    description:
      'Controle de finanças pessoais: lançamentos, contas fixas, parcelas, metas e projeção de saldo.',
    start_url: '/',
    // `standalone` tira a barra do navegador: instalado, parece um app.
    display: 'standalone',
    /**
     * v1.1 — 2026-09-27: era `'portrait'`, e com ele o sistema **não gira o PWA instalado de jeito
     * nenhum** — nem quando a Análise pede paisagem para o gráfico em tela cheia, nem quando a
     * pessoa gira o aparelho por conta própria.
     *
     * O custo é real e está assumido: agora toda tela pode ser renderizada em paisagem, e nenhuma
     * foi desenhada para isso. O bloco `@media (orientation: landscape)` em `globals.css` é o
     * mínimo para o conteúdo não ficar preso em duzentos pixels de altura; um passe completo de
     * paisagem nas dez telas é trabalho de outro PR.
     */
    orientation: 'any',
    // v1.2 — 27/09/2026: era `#ffffff`; agora é o mesmo lilás claro do fundo dos ícones, para a
    // tela de abertura do PWA instalado emendar com o ícone em vez de piscar branco em volta dele.
    background_color: '#f7f3fb',
    theme_color: '#7c3aed',
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // O mascarável recua o desenho para a área segura: o Android recorta um
      // círculo sobre o quadrado, e sem essa versão a ponta do traço some.
      // v1.2 — 27/09/2026: os três PNGs agora trazem o logo Cass e são gerados por `npm run icons`.
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Novo lançamento', short_name: 'Novo', url: '/novo' },
      { name: 'Histórico', short_name: 'Histórico', url: '/historico' },
      { name: 'Análise', short_name: 'Análise', url: '/analise' },
    ],
  }
}
