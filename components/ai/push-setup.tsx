'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { removePushSubscription, savePushSubscription } from '@/lib/actions/ai-settings'
import { Button } from '@/components/ui/button'

/**
 * Ativa os avisos deste navegador. v1.0 — 2026-09-26.
 *
 * O aviso de "terminei" precisa chegar com o app fechado, e a única forma de
 * fazer isso na web é Web Push sobre o service worker — que a fase 6b já deixou
 * registrado. Este componente cuida da parte que só o navegador pode fazer:
 * pedir permissão e produzir a inscrição. Guardar a inscrição é Server Action.
 *
 * O que ele NÃO faz é prometer o que o navegador não entrega. No iOS, push só
 * funciona com o PWA instalado na tela de início; num Safari comum a API nem
 * existe. Nesses casos o texto diz isso, em vez de mostrar um botão que falha.
 */

/**
 * A chave VAPID viaja em base64url e a API do navegador quer bytes.
 *
 * `atob` não entende `-` e `_`, e o padding some na codificação url-safe — daí
 * os dois ajustes antes de decodificar.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replaceAll('-', '+').replaceAll('_', '/')
  const raw = atob(normalized)

  // O `ArrayBuffer` explícito não é firula: `Uint8Array.from` devolve
  // `Uint8Array<ArrayBufferLike>`, e `applicationServerKey` exige um buffer que
  // comprovadamente não é compartilhado.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)

  return bytes
}

type Estado = 'checking' | 'unsupported' | 'denied' | 'off' | 'on'

export function PushSetup({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [estado, setEstado] = useState<Estado>('checking')
  const [pending, startTransition] = useTransition()

  /**
   * Descobre em que estado este navegador está.
   *
   * Tudo acontece dentro da função assíncrona, e nenhum `setEstado` fica no
   * corpo do efeito: chamar `setState` direto ali dispara uma renderização em
   * cascata, e o lint do projeto barra isso. `ativo` evita gravar estado numa
   * tela que já saiu.
   */
  useEffect(() => {
    let ativo = true

    async function descobrir(): Promise<Estado> {
      const suportado =
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window

      if (!suportado || !vapidPublicKey) return 'unsupported'
      if (Notification.permission === 'denied') return 'denied'

      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        return subscription ? 'on' : 'off'
      } catch {
        return 'unsupported'
      }
    }

    void descobrir().then((proximo) => {
      if (ativo) setEstado(proximo)
    })

    return () => {
      ativo = false
    }
  }, [vapidPublicKey])

  async function ativar(): Promise<void> {
    const permissao = await Notification.requestPermission()
    if (permissao !== 'granted') {
      setEstado(permissao === 'denied' ? 'denied' : 'off')
      return
    }

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      // Sem isto o navegador recusa: push silencioso não é permitido.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })

    const json = subscription.toJSON()
    const fd = new FormData()
    fd.set('endpoint', json.endpoint ?? '')
    fd.set('p256dh', json.keys?.p256dh ?? '')
    fd.set('auth', json.keys?.auth ?? '')
    fd.set('userAgent', navigator.userAgent.slice(0, 300))

    const result = await savePushSubscription({}, fd)
    if (result.error) {
      toast.error(result.error)
      return
    }

    setEstado('on')
    toast.success(result.success ?? 'Avisos ativados.')
  }

  async function desativar(): Promise<void> {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      setEstado('off')
      return
    }

    const fd = new FormData()
    fd.set('endpoint', subscription.endpoint)

    // Some do servidor primeiro: se o navegador cancelar e o banco não souber,
    // sobra uma linha morta que só falha no próximo envio.
    const result = await removePushSubscription({}, fd)
    await subscription.unsubscribe()

    setEstado('off')
    toast(result.error ?? result.success ?? 'Avisos desativados.')
  }

  if (estado === 'checking') return null

  if (estado === 'unsupported') {
    return (
      <p className="text-muted-foreground text-sm">
        Este navegador não recebe avisos. No iPhone, instale o app na tela de início — a partir daí
        os avisos funcionam.
      </p>
    )
  }

  if (estado === 'denied') {
    return (
      <p className="text-muted-foreground text-sm">
        Os avisos foram bloqueados para este site. Para voltar a recebê-los, libere as notificações
        nas configurações do navegador.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await (estado === 'on' ? desativar() : ativar())
            } catch {
              toast.error('Não foi possível mudar os avisos neste aparelho.')
            }
          })
        }
        className="min-h-11"
      >
        {estado === 'on' ? 'Desativar avisos neste aparelho' : 'Ativar avisos neste aparelho'}
      </Button>
      <p className="text-muted-foreground text-xs">
        Cada aparelho é ativado separadamente. O interruptor acima vale para todos.
      </p>
    </div>
  )
}
