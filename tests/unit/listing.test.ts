import { describe, expect, test } from 'bun:test'
import { listingFlag, posterGlyph, posterTint, soldOutNightsSays } from '#shared/utils/listing'
import { saysDay } from '#shared/utils/when'
import type { Availability, ListedPerformance, ListedShow } from '#shared/utils/programme'

// A run, reduced to the one word a card puts on it, and the colours an artless frame is given.

function night(availability: Availability, cancelled = false, startsAt = 0): ListedPerformance {
  return {
    id: crypto.randomUUID(),
    startsAt,
    doorsAt: null,
    durationMinutes: 120,
    intervalCount: 0,
    intervalMinutes: null,
    venueName: 'Main Hall',
    venueAddress: null,
    externalBookingUrl: null,
    bookingClosesAt: 0,
    cancelled,
    availability,
    remaining: null,
    says: availability,
    prices: [],
  }
}

const run = (...performances: ListedPerformance[]): ListedShow => ({
  show: { slug: 'the-seagull' } as ListedShow['show'],
  categoryName: null,
  assessment: 'NONE' as ListedShow['assessment'],
  warnings: [],
  guidance: [],
  contentNotes: null,
  performances,
})

describe('what a listing card says about a run (#918)', () => {
  test('one sold-out night among bookable ones is not a full house', () => {
    expect(listingFlag(run(night('SOLD_OUT'), night('AVAILABLE')))).toBeNull()
  })

  test('house full only when every on-sale night is gone', () => {
    expect(listingFlag(run(night('SOLD_OUT'), night('SOLD_OUT')))).toBe('Sold out')
  })

  test('a cancelled night and a closed window neither fill a house nor empty one', () => {
    expect(listingFlag(run(night('SOLD_OUT'), night('AVAILABLE', true)))).toBe('Sold out')
    expect(listingFlag(run(night('SOLD_OUT'), night('BOOKING_CLOSED')))).toBe('Sold out')
  })

  test('selling fast when a night is limited and the run is not full', () => {
    expect(listingFlag(run(night('LIMITED'), night('AVAILABLE')))).toBe('Selling fast')
    expect(listingFlag(run(night('LIMITED'), night('SOLD_OUT')))).toBe('Selling fast')
  })

  test('a run with nothing on offer carries nothing', () => {
    expect(listingFlag(run())).toBeNull()
    expect(listingFlag(run(night('AVAILABLE', true)))).toBeNull()
    expect(listingFlag(run(night('AVAILABLE')))).toBeNull()
  })
})

describe('the nights already full in a run still selling', () => {
  const thursday = Date.UTC(2026, 9, 22, 18, 30) / 1000
  const friday = Date.UTC(2026, 9, 23, 18, 30) / 1000

  // Through saysDay itself, so the year it adds outside the committee year never dates the test.
  test('a sold-out last night is named while an earlier one sells', () => {
    expect(soldOutNightsSays(run(night('AVAILABLE', false, thursday), night('SOLD_OUT', false, friday)))).toBe(`Sold out ${saysDay(friday)}`)
  })

  test('several full nights are named soonest first', () => {
    expect(soldOutNightsSays(run(night('SOLD_OUT', false, friday), night('SOLD_OUT', false, thursday), night('LIMITED', false, friday + 86_400))))
      .toBe(`Sold out ${saysDay(thursday)}, ${saysDay(friday)}`)
  })

  test('nothing is said when no night is full, or when no other night is on sale', () => {
    expect(soldOutNightsSays(run(night('AVAILABLE'), night('LIMITED')))).toBeNull()
    expect(soldOutNightsSays(run(night('SOLD_OUT'), night('BOOKING_CLOSED')))).toBeNull()
    expect(soldOutNightsSays(run(night('SOLD_OUT', true), night('AVAILABLE')))).toBeNull()
  })
})

describe('the artless frame (#919)', () => {
  test('a show keeps its colours', () => {
    expect(posterTint('the-seagull')).toEqual(posterTint('the-seagull'))
    expect(posterGlyph('the-seagull')).toBe(posterGlyph('the-seagull'))
  })

  test('two hues far enough apart to read as two, both inside the wheel', () => {
    for (const slug of ['the-seagull', 'machinal', 'a-midsummer-nights-dream', 'x']) {
      const { from, to } = posterTint(slug)
      expect(from).toBeGreaterThanOrEqual(0)
      expect(from).toBeLessThan(360)
      expect(to).toBeLessThan(360)
      expect(Math.abs(from - to)).toBeGreaterThan(100)
    }
  })

  test('neighbouring slugs do not land on the same frame', () => {
    expect(posterTint('the-seagull')).not.toEqual(posterTint('the-seagulls'))
  })
})
