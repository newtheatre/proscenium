import { describe, expect, test } from 'bun:test'
import { archiveVenueForm, venueForm } from '#shared/utils/venues'

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
