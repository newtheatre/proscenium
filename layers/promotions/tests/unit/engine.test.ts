// The pricing engine (the unified promotions design, "How a sale is priced"): per-item effects on
// the dearest units first within their limits, the best promotion for the customer on each unit
// unless both combine, multi-buys shared across their group, one basket amount shared by price to
// the penny, and conditions on the rest of the sale.
import { describe, expect, it } from 'vitest'
import { priceItems, share, unitSaving, type EngineItem, type EngineRule } from '../../server/engine'

const rule = (id: string, fields: Partial<EngineRule> & Pick<EngineRule, 'effect' | 'value'>, applies: string[]): EngineRule => ({ id, codeId: null, applies: new Set(applies), ...fields })
const saved = (items: EngineItem[], rules: EngineRule[]) => Object.fromEntries(priceItems(items, rules).byItem)

describe('sharing an amount', () => {
  it('adds up to the whole exactly, by price, the pennies to the largest remainders', () => {
    expect(share(500, [1200, 800, 450])).toEqual([245, 163, 92])
    expect(share(500, [1200, 800, 450]).reduce((a, b) => a + b, 0)).toBe(500)
    expect(share(100, [1, 1, 1])).toEqual([1, 1, 1])
    expect(share(10, [5, 5, 5])).toEqual([4, 3, 3])
    expect(share(0, [5, 5])).toEqual([0, 0])
  })

  it('never shares out more than the weights hold', () => {
    expect(share(1000, [300, 200])).toEqual([300, 200])
  })
})

describe('per-item promotions', () => {
  it('takes a percentage, an amount or a set price off each unit, never below nothing', () => {
    expect(unitSaving('percent_off', 2500, 1200)).toBe(300)
    expect(unitSaving('amount_off', 1500, 1200)).toBe(1200)
    expect(unitSaving('set_price', 500, 1200)).toBe(700)
    expect(unitSaving('set_price', 1500, 1200)).toBe(0)
  })

  it('reaches only as many units as its limits allow, the dearest first', () => {
    const items = [{ key: 'conc', listMinor: 800, quantity: 2 }, { key: 'full', listMinor: 1200, quantity: 1 }]
    expect(saved(items, [rule('a', { effect: 'amount_off', value: 200, maxPerSale: 1 }, ['full', 'conc'])])).toEqual({ full: 200 })
    expect(saved(items, [rule('a', { effect: 'amount_off', value: 200, usesLeft: 2 }, ['full', 'conc'])])).toEqual({ full: 200, conc: 200 })
    expect(saved(items, [rule('a', { effect: 'amount_off', value: 200, usesLeft: 0 }, ['full', 'conc'])])).toEqual({})
  })

  it('counts each unit as a use, or one use for the sale', () => {
    const items = [{ key: 'pint', listMinor: 480, quantity: 3 }]
    expect(priceItems(items, [rule('a', { effect: 'amount_off', value: 100 }, ['pint'])]).savings).toEqual([{ key: 'pint', ruleId: 'a', codeId: null, minor: 300, units: 3, uses: 3 }])
    expect(priceItems(items, [rule('a', { effect: 'amount_off', value: 100, countBy: 'sale' }, ['pint'])]).savings[0]!.uses).toBe(1)
  })

  it('leaves alone prices already reduced for the buyer when asked to', () => {
    const items = [{ key: 'full', listMinor: 1200, quantity: 1 }, { key: 'member', listMinor: 800, quantity: 1, reduced: true }]
    expect(saved(items, [rule('a', { effect: 'percent_off', value: 2000, notWithRequirements: true }, ['full', 'member'])])).toEqual({ full: 240 })
  })

  it('gives each unit the best promotion for the customer, not both', () => {
    const items = [{ key: 'full', listMinor: 1200, quantity: 1 }]
    const priced = priceItems(items, [rule('small', { effect: 'amount_off', value: 100 }, ['full']), rule('big', { effect: 'percent_off', value: 5000 }, ['full'])])
    expect(priced.savings.map(s => [s.ruleId, s.minor])).toEqual([['big', 600]])
    expect(priced.unused).toEqual(['small'])
  })

  it('stacks two promotions on one unit when both combine, the second on what is left', () => {
    const items = [{ key: 'full', listMinor: 1000, quantity: 1 }]
    const priced = priceItems(items, [rule('a', { effect: 'percent_off', value: 5000, combines: true }, ['full']), rule('b', { effect: 'amount_off', value: 100, combines: true }, ['full'])])
    expect(priced.byItem.get('full')).toBe(600)
  })
})

describe('multi-buy', () => {
  it('makes the cheapest of each group free, shared across the group by price', () => {
    const items = [{ key: 'lager', listMinor: 480, quantity: 2 }, { key: 'cola', listMinor: 300, quantity: 1 }]
    const priced = priceItems(items, [rule('three', { effect: 'multi_buy', value: 0, buyQuantity: 3, freeQuantity: 1 }, ['lager', 'cola'])])
    expect([...priced.byItem.values()].reduce((a, b) => a + b, 0)).toBe(300)
    expect(Object.fromEntries(priced.byItem)).toEqual({ lager: 228, cola: 72 })
  })

  it('sells a group at a set price, and leaves a part group at its own price', () => {
    const items = [{ key: 'pint', listMinor: 480, quantity: 5 }]
    expect(saved(items, [rule('two', { effect: 'multi_buy', value: 800, buyQuantity: 2 }, ['pint'])])).toEqual({ pint: 320 })
  })
})

describe('basket promotions', () => {
  it('takes an amount off the whole, shared by price to the penny', () => {
    const items = [{ key: 'full', listMinor: 1200, quantity: 1 }, { key: 'conc', listMinor: 800, quantity: 1 }, { key: 'wine', listMinor: 450, quantity: 1 }]
    expect(saved(items, [rule('five', { effect: 'basket_amount_off', value: 500 }, ['full', 'conc', 'wine'])])).toEqual({ full: 245, conc: 163, wine: 92 })
  })

  it('comes after item promotions, on what is left, and needs its minimum spend', () => {
    const items = [{ key: 'full', listMinor: 1000, quantity: 2 }]
    const both = [rule('half', { effect: 'percent_off', value: 5000 }, ['full']), rule('off', { effect: 'basket_amount_off', value: 300, minSpendMinor: 1000 }, ['full'])]
    expect(saved(items, both)).toEqual({ full: 1300 })
    const tooSmall = [rule('half', { effect: 'percent_off', value: 5000 }, ['full']), rule('off', { effect: 'basket_amount_off', value: 300, minSpendMinor: 1500 }, ['full'])]
    expect(saved(items, tooSmall)).toEqual({ full: 1000 })
  })
})

describe('conditions on the rest of the sale', () => {
  it('prices a drink with a ticket, and not without one', () => {
    const deal = rule('deal', { effect: 'set_price', value: 300, requires: [{ items: new Set(['ticket']), quantity: 1 }] }, ['lager'])
    expect(saved([{ key: 'lager', listMinor: 480, quantity: 1 }, { key: 'ticket', listMinor: 1200, quantity: 1 }], [deal])).toEqual({ lager: 180 })
    expect(saved([{ key: 'lager', listMinor: 480, quantity: 1 }], [deal])).toEqual({})
  })
})
