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
    name: 'Finanças',
    short_name: 'Finanças',
    description:
      'Controle de finanças pessoais: lançamentos, contas fixas, parcelas, metas e projeção de saldo.',
    start_url: '/',
    // `standalone` tira a barra do navegador: instalado, parece um app.
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#7c3aed',
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // O mascarável recua o desenho para a área segura: o Android recorta um
      // círculo sobre o quadrado, e sem essa versão a ponta do traço some.
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Novo lançamento', short_name: 'Novo', url: '/novo' },
      { name: 'Extrato', short_name: 'Extrato', url: '/lancamentos' },
      { name: 'Projeção', short_name: 'Projeção', url: '/projecao' },
    ],
  }
}
