import { describe, expect, test } from 'bun:test'
import { archiveVenueForm, saysVenueUse, venueForm } from '#shared/utils/venues'

// D-131's venue form: what may be typed, and what refuses before it ever reaches a query.

describe('a venue needs a name and a sensible capacity (criterion 1)', () => {
  test('a name is required, and blank is not one', () => {
    expect(venueForm.safeParse({ name: 'The Theatre' }).success).toBe(true)
    expect(venueForm.safeParse({ name: '   ' }).success).toBe(false)
  })

  test('capacity is optional, and a positive integer when given', () => {
    expect(venueForm.parse({ name: 'The Theatre' }).capacity).toBeUndefined()
    expect(venueForm.safeParse({ name: 'The Theatre', capacity: 0 }).success).toBe(false)
    expect(venueForm.safeParse({ name: 'The Theatre', capacity: -1 }).success).toBe(false)
    expect(venueForm.safeParse({ name: 'The Theatre', capacity: 120 }).success).toBe(true)
  })

  test('a nought capacity is refused with where nought belongs', () => {
    const refused = venueForm.safeParse({ name: 'The Theatre', capacity: 0 })
    expect(refused.error?.issues[0]?.message).toBe('A venue seats at least 1. To close one performance, set its own capacity to 0')
  })

  test('a room is optional and taken by id, nothing else inferred (0043)', () => {
    expect(venueForm.parse({ name: 'The Theatre', roomId: 'r-1' }).roomId).toBe('r-1')
    expect(venueForm.parse({ name: 'The Theatre' }).roomId).toBeUndefined()
  })

  test('is external defaults to false', () => {
    expect(venueForm.parse({ name: 'The Theatre' }).isExternal).toBe(false)
  })

  test('an unknown field is refused, never silently dropped', () => {
    expect(venueForm.safeParse({ name: 'The Theatre', capacityOverride: 10 }).success).toBe(false)
  })
})

describe('retiring is its own action', () => {
  test('the archive form takes a plain boolean', () => {
    expect(archiveVenueForm.parse({ archived: true })).toEqual({ archived: true })
    expect(archiveVenueForm.safeParse({}).success).toBe(false)
  })
})

// D-131 criterion 8, issue 1151 item 10: every row carried an Emergency card link and every one
// of them went to the same list, so the column read as a link to each venue's own card.
describe('the emergency card is linked once, not once a row', () => {
  const SCREEN = 'app/pages/box-office/venues.vue'

  test('no row action links to the emergency screen', async () => {
    const source = await Bun.file(SCREEN).text()
    expect(source).not.toContain('`emergency-${row.original.id}`')
  })

  test('the screen links to it once, above the table', async () => {
    const source = await Bun.file(SCREEN).text()
    expect(source).toContain('emergency-cards')
    expect(source.match(/\/rota\/manage\/emergency/g) ?? []).toHaveLength(1)
  })
})

describe('the In use cell says what the venue holds', () => {
  test('shows and performances are counted, and anything else is named', () => {
    expect(saysVenueUse({ inUse: false, showCount: 0, performanceCount: 0 })).toBe('Nothing yet')
    expect(saysVenueUse({ inUse: true, showCount: 1, performanceCount: 1 })).toBe('1 show, 1 performance')
    expect(saysVenueUse({ inUse: true, showCount: 2, performanceCount: 6 })).toBe('2 shows, 6 performances')
    expect(saysVenueUse({ inUse: true, showCount: 0, performanceCount: 0 })).toBe('Rota or night records')
  })
})
