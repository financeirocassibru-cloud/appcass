import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ServiceWorker } from '@/components/app/service-worker'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: 'Finanças',
  description:
    'Controle de finanças pessoais: lançamentos, contas fixas, parcelas, metas e projeção de saldo.',
  applicationName: 'Finanças',
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Finanças',
    // `default` mantém a barra de status legível nos dois temas; `black-translucent`
    // deixaria o conteúdo passar por baixo dela.
    statusBarStyle: 'default',
  },
  // Números de telefone viram links azuis no iOS por conta própria, e um valor
  // em reais às vezes é confundido com telefone.
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1020' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-dvh font-sans">
        {/* O provider é Client Component, mas `children` continua renderizando
            no servidor: passar filhos por props não os arrasta para o cliente. */}
        <ServiceWorker>{children}</ServiceWorker>
      </body>
    </html>
  )
}
