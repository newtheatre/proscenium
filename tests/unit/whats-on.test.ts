import { describe, expect, test } from 'bun:test'
import { fromLondonWallClock } from '#shared/utils/london'
import {
  LISTED_CACHE_MAX_SECONDS,
  listingCacheSeconds,
  performanceAvailability,
  remainingSeats,
  saysAvailability,
} from '#shared/utils/programme'
import { resolvePrice } from '#shared/utils/ticket-types'
import type { PerformanceSaleState } from '#shared/utils/programme'

// The public listing as pure rules (D-101, D-112 criterion 4). What the routes do with them is in
// tests/integration/whats-on.test.ts; nothing is asserted twice.

const seconds = (at: Date): number => Math.floor(at.getTime() / 1000)

const CURTAIN = fromLondonWallClock(2026, 10, 17, 19, 30)

const onSale = (over: Partial<PerformanceSaleState> = {}): PerformanceSaleState => ({
  status: 'ON_SALE',
  showStatus: 'PUBLISHED',
  startsAt: seconds(CURTAIN),
  bookingClosesHoursBefore: null,
  showBookingClosesHoursBefore: null,
  externalBookingUrl: null,
  ...over,
})

// A tenth of the house, which is what the workshop register proposes (docs/workshops.md).
const LIMITED_PERCENT = 10

describe('a performance states one of four availabilities (D-101 criterion 2)', () => {
  const morning = new Date(CURTAIN.getTime() - 6 * 3600 * 1000)

  test('an empty house with seats left is available', () => {
    const state = performanceAvailability(onSale(), { capacity: 100, sold: 0 }, LIMITED_PERCENT, morning)
    expect(state).toBe('AVAILABLE')
  })

  test('the last tenth of the house is limited', () => {
    expect(performanceAvailability(onSale(), { capacity: 100, sold: 90 }, LIMITED_PERCENT, morning)).toBe('LIMITED')
    expect(performanceAvailability(onSale(), { capacity: 100, sold: 89 }, LIMITED_PERCENT, morning)).toBe('AVAILABLE')
  })

  test('a full house is sold out, and so is one sold past its capacity', () => {
    expect(performanceAvailability(onSale(), { capacity: 100, sold: 100 }, LIMITED_PERCENT, morning)).toBe('SOLD_OUT')
    expect(performanceAvailability(onSale(), { capacity: 100, sold: 104 }, LIMITED_PERCENT, morning)).toBe('SOLD_OUT')
  })

  test('an uncapped venue is never limited and never sold out', () => {
    expect(performanceAvailability(onSale(), { capacity: null, sold: 4000 }, LIMITED_PERCENT, morning)).toBe('AVAILABLE')
    expect(remainingSeats({ capacity: null, sold: 4000 })).toBeNull()
  })

  test('a closed house sells nothing, however few have bought', () => {
    expect(performanceAvailability(onSale(), { capacity: 0, sold: 0 }, LIMITED_PERCENT, morning)).toBe('SOLD_OUT')
  })

  // Whatever the seats say, a refusal is the honest answer: the visitor cannot book this one, so
  // the listing says booking is closed rather than dangling a button that would 409.
  test('anything saleRefusal refuses reads as booking closed', () => {
    const refused: Partial<PerformanceSaleState>[] = [
      { status: 'CANCELLED' },
      { status: 'DRAFT' },
      { showStatus: 'DRAFT' },
      { externalBookingUrl: 'https://tickets.example.org/seagull' },
    ]
    for (const over of refused) {
      expect(performanceAvailability(onSale(over), { capacity: 100, sold: 0 }, LIMITED_PERCENT, morning)).toBe('BOOKING_CLOSED')
    }
  })

  test('a performance past its window is booking closed rather than available', () => {
    const performance = onSale({ bookingClosesHoursBefore: 2 })
    const twoHoursBefore = new Date(CURTAIN.getTime() - 2 * 3600 * 1000)
    expect(performanceAvailability(performance, { capacity: 100, sold: 0 }, LIMITED_PERCENT, twoHoursBefore)).toBe('BOOKING_CLOSED')
    expect(performanceAvailability(performance, { capacity: 100, sold: 0 }, LIMITED_PERCENT, new Date(twoHoursBefore.getTime() - 1000))).toBe('AVAILABLE')
  })

  test('each state says something a visitor can act on', () => {
    expect(saysAvailability('AVAILABLE', 40)).toBe('Tickets available')
    expect(saysAvailability('LIMITED', 6)).toBe('6 tickets left')
    expect(saysAvailability('LIMITED', 1)).toBe('1 ticket left')
    expect(saysAvailability('SOLD_OUT', 0)).toBe('Sold out')
    expect(saysAvailability('BOOKING_CLOSED', 40)).toBe('Booking closed')
  })
})

// D-112 criterion 4: the listing shows "booking closed" the moment the window passes, so the
// response may not be cached past the earliest window it describes.
describe('the listing cache ends at the next thing that changes it (D-112 criterion 4)', () => {
  const morning = new Date(CURTAIN.getTime() - 6 * 3600 * 1000)

  test('with nothing on, the cache runs its full lifetime', () => {
    expect(listingCacheSeconds([], morning)).toBe(LISTED_CACHE_MAX_SECONDS)
  })

  test('a boundary further off than the lifetime does not extend it', () => {
    const far = seconds(morning) + LISTED_CACHE_MAX_SECONDS * 10
    expect(listingCacheSeconds([far], morning)).toBe(LISTED_CACHE_MAX_SECONDS)
  })

  test('a boundary inside the lifetime shortens the cache to it', () => {
    const soon = seconds(morning) + 42
    expect(listingCacheSeconds([soon], morning)).toBe(42)
  })

  test('the earliest boundary wins, whatever order they arrive in', () => {
    const at = seconds(morning)
    expect(listingCacheSeconds([at + 300, at + 12, at + 90], morning)).toBe(12)
  })

  // A window that has already closed says "booking closed" and will go on saying it, so it does
  // not shorten anything: only a boundary still ahead can change an answer.
  test('a boundary already passed constrains nothing', () => {
    const at = seconds(morning)
    expect(listingCacheSeconds([at - 500], morning)).toBe(LISTED_CACHE_MAX_SECONDS)
    expect(listingCacheSeconds([at], morning)).toBe(LISTED_CACHE_MAX_SECONDS)
    expect(listingCacheSeconds([at - 500, at + 30], morning)).toBe(30)
  })
})

// D-101 criterion 4: the price a visitor is quoted is the resolved chain, and D-120 administers
// the two override levels this reads.
describe('a price resolves performance, then show, then the type (D-101 criterion 4, D-120)', () => {
  const base = { price: 900, activeByDefault: true }

  test('with no override, the type\'s own price stands', () => {
    expect(resolvePrice(base, null, null)).toEqual({ price: 900, source: 'BASE', active: true })
  })

  test('a show override displaces the base price', () => {
    expect(resolvePrice(base, { price: 700, active: null }, null)).toEqual({ price: 700, source: 'SHOW', active: true })
  })

  test('a performance override displaces the show override', () => {
    expect(resolvePrice(base, { price: 700, active: null }, { price: 500, active: null }))
      .toEqual({ price: 500, source: 'PERFORMANCE', active: true })
  })

  // Null means inherit at both levels, so a free ticket has to be spelled as nought rather than
  // read as an absence (D-120 criterion 1).
  test('an explicit nought is a price, not an absence', () => {
    expect(resolvePrice(base, { price: 0, active: null }, null)).toEqual({ price: 0, source: 'SHOW', active: true })
  })

  test('a null price at the performance falls through to the show for the price alone', () => {
    expect(resolvePrice(base, { price: 700, active: null }, { price: null, active: false }))
      .toEqual({ price: 700, source: 'SHOW', active: false })
  })

  test('active resolves down the same chain, and false at either level switches the type off', () => {
    expect(resolvePrice(base, { price: null, active: false }, null).active).toBe(false)
    expect(resolvePrice(base, { price: null, active: false }, { price: null, active: true }).active).toBe(true)
    expect(resolvePrice({ price: 900, activeByDefault: false }, null, null).active).toBe(false)
  })
})
