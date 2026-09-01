import { describe, expect, test } from 'bun:test'
import { PURPOSES, TIERS, bookingForm, describePurpose, isPurpose } from '#shared/utils/bookings'
import { CONFIG_KEYS, ENFORCED_KEYS } from '#shared/utils/config'

// C-119's first half. A purpose is what the room is for; a tier is who wins a contested slot.
// The two were one field, and one field cannot answer both questions.

describe('a purpose is not a priority', () => {
  test('they are separate vocabularies', () => {
    expect(PURPOSES).not.toEqual(TIERS as unknown as typeof PURPOSES)
    // REHEARSAL is in both, and means different things: what the room is for, and how it ranks.
    expect(PURPOSES).toContain('REHEARSAL')
    expect(TIERS).toContain('REHEARSAL')
  })

  test('a booking carries both, independently', () => {
    const parsed = bookingForm.safeParse({
      roomId: 'studio',
      title: 'Act one',
      startsAt: '2027-03-04T19:00:00.000Z',
      endsAt: '2027-03-04T21:00:00.000Z',
      tier: 'PRODUCTION',
      purpose: 'MEETING',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.tier).toBe('PRODUCTION')
      expect(parsed.data.purpose).toBe('MEETING')
    }
  })

  test('a booking must say what it is for', () => {
    const without = bookingForm.safeParse({
      roomId: 'studio',
      title: 'Act one',
      startsAt: '2027-03-04T19:00:00.000Z',
      endsAt: '2027-03-04T21:00:00.000Z',
    })
    expect(without.success).toBe(false)
  })

  test('whitespace is not a purpose', () => {
    const parsed = bookingForm.safeParse({
      roomId: 'studio',
      title: 'Act one',
      startsAt: '2027-03-04T19:00:00.000Z',
      endsAt: '2027-03-04T21:00:00.000Z',
      purpose: '   ',
    })
    expect(parsed.success).toBe(false)
  })

  // The form takes any string, because the list is committee-editable and the write path is what
  // checks it. A zod enum here would refuse a purpose the committee had just added.
  test('the form does not freeze the vocabulary', () => {
    const parsed = bookingForm.safeParse({
      roomId: 'studio',
      title: 'Act one',
      startsAt: '2027-03-04T19:00:00.000Z',
      endsAt: '2027-03-04T21:00:00.000Z',
      purpose: 'SOMETHING_NEW',
    })
    expect(parsed.success).toBe(true)
  })
})

describe('the list is configuration', () => {
  test('the setting exists and the code default matches it', () => {
    expect(CONFIG_KEYS.ROOM_PURPOSES.default).toEqual([...PURPOSES])
  })

  test('and something actually reads it', () => {
    expect([...ENFORCED_KEYS]).toContain('ROOM_PURPOSES')
  })
})

describe('a purpose reads as English', () => {
  test.each([
    ['REHEARSAL', 'Rehearsal'],
    ['READ_THROUGH', 'Read through'],
    ['GET_IN', 'Get in'],
  ])('%s reads as %s', (value, reads) => {
    expect(describePurpose(value)).toBe(reads)
  })

  // History was never asked, and the importer refuses to invent one.
  test('nothing recorded says so rather than guessing', () => {
    expect(describePurpose(null)).toBe('Not recorded')
    expect(describePurpose('')).toBe('Not recorded')
  })

  test('a purpose the list no longer carries still reads', () => {
    expect(describePurpose('SOMETHING_OLD')).toBe('Something old')
    expect(isPurpose('SOMETHING_OLD')).toBe(false)
    expect(isPurpose('REHEARSAL')).toBe(true)
  })
})
