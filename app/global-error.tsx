'use client'

/**
 * Última linha de defesa: erro no próprio layout raiz.
 *
 * Substitui o `<html>` inteiro, então precisa trazer as próprias tags — e não
 * pode depender de `globals.css`, que pode ser exatamente o que falhou ao
 * carregar. Daí o estilo embutido, feio de escrever e o único que funciona
 * neste ponto.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem 1.5rem',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#ffffff',
          color: '#0f172a',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>O app não carregou</h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0, maxWidth: '28rem' }}>
          Houve uma falha ao iniciar. Seus dados estão salvos no servidor.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: '3rem',
            padding: '0 1.5rem',
            borderRadius: '0.75rem',
            border: 'none',
            background: '#7c3aed',
            color: '#ffffff',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Tentar de novo
        </button>
        {error.digest ? (
          <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
            Código do erro: {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  )
}
