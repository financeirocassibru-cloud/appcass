'use client'

import { useEffect, useState } from 'react'

/**
 * "Já faz tanto tempo que a tela não diz nada?" v1.0 — 2026-09-26.
 *
 * Existe para consertar um aviso que chegava cedo demais. A folha do assistente dizia
 * "Pode fechar o app: eu continuo e aviso quando terminar" **no instante** em que a
 * pessoa apertava Enviar — antes de qualquer coisa ter acontecido. Lido de fora, aquilo
 * não era gentileza: era o app dizendo "isto vai demorar, vá fazer outra coisa" como
 * primeira reação a alguém que acabou de escrever uma frase.
 *
 * A regra agora: o contador corre enquanto `esperando` for verdadeiro **sem
 * interrupção**, e zera assim que a espera termina. Quem chama é quem decide o que conta
 * como resposta, virando `esperando` para `false` — e é aí que está a parte que importa:
 * a trilha de etapas **não** entra nessa conta. Ela é decoração honesta do progresso, e
 * deixar que ela desarmasse o aviso faria o app parecer ocupado sem nunca admitir que
 * está demorando.
 *
 * Como cada espera é um trecho novo de `esperando` verdadeiro, a conversa em dois tempos
 * ganha o comportamento certo de graça: a triagem, que responde em um ou dois segundos,
 * nunca chega a mostrar o aviso; a proposta, que pode levar vinte, mostra.
 */
export function useQuietFor(ms: number, esperando: boolean): boolean {
  const [passou, setPassou] = useState(false)

  useEffect(() => {
    if (!esperando) return

    const timer = setTimeout(() => setPassou(true), ms)

    // O desarme vive na limpeza, e não no corpo do efeito: assim ele acontece quando a
    // espera de fato termina, sem o `setState` em cascata que um `if` no corpo causaria.
    return () => {
      clearTimeout(timer)
      setPassou(false)
    }
  }, [ms, esperando])

  return passou && esperando
}
