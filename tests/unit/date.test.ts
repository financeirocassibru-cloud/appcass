import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  clampDayToMonth,
  DateError,
  daysInMonth,
  eachDay,
  endOfMonth,
  isISODate,
  isLeapYear,
  monthsBetween,
  parseISODate,
  todayISO,
} from '@/lib/finance/date'

describe('clampDayToMonth', () => {
  it('ajusta o dia 31 num mês de 30 dias', () => {
    // O custo fixo do dia 31 sumia da projeção no app antigo.
    expect(clampDayToMonth(31, 2026, 4)).toBe(30)
    expect(clampDayToMonth(31, 2026, 6)).toBe(30)
    expect(clampDayToMonth(31, 2026, 9)).toBe(30)
    expect(clampDayToMonth(31, 2026, 11)).toBe(30)
  })

  it('ajusta para fevereiro em ano não bissexto', () => {
    expect(clampDayToMonth(31, 2026, 2)).toBe(28)
    expect(clampDayToMonth(30, 2026, 2)).toBe(28)
    expect(clampDayToMonth(29, 2026, 2)).toBe(28)
    expect(clampDayToMonth(28, 2026, 2)).toBe(28)
  })

  it('ajusta para fevereiro em ano bissexto', () => {
    expect(clampDayToMonth(31, 2028, 2)).toBe(29)
    expect(clampDayToMonth(29, 2028, 2)).toBe(29)
  })

  it('preserva o dia quando ele cabe no mês', () => {
    expect(clampDayToMonth(15, 2026, 2)).toBe(15)
    expect(clampDayToMonth(31, 2026, 1)).toBe(31)
  })

  it('rejeita dia fora do intervalo', () => {
    expect(() => clampDayToMonth(0, 2026, 1)).toThrow(DateError)
    expect(() => clampDayToMonth(32, 2026, 1)).toThrow(DateError)
  })
})

describe('isLeapYear e daysInMonth', () => {
  it('aplica a regra dos séculos', () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2026)).toBe(false)
    expect(isLeapYear(1900)).toBe(false) // divisível por 100, não por 400
    expect(isLeapYear(2000)).toBe(true) // divisível por 400
  })

  it('conta os dias de cada mês', () => {
    expect(daysInMonth(2026, 1)).toBe(31)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2026, 4)).toBe(30)
  })
})

describe('parseISODate', () => {
  it('rejeita data que não existe no calendário', () => {
    expect(() => parseISODate('2026-02-30')).toThrow(DateError)
    expect(() => parseISODate('2026-13-01')).toThrow(DateError)
    expect(() => parseISODate('05/03/2026')).toThrow(DateError)
  })

  it('aceita data válida sem deslocar o dia', () => {
    // A regressão clássica: new Date('2026-03-01') vira 29/02 em UTC-3.
    expect(parseISODate('2026-03-01')).toEqual({ year: 2026, month: 3, day: 1 })
  })

  it('valida com isISODate', () => {
    expect(isISODate('2026-03-01')).toBe(true)
    expect(isISODate('2026-02-30')).toBe(false)
    expect(isISODate('2026-3-1')).toBe(false)
  })
})

describe('addMonths', () => {
  it('não transborda para o mês seguinte', () => {
    // Date.setMonth transformaria 31/01 + 1 mês em 03/03.
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30')
  })

  it('atravessa a virada de ano', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
  })

  it('soma vários meses', () => {
    expect(addMonths('2026-01-15', 12)).toBe('2027-01-15')
  })
})

describe('addDays', () => {
  it('atravessa fim de mês e de ano', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('eachDay', () => {
  it('inclui as duas pontas', () => {
    expect(eachDay('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ])
  })

  it('devolve vazio quando o intervalo é invertido', () => {
    expect(eachDay('2026-02-02', '2026-01-30')).toEqual([])
  })

  it('cobre fevereiro bissexto inteiro', () => {
    expect(eachDay('2024-02-01', '2024-02-29')).toHaveLength(29)
  })
})

describe('monthsBetween e endOfMonth', () => {
  it('conta apenas ano e mês', () => {
    expect(monthsBetween('2026-01-31', '2026-03-01')).toBe(2)
    expect(monthsBetween('2026-01-01', '2026-01-31')).toBe(0)
    expect(monthsBetween('2026-12-01', '2027-01-01')).toBe(1)
  })

  it('encontra o último dia do mês', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28')
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29')
    expect(endOfMonth('2026-04-01')).toBe('2026-04-30')
  })
})

describe('todayISO', () => {
  it('usa o fuso informado, não o do processo', () => {
    // 02:00 UTC de 1º de março ainda é 28 de fevereiro em São Paulo (UTC-3).
    const instant = new Date('2026-03-01T02:00:00Z')
    expect(todayISO('America/Sao_Paulo', instant)).toBe('2026-02-28')
    expect(todayISO('UTC', instant)).toBe('2026-03-01')
  })

  it('usa São Paulo por padrão', () => {
    const instant = new Date('2026-03-01T02:00:00Z')
    expect(todayISO(undefined, instant)).toBe('2026-02-28')
  })
})
