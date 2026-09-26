import { describe, expect, test } from 'bun:test'
import { NO_STOCK_GROUP, joinCount, saysCount, splitCount, stocktakeGroups, stocktakeCountsForm } from '#shared/utils/stocktakes'
import type { StocktakeLine } from '#shared/utils/stocktakes'

// Issue 1321 (F-115): three and a half bottles were typed as 2625, so a measured item with a
// container size is counted as full containers plus the open one, and stored in its own unit.

describe('a count is full containers plus the open one', () => {
  test('three full bottles and half of the fourth is 2,625 ml of a 750 ml bottle', () => {
    expect(joinCount(3, 375, 750)).toBe(2625)
  })

  test('either half on its own is still a count, the other read as none', () => {
    expect(joinCount(3, undefined, 750)).toBe(2250)
    expect(joinCount(undefined, 200, 750)).toBe(200)
    expect(joinCount(0, 0, 750)).toBe(0)
  })

  // F-115 criterion 2: nothing typed is uncounted, never a count of nought.
  test('nothing typed in either is uncounted, not nought', () => {
    expect(joinCount(undefined, undefined, 750)).toBeNull()
  })

  test('a stored count reads back as the containers it was typed as', () => {
    expect(splitCount(2625, 750)).toEqual({ full: 3, part: 375 })
    expect(splitCount(0, 750)).toEqual({ full: 0, part: 0 })
    expect(splitCount(700, 700)).toEqual({ full: 1, part: 0 })
  })

  test('the screen says the count both ways, so the millilitres are never worked out by hand', () => {
    expect(saysCount(2625, 'ML', 750)).toBe('3 full and 375 ml open, 2625 ml')
    expect(saysCount(1500, 'ML', 750)).toBe('2 full, 1500 ml')
    expect(saysCount(400, 'ML', null)).toBe('400 ml')
    expect(saysCount(12, 'ITEM', null)).toBe('12')
  })
})

describe('the lines are grouped the way the bar is stocked', () => {
  const line = (itemId: string, category: string | null): StocktakeLine => ({
    id: `l-${itemId}`,
    itemId,
    itemName: itemId,
    unit: 'ML',
    containerMl: 700,
    category,
    expectedQty: 0,
    countedQty: null,
    variance: null,
    varianceCostPence: null,
  })

  test('each stock group is one section, in the order the lines arrive', () => {
    const groups = stocktakeGroups([line('gin', 'Spirits'), line('rum', 'Spirits'), line('red', 'Wine'), line('ice', null)])
    expect(groups.map(group => group.name)).toEqual(['Spirits', 'Wine', NO_STOCK_GROUP])
    expect(groups[0]?.lines.map(one => one.itemId)).toEqual(['gin', 'rum'])
  })
})

// Saved line by line: one count a submission is the ordinary case now, not a batch of every line.
describe('a single line saves on its own', () => {
  test('one count, or one line cleared back to blank, is a whole submission', () => {
    expect(stocktakeCountsForm.safeParse({ counts: [{ itemId: 'gin', counted: 2625 }] }).success).toBe(true)
    expect(stocktakeCountsForm.safeParse({ counts: [{ itemId: 'gin', counted: null }] }).success).toBe(true)
  })
})
