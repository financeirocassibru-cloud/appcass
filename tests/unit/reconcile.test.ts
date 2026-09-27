import { describe, expect, it } from 'vitest'
import { daysBetween } from '@/lib/finance/date'
import { suggestKeywords, matchKeyword } from '@/lib/finance/keywords'
import {
  matchStatementRows,
  type ReconcileCandidate,
  type ReconcileRow,
} from '@/lib/finance/reconcile'

/** Conexão do extrato ao que foi cadastrado. v1.0 — 2026-09-27. */

const key = (n: number) => n.toString(16).padStart(64, '0')

function row(n: number, occurredOn: string, text: string, amountCents: number, kind: 'expense' | 'income' = 'expense'): ReconcileRow {
  return { importKey: key(n), occurredOn, kind, amountCents, text }
}

const salario: ReconcileCandidate = {
  target: 'recurring',
  id: 'regra-salario',
  kind: 'income',
  dueOn: '2026-10-05',
  amountCents: 500000,
  keywords: ['Empresa X'],
  label: 'Salário',
  origin: 'renda fixa',
}

describe('daysBetween', () => {
  it('conta dias sem Date, atravessando mês e ano bissexto', () => {
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1)
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2026-10-05', '2026-09-30')).toBe(-5)
  })
})

describe('matchKeyword', () => {
  it('devolve a palavra mais longa que casa', () => {
    expect(matchKeyword('PIX RECEBIDO EMPRESA X LTDA', ['empresa', 'Empresa X'])?.keyword).toBe('Empresa X')
    expect(matchKeyword('Barbearia', ['bar'])).toBeNull()
  })
})

describe('suggestKeywords', () => {
  const pool = ['Pix de Empresa X', 'Pix para Cassiane', 'IFOOD', 'Pix de empresa x']

  it('filtra sem acento e sem caixa, tira repetidas e as já escolhidas', () => {
    expect(suggestKeywords('empresa', pool, [])).toEqual(['Pix de Empresa X'])
    expect(suggestKeywords('pix', pool, ['Pix para Cassiane'])).toEqual(['Pix de Empresa X'])
  })

  it('sem rascunho, as primeiras do pool', () => {
    expect(suggestKeywords('', pool, [], 2)).toEqual(['Pix de Empresa X', 'Pix para Cassiane'])
  })
})

describe('matchStatementRows', () => {
  it('liquida a renda fixa pela palavra-chave, com o valor do extrato', () => {
    const links = matchStatementRows(
      [row(1, '2026-10-03', 'Pix de Empresa X Transferência recebida EMPRESA X LTDA', 512300, 'income')],
      [salario],
    )
    expect(links[key(1)]).toMatchObject({
      target: 'recurring',
      id: 'regra-salario',
      dueOn: '2026-10-05',
      keyword: 'Empresa X',
      keepsAmount: false,
      amountDiffCents: 12300,
    })
  })

  it('não casa tipo diferente nem fora da janela', () => {
    expect(matchStatementRows([row(1, '2026-10-05', 'Empresa X', 500000, 'expense')], [salario])).toEqual({})
    expect(matchStatementRows([row(1, '2026-10-25', 'Empresa X', 500000, 'income')], [salario])).toEqual({})
  })

  it('cada item uma vez só: duas linhas, o vencimento mais perto leva', () => {
    const links = matchStatementRows(
      [row(1, '2026-09-20', 'Empresa X', 500000, 'income'), row(2, '2026-10-04', 'Empresa X', 500000, 'income')],
      [salario],
    )
    expect(Object.keys(links)).toEqual([key(2)])
  })

  it('com duas ocorrências, cada linha vai para a do seu mês', () => {
    const novembro = { ...salario, dueOn: '2026-11-05' }
    const links = matchStatementRows(
      [row(1, '2026-11-04', 'Empresa X', 500000, 'income'), row(2, '2026-10-06', 'Empresa X', 500000, 'income')],
      [salario, novembro],
    )
    expect(links[key(1)]?.dueOn).toBe('2026-11-05')
    expect(links[key(2)]?.dueOn).toBe('2026-10-05')
  })

  it('a palavra mais longa vence', () => {
    const energia: ReconcileCandidate = {
      target: 'entry',
      id: 'luz',
      kind: 'expense',
      dueOn: '2026-10-10',
      amountCents: 20000,
      keywords: ['enel sp'],
      label: 'Conta de luz',
      origin: 'avulso',
    }
    const outra: ReconcileCandidate = { ...energia, id: 'outra', keywords: ['enel'], label: 'Outra' }
    const links = matchStatementRows([row(1, '2026-10-10', 'Pagamento ENEL SP', 20000)], [outra, energia])
    expect(links[key(1)]?.id).toBe('luz')
  })

  it('a parcela mantém o valor e avisa a diferença', () => {
    const parcela: ReconcileCandidate = {
      target: 'entry',
      id: 'parcela-2',
      kind: 'expense',
      dueOn: '2026-10-10',
      amountCents: 10000,
      keywords: ['loja do sofa'],
      label: 'Sofá (2/3)',
      origin: 'parcela',
    }
    const links = matchStatementRows([row(1, '2026-10-11', 'LOJA DO SOFÁ LTDA', 10390)], [parcela])
    expect(links[key(1)]).toMatchObject({ keepsAmount: true, amountDiffCents: 390 })
  })

  it('a meta recebe vários aportes, sem janela', () => {
    const meta: ReconcileCandidate = {
      target: 'goal',
      id: 'viagem',
      kind: 'expense',
      dueOn: null,
      amountCents: 0,
      keywords: ['dinheiro guardado'],
      label: 'Meta: Viagem',
      origin: 'meta',
    }
    const links = matchStatementRows(
      [row(1, '2026-10-02', 'Dinheiro guardado', 5000), row(2, '2026-10-28', 'Dinheiro guardado', 7000)],
      [meta],
    )
    expect(Object.keys(links)).toHaveLength(2)
    expect(links[key(2)]?.amountDiffCents).toBe(0)
  })

  it('reserva: avulso de mesmo dia e valor casa sem palavra-chave, abaixo de quem tem', () => {
    const cafe: ReconcileCandidate = {
      target: 'entry',
      id: 'cafe',
      kind: 'expense',
      dueOn: '2026-10-01',
      amountCents: 500,
      keywords: [],
      label: 'Café',
      origin: 'avulso',
    }
    const padaria: ReconcileCandidate = { ...cafe, id: 'padaria', keywords: ['padaria'], label: 'Padaria' }
    const links = matchStatementRows(
      [row(1, '2026-10-01', 'PADARIA BOM DIA', 500), row(2, '2026-10-01', 'Compra no débito', 500)],
      [cafe, padaria],
    )
    expect(links[key(1)]).toMatchObject({ id: 'padaria', keyword: 'padaria' })
    expect(links[key(2)]).toMatchObject({ id: 'cafe', keyword: null })

    // Valor diferente, sem palavra-chave: não é o mesmo.
    expect(matchStatementRows([row(3, '2026-10-01', 'Compra', 501)], [cafe])).toEqual({})
  })
})
