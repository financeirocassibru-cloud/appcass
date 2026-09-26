'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Sair — apagando o que ficou guardado no aparelho.
 *
 * O service worker guarda as telas já visitadas para o app abrir sem rede, e
 * essas telas mostram saldo e lançamentos. Sem esta limpeza, quem usasse o
 * mesmo aparelho depois veria os números da pessoa anterior a partir do cache,
 * mesmo já deslogado — a sessão acabou, o retrato dela não.
 *
 * A limpeza acontece **antes** da navegação, e por isso o envio é adiado: um
 * `caches.delete()` disparado junto com o submit seria interrompido no meio.
 * Se algo falhar, o logout continua — sair é mais importante que limpar.
 */
export function LogoutButton() {
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (pending) return
    event.preventDefault()
    setPending(true)

    try {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      }
    } catch {
      // Aba privada, armazenamento bloqueado, worker ausente: nada disso pode
      // impedir alguém de sair.
    }

    formRef.current?.submit()
  }

  return (
    // POST, e não link: um GET permitiria encerrar a sessão de alguém a partir
    // de uma imagem ou link de terceiro.
    <form ref={formRef} action="/auth/logout" method="post" onSubmit={handleSubmit}>
      <Button type="submit" disabled={pending} variant="outline" className="min-h-11 w-full text-base">
        {pending ? 'Saindo…' : 'Sair'}
      </Button>
    </form>
  )
}
