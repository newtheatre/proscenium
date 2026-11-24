import { describe, expect, it } from 'vitest'
import { insideOf, locationTree } from '../../app/utils/location-tree'
import { itemAddress, readLabel } from '../../app/utils/items'
import type { Location } from '../../shared/setup'

const at = (id: string, parentId: string | null, name = id): Location => ({ id, name, parentId, venueId: null, spaceId: null, state: 'active', items: 0, children: 0 })

describe('the locations tree as a list (INV-07)', () => {
  const locations = [at('rail', 'store', 'Rail 3'), at('store', null, 'Costume store'), at('top', 'rail', 'Top shelf'), at('workshop', null, 'Workshop')]

  it('puts each location after its parent, with its depth and path', () => {
    expect(locationTree(locations).map(r => `${r.depth}:${r.path}`)).toEqual(['1:Costume store', '2:Costume store › Rail 3', '3:Costume store › Rail 3 › Top shelf', '1:Workshop'])
  })

  it('finds everything inside a location, which it may not be moved into', () => {
    expect([...insideOf(locations, 'store')].sort()).toEqual(['rail', 'store', 'top'])
    expect([...insideOf(locations, 'workshop')]).toEqual(['workshop'])
  })
})

describe('readLabel', () => {
  it('reads the item from a label\'s address, and a tag typed in lower case', () => {
    expect(readLabel(itemAddress('https://example.org', 'kit_1'))).toEqual({ itemId: 'kit_1' })
    expect(readLabel(' prp-0012 ')).toEqual({ tag: 'PRP-0012' })
  })
})
