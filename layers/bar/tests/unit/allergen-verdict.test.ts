// What an answer means for someone avoiding milk: an item that depends on a choice is never "none listed"
// while any option it offers contains or may contain what they avoid, or has not been checked.
import { describe, expect, it } from 'vitest'
import { itemVerdict } from '../../shared/allergen-verdict'

const clear = { contains: [], mayContain: [], checked: true }
const milky = { contains: ['milk'], mayContain: [], checked: true }
const flatWhite = { ...clear, dependsOnChoice: true }
const milks = [{ group: 'Milk', options: [{ label: 'Semi-skimmed', allergens: milky }, { label: 'Oat', allergens: clear }] }]

describe('itemVerdict', () => {
  it('says nothing when nothing is avoided', () => {
    expect(itemVerdict([], flatWhite, milks)).toBeNull()
  })

  it('depends on the choice when an option holds what is avoided, never "none listed"', () => {
    expect(itemVerdict(['milk'], flatWhite, milks)).toEqual({ kind: 'depends', hit: [], groups: ['Milk'] })
  })

  it('is clear when no option is a problem', () => {
    expect(itemVerdict(['gluten'], flatWhite, milks)?.kind).toBe('none-listed')
  })

  it('depends on an option that has not been checked', () => {
    expect(itemVerdict(['gluten'], flatWhite, [{ group: 'Milk', options: [{ label: 'Soya', allergens: { contains: [], mayContain: [], checked: false } }] }])?.kind).toBe('depends')
  })

  it('prefers what the item itself contains, or not having been checked', () => {
    expect(itemVerdict(['milk'], { ...milky, dependsOnChoice: true }, milks)?.kind).toBe('contains')
    expect(itemVerdict(['milk'], { contains: [], mayContain: [], checked: false }, [])?.kind).toBe('not-checked')
  })
})
