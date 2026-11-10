import { describe, expect, it } from 'vitest'
import { parseNum, quantity } from './num'

describe('parseNum (miroir du serveur)', () => {
  it.each([
    ['66 4508', '664508.00'],
    ['3 808', '3808.00'],
    ['334,4', '334.40'],
    ['1.234,5', '1234.50'],
    ['1,234.5', '1234.50'],
    ['1.234.567', '1234567.00'],
    ['66 4735', '664735.00'],
    ['227', '227.00'],
  ])('%s → %s', (raw, out) => {
    const r = parseNum(raw)
    expect(r.ok && r.value).toBe(out)
  })

  it.each(['664,508', '12.345', 'abc', '3.141'])('refuse %s', (raw) => {
    expect(parseNum(raw).ok).toBe(false)
  })

  it('vide = null', () => {
    expect(parseNum('')).toEqual({ ok: true, value: null, cents: null })
  })
})

describe('quantity', () => {
  it('bon D222 : 66 4508 → 66 4735 = 227 L', () => {
    expect(quantity('66 4508', '66 4735')).toEqual({ value: '227.00' })
  })
  it('signale une série fin inférieure', () => {
    expect(quantity('664735', '664508').error).toBeTruthy()
  })
})

import { date, dateTime, time } from './format'
describe('dates affichées = heure locale du serveur, sans conversion', () => {
  it('10:40 reste 10:40 quel que soit le fuseau du navigateur', () => {
    expect(dateTime('2026-11-07T10:40:00+01:00')).toBe('07/11/2026 10:40')
    expect(time('2026-11-07T10:40:00+01:00')).toBe('10:40')
    expect(date('2026-11-07')).toBe('07/11/2026')
  })
})
