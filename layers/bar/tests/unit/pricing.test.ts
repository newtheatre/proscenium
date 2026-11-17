// The price rules (tab 3, "Price lists"; tests T-U1): the newest price in force wins, a list falls
// back to Standard, a percentage list follows Standard with halves rounded up.
import { describe, expect, it } from 'vitest'
import { inForce, lessPercent, nextChange, priceOn, type PriceRow } from '../../server/pricing'

const std = { id: 'std', percentOff: null, fallsBack: true }
const committee = { id: 'com', percentOff: 25, fallsBack: true }
const staff = { id: 'stf', percentOff: null, fallsBack: true }
const strict = { id: 'str', percentOff: null, fallsBack: false }
const row = (id: string, priceListId: string, amountMinor: number | null, effectiveFrom: number, variantId = 'pint'): PriceRow => ({ id, variantId, priceListId, amountMinor, effectiveFrom })

describe('prices', () => {
  const rows = [row('a', 'std', 420, 100), row('b', 'std', 450, 200), row('c', 'std', 480, 900), row('d', 'stf', 300, 100), row('e', 'stf', null, 500)]

  it('takes the newest price that has started', () => {
    expect(inForce(rows, 'pint', 'std', 150)!.id).toBe('a')
    expect(inForce(rows, 'pint', 'std', 600)!.id).toBe('b')
    expect(inForce(rows, 'pint', 'std', 50)).toBeNull()
    expect(nextChange(rows, 'pint', 'std', 600)!.id).toBe('c')
  })

  it('works out a percentage list from Standard, rounding halves up', () => {
    expect(lessPercent(450, 25)).toBe(338)
    expect(lessPercent(230, 25)).toBe(173)
    expect(lessPercent(100, 100)).toBe(0)
    expect(priceOn(rows, 'pint', committee, 'std', 600)).toEqual({ amountMinor: 338, priceId: 'b', from: 'percent' })
  })

  it('falls back to Standard where a list has no price, or has withdrawn it', () => {
    expect(priceOn(rows, 'pint', staff, 'std', 300)).toEqual({ amountMinor: 300, priceId: 'd', from: 'list' })
    expect(priceOn(rows, 'pint', staff, 'std', 600)).toEqual({ amountMinor: 450, priceId: 'b', from: 'standard' })
    expect(priceOn(rows, 'pint', strict, 'std', 600)).toBeNull()
    expect(priceOn(rows, 'half', std, 'std', 600)).toBeNull()
  })
})
