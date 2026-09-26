import { describe, expect, test } from 'bun:test'
import {
  BOOKING_STATUSES,
  HOLDS_A_SLOT,
  bookingForm,
  bookingTier,
  isTier,
  maskConflicts,
  overlaps,
} from '#shared/utils/bookings'
import { seriesForm } from '#shared/utils/series'

// C-107. Intervals are half-open, so back-to-back bookings never clash, and a member learns that a
// slot is taken without learning whose it is (C-103 criteria 3 and 4).

const at = (iso: string): number => Math.floor(new Date(iso).getTime() / 1000)

describe('intervals are half-open (criterion 5)', () => {
  const booked = { startsAt: at('2026-09-14T17:00:00Z'), endsAt: at('2026-09-14T19:00:00Z') }

  test('one starting where another ends does not clash', () => {
    expect(overlaps(booked, { startsAt: at('2026-09-14T19:00:00Z'), endsAt: at('2026-09-14T21:00:00Z') })).toBe(false)
  })

  test('nor one ending where another starts', () => {
    expect(overlaps(booked, { startsAt: at('2026-09-14T15:00:00Z'), endsAt: at('2026-09-14T17:00:00Z') })).toBe(false)
  })

  test('a minute of overlap is an overlap', () => {
    expect(overlaps(booked, { startsAt: at('2026-09-14T18:59:00Z'), endsAt: at('2026-09-14T21:00:00Z') })).toBe(true)
  })

  test('one wholly inside another clashes', () => {
    expect(overlaps(booked, { startsAt: at('2026-09-14T17:30:00Z'), endsAt: at('2026-09-14T18:00:00Z') })).toBe(true)
  })

  test('one wholly containing another clashes', () => {
    expect(overlaps(booked, { startsAt: at('2026-09-14T16:00:00Z'), endsAt: at('2026-09-14T20:00:00Z') })).toBe(true)
  })

  test('two spans nowhere near each other do not', () => {
    expect(overlaps(booked, { startsAt: at('2026-09-15T17:00:00Z'), endsAt: at('2026-09-15T19:00:00Z') })).toBe(false)
  })
})

describe('what holds a slot (C-103 criterion 2)', () => {
  test('a confirmed booking and one awaiting a decision both do', () => {
    expect(HOLDS_A_SLOT).toContain('CONFIRMED')
    expect(HOLDS_A_SLOT).toContain('PENDING_APPROVAL')
  })

  test('a rejected, cancelled or bumped one does not', () => {
    for (const status of ['REJECTED', 'CANCELLED', 'BUMPED']) {
      expect(`${status}: ${HOLDS_A_SLOT.includes(status as never)}`).toBe(`${status}: false`)
    }
  })

  test('every status the schema allows is one the code knows', () => {
    expect([...BOOKING_STATUSES].sort())
      .toEqual(['BUMPED', 'CANCELLED', 'CONFIRMED', 'PENDING_APPROVAL', 'REJECTED'])
  })
})

// Criterion 4, and C-103 criterion 5: the same masking on the calendar, the search and any error
// payload that lists conflicts.
describe('a member learns a slot is taken, never whose it is', () => {
  const clash = [{
    startsAt: at('2026-09-14T17:00:00Z'),
    endsAt: at('2026-09-14T19:00:00Z'),
    title: 'Dress run, The Crucible',
    bookedBy: 'Imogen Hart',
  }]

  test('without standing it reads Booked, with the times and nothing else', () => {
    const [masked] = maskConflicts(clash, false)
    expect(masked?.title).toBe('Booked')
    expect(masked?.bookedBy).toBeUndefined()
    expect(masked?.startsAt).toBe(clash[0]!.startsAt)
  })

  test('nothing identifying survives the masking, not even in another field', () => {
    expect(JSON.stringify(maskConflicts(clash, false))).not.toContain('Imogen')
    expect(JSON.stringify(maskConflicts(clash, false))).not.toContain('Crucible')
  })

  test('an administrator sees what is actually there', () => {
    const [seen] = maskConflicts(clash, true)
    expect(seen?.title).toBe('Dress run, The Crucible')
    expect(seen?.bookedBy).toBe('Imogen Hart')
  })

  test('masking an empty list is an empty list, not an error', () => {
    expect(maskConflicts([], false)).toEqual([])
  })
})

describe('what a booking request must say', () => {
  test('a room, a span, a title and what it is for', () => {
    expect(bookingForm.safeParse({
      roomId: 'r-1',
      title: 'Rehearsal',
      purpose: 'REHEARSAL',
      startsAt: '2026-09-14T09:00:00.000Z',
      endsAt: '2026-09-14T11:00:00.000Z',
    }).success).toBe(true)
  })

  test('a span that ends before it starts is refused before any database sees it', () => {
    expect(bookingForm.safeParse({
      roomId: 'r-1',
      title: 'Rehearsal',
      startsAt: '2026-09-14T11:00:00.000Z',
      endsAt: '2026-09-14T09:00:00.000Z',
    }).success).toBe(false)
  })

  test('a zero-length booking is not a booking', () => {
    expect(bookingForm.safeParse({
      roomId: 'r-1',
      title: 'Rehearsal',
      startsAt: '2026-09-14T09:00:00.000Z',
      endsAt: '2026-09-14T09:00:00.000Z',
    }).success).toBe(false)
  })

  // 0033's reasoning: the tier list is committee-editable, so the constraint lives in code.
  test('a tier the estate uses is accepted and one nobody registered is not', () => {
    expect(isTier('REHEARSAL')).toBe(true)
    expect(isTier('PRODUCTION')).toBe(true)
    expect(isTier('WHATEVER')).toBe(false)
  })
})

// Issue 1337: a member's tier follows from what the room is for, because the tier decides who
// keeps a contested slot; only an officer names Production or Committee (C-115 criterion 1).
describe('the server decides a booking\'s tier (C-115 criterion 1)', () => {
  test('a member\'s rehearsal is a rehearsal, whatever tier was sent', () => {
    expect(bookingTier('REHEARSAL', 'PRODUCTION', false)).toBe('REHEARSAL')
    expect(bookingTier('REHEARSAL', undefined, false)).toBe('REHEARSAL')
  })

  test('anything else a member books is general use', () => {
    expect(bookingTier('MEETING', 'COMMITTEE', false)).toBe('GENERAL')
    expect(bookingTier('GET_IN', 'PRODUCTION', false)).toBe('GENERAL')
  })

  test('an officer\'s named tier stands, and with none named it is derived as a member\'s is', () => {
    expect(bookingTier('GET_IN', 'PRODUCTION', true)).toBe('PRODUCTION')
    expect(bookingTier('MEETING', undefined, true)).toBe('GENERAL')
  })

  test('the form no longer needs a tier at all', () => {
    const parsed = bookingForm.safeParse({
      roomId: 'r-1',
      title: 'Rehearsal',
      startsAt: '2026-09-14T09:00:00.000Z',
      endsAt: '2026-09-14T11:00:00.000Z',
      purpose: 'REHEARSAL',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.tier).toBeUndefined()
  })

  test('nor does a series', () => {
    const parsed = seriesForm.safeParse({
      roomId: 'r-1',
      title: 'Weekly rehearsal',
      purpose: 'REHEARSAL',
      frequency: 'WEEKLY',
      weekdays: [1],
      startsOn: '2026-10-05',
      from: '19:00',
      to: '21:00',
      occurrences: 4,
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.tier).toBeUndefined()
  })
})
