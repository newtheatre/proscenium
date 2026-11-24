// The till works a split out before the sale is made, and must agree with the server penny for penny.
import { describe, expect, it } from 'vitest'
import { byRank, planSplit, quickNotes, unitShares, unitsOf } from '../../shared/till'

const panels = [
  { basket: 'tickets', amountMinor: 3000, lines: [{ label: 'Full', item: 'Full ticket', quantity: 3, amountMinor: 3000 }] },
  { basket: 'bar', amountMinor: 1001, lines: [{ label: 'Pint', quantity: 2, amountMinor: 1001 }, { label: 'Crisps', amountMinor: 0 }] },
]

describe('unitShares', () => {
  it('gives the odd pennies to the first units', () => {
    expect(unitShares(1001, 2)).toEqual([501, 500])
    expect(unitShares(100, 3)).toEqual([34, 33, 33])
    expect(unitShares(500, 1)).toEqual([500])
  })
})

describe('unitsOf', () => {
  it('counts each unit of a line, naming it by its item where it has one', () => {
    expect(unitsOf(panels).map(u => [u.basket, u.line, u.label, u.amountMinor])).toEqual([
      ['tickets', 0, 'Full ticket', 1000], ['tickets', 0, 'Full ticket', 1000], ['tickets', 0, 'Full ticket', 1000],
      ['bar', 0, 'Pint', 501], ['bar', 0, 'Pint', 500],
      ['bar', 1, 'Crisps', 0],
    ])
  })
})

describe('planSplit', () => {
  const units = unitsOf(panels)

  it('gives each person their units, summing a line they share', () => {
    const plan = planSplit(units, [1, 2, 1, 2, 2, 1], 2)
    expect(plan).toEqual([
      { position: 1, amountMinor: 2000, items: [{ basket: 'tickets', line: 0, label: 'Full ticket', quantity: 2, amountMinor: 2000 }, { basket: 'bar', line: 1, label: 'Crisps', quantity: 1, amountMinor: 0 }] },
      { position: 2, amountMinor: 2001, items: [{ basket: 'tickets', line: 0, label: 'Full ticket', quantity: 1, amountMinor: 1000 }, { basket: 'bar', line: 0, label: 'Pint', quantity: 2, amountMinor: 1001 }] },
    ])
  })

  it('hands a shared line its odd pennies in person order, as the server does', () => {
    const plan = planSplit(units, [3, 3, 3, 2, 1, 1], 3)
    expect(plan.map(p => p.items.find(i => i.basket === 'bar' && i.line === 0)?.amountMinor)).toEqual([501, 500, undefined])
  })

  it('leaves a person with nothing at zero, which the till refuses to sell', () => {
    expect(planSplit(units, units.map(() => 1), 2)[1]).toEqual({ position: 2, items: [], amountMinor: 0 })
  })

  it('gives a unit with no owner to the first person', () => {
    expect(planSplit(units, [], 2)[0]!.amountMinor).toBe(4001)
  })
})

describe('ways to pay', () => {
  it('puts card first and cash after it, then anything else', () => {
    const ways = ['other_attested', 'cash', 'card_attested', 'card_reader'].map(method => ({ method }))
    expect(byRank(ways).map(w => w.method)).toEqual(['card_reader', 'card_attested', 'cash', 'other_attested'])
  })

  it('offers the next three notes up as quick amounts', () => {
    const toMinor = (major: number) => major * 100
    expect(quickNotes(730, toMinor)).toEqual([1000, 2000, 5000])
    expect(quickNotes(2500, toMinor)).toEqual([5000])
    expect(quickNotes(5000, toMinor)).toEqual([])
  })
})
