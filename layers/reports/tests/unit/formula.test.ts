// B3 to B5: what a formula may say, the units it gives, and how it is worked out on a row.
import { describe, expect, it } from 'vitest'
import { evaluate, FormulaError, formulaUnit, formulaWords, parseFormula, type ColumnKind } from '../../shared/formula'

const COLUMNS: ColumnKind[] = [
  { unit: 'money', combine: 'sum' }, // C1 bar takings
  { unit: 'count', combine: 'sum' }, // C2 tickets sold
  { unit: 'count', combine: 'sum' }, // C3 capacity
  { unit: 'count', combine: 'distinct' }, // C4 bookers
  { unit: 'money', combine: 'sum' }, // C5 refunds
]
const fault = (text: string, position = 5) => {
  try {
    parseFormula(text, position)
    return 'parsed'
  }
  catch (error) {
    return error instanceof FormulaError ? `${error.code}@${error.at}` : String(error)
  }
}
const unitOf = (text: string, position = 5) => {
  try {
    return formulaUnit(parseFormula(text, position), COLUMNS)
  }
  catch (error) {
    return error instanceof FormulaError ? error.code : String(error)
  }
}

describe('parsing (B3)', () => {
  it('takes + − × ÷ in either spelling, brackets, whole numbers and earlier columns', () => {
    expect(parseFormula('(C1 − C5) ÷ C2', 5)).toEqual({ kind: 'op', op: '/', left: { kind: 'op', op: '-', left: { kind: 'column', index: 0 }, right: { kind: 'column', index: 4 } }, right: { kind: 'column', index: 1 } })
    expect(parseFormula('c2*2-c3/4', 3)).toMatchObject({ op: '-' })
  })
  it('refuses with the place of the fault', () => {
    expect(fault('C1 + C6')).toBe('later-column@6')
    expect(fault('C1 + C5', 4)).toBe('later-column@6')
    expect(fault('C1 * 1.5')).toBe('whole-numbers@7')
    expect(fault('sum(C1)')).toBe('unknown-character@1')
    expect(fault('(C1 + C2')).toBe('unclosed-bracket@9')
    expect(fault('C1 +')).toBe('ends-early@5')
    expect(fault('C1 C2')).toBe('unexpected@4')
    expect(fault('2 + 2')).toBe('no-column@1')
    expect(fault('C0')).toBe('column-number@1')
    expect(fault('')).toBe('empty@1')
  })
})

describe('units (B4)', () => {
  it('adds money to money, and divides money or counts by a count', () => {
    expect(unitOf('C1 - C5')).toBe('money')
    expect(unitOf('C1 / C2')).toBe('money')
    expect(unitOf('C2 / C3')).toBe('percent')
    expect(unitOf('C2 * 2')).toBe('count')
  })
  it('refuses anything else, and never adds a distinct or level column', () => {
    expect(unitOf('C1 + C2')).toBe('units-differ')
    expect(unitOf('C1 / C5')).toBe('units-divide')
    expect(unitOf('C1 * C2')).toBe('units-multiply')
    expect(unitOf('C2 + C4')).toBe('not-addable')
    expect(unitOf('C2 / C4')).toBe('percent')
    expect(unitOf('C2 / C3 + C2 / C3')).toBe('not-addable')
  })
})

describe('working out (B5)', () => {
  const f = (text: string) => parseFormula(text, 5)
  it('gives a percent of counts, money per item in whole pence, and money in its currency', () => {
    expect(evaluate(f('C2 / C3'), [null, { value: 30 }, { value: 40 }], COLUMNS)).toEqual({ value: 75 })
    expect(evaluate(f('C1 / C2'), [{ value: 1000, currency: 'GBP' }, { value: 3 }], COLUMNS)).toEqual({ value: 333, currency: 'GBP' })
    expect(evaluate(f('C1 - C5'), [{ value: 1000, currency: 'GBP' }, null, null, null, { value: 250, currency: 'GBP' }], COLUMNS)).toEqual({ value: 750, currency: 'GBP' })
  })
  it('is a dash, never nought, when it divides by nought, a column has no value or two currencies meet', () => {
    expect(evaluate(f('C2 / C3'), [null, { value: 3 }, { value: 0 }], COLUMNS)).toBeNull()
    expect(evaluate(f('C2 / C3'), [null, null, { value: 3 }], COLUMNS)).toBeNull()
    expect(evaluate(f('C1 - C5'), [{ value: 1, currency: 'GBP' }, null, null, null, { value: 1, currency: 'EUR' }], COLUMNS)).toBeNull()
  })
  it('spells itself out in words for its tooltip', () => {
    expect(formulaWords(f('(C1 − C5) ÷ C2'), ['Gross', 'Sold', 'Capacity', 'Bookers', 'Refunds'])).toBe('(Gross − Refunds) ÷ Sold')
  })
})
