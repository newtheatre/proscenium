import { describe, expect, test } from 'bun:test'
import { fromLondonWallClock } from '#shared/utils/london'
import {
  bookingClosesAt,
  bookingWindowSource,
  isPublicPerformance,
  performanceClosesAt,
  performanceForm,
  performanceScreenForm,
  publicPerformance,
  publicShow,
  resolveBookingClosesHours,
  saleRefusal,
  saysBookingWindow,
  saysClosingTime,
  showForm,
  toSlug,
} from '#shared/utils/programme'
import type { PerformanceSaleState, PublicShow, ShowStatus } from '#shared/utils/programme'

// The publish flow and the booking window as pure rules (D-121, D-112). What the database enforces
// is in tests/integration/programme-admin.test.ts; nothing is asserted twice.

const seconds = (at: Date): number => Math.floor(at.getTime() / 1000)

const CURTAIN = fromLondonWallClock(2026, 10, 17, 19, 30)

const drafted = (over: Partial<PublicShow & { status: ShowStatus }> = {}): PublicShow & { status: ShowStatus } => ({
  status: 'DRAFT',
  slug: 'the-seagull',
  title: 'The Seagull',
  subtitle: null,
  description: 'A comedy in four acts.',
  longDescription: null,
  ageGuidance: '12+',
  latecomerPolicy: 'AT_INTERVAL',
  ...over,
})

describe('a show is draft until it is published, and a draft is invisible (D-121 criterion 1)', () => {
  test('a draft show has no public payload at all', () => {
    expect(publicShow(drafted())).toBeNull()
  })

  test('a published show projects its copy, age guidance and latecomer policy', () => {
    expect(publicShow(drafted({ status: 'PUBLISHED' }))).toEqual({
      slug: 'the-seagull',
      title: 'The Seagull',
      subtitle: null,
      description: 'A comedy in four acts.',
      longDescription: null,
      ageGuidance: '12+',
      latecomerPolicy: 'AT_INTERVAL',
    })
  })

  // An allow-list is what stops a column added later leaking by default, so the projection is
  // asserted by what it does not carry as well as by what it does.
  test('no internal column reaches the public payload', () => {
    const projected = publicShow({
      ...drafted({ status: 'PUBLISHED' }),
      ...{ contentNotes: 'the director is nervous', productionId: 'b-1', status: 'PUBLISHED' },
    } as PublicShow & { status: ShowStatus })
    expect(Object.keys(projected ?? {}).sort()).toEqual([
      'ageGuidance', 'description', 'latecomerPolicy', 'longDescription', 'slug', 'subtitle', 'title',
    ])
  })

  test('a draft performance is nobody\'s business, and a cancelled one is still told', () => {
    expect(isPublicPerformance({ status: 'DRAFT' })).toBe(false)
    expect(isPublicPerformance({ status: 'ON_SALE' })).toBe(true)
    expect(isPublicPerformance({ status: 'CANCELLED' })).toBe(true)
  })

  // The listing gets the closing moment, never the offset, so no consumer reimplements the
  // inheritance and none of them can disagree about it.
  test('a public performance carries its resolved closing moment and no internal column', () => {
    const performance = {
      id: 'p1',
      status: 'ON_SALE' as const,
      showStatus: 'PUBLISHED' as const,
      startsAt: seconds(CURTAIN),
      bookingClosesHoursBefore: null,
      showBookingClosesHoursBefore: 2,
      externalBookingUrl: null,
      venueName: 'The Nottingham New Theatre',
      doorsAt: seconds(CURTAIN) - 1800,
      durationMinutes: 120,
      intervalCount: 1,
    }
    const projected = publicPerformance({ ...performance, ...{ notes: 'the fog machine leaks' } })
    expect(projected?.bookingClosesAt).toBe(seconds(CURTAIN) - 7200)
    expect(Object.keys(projected ?? {}).sort()).toEqual([
      'bookingClosesAt', 'cancelled', 'doorsAt', 'durationMinutes', 'externalBookingUrl',
      'id', 'intervalCount', 'intervalMinutes', 'startsAt', 'venueName',
    ])

    expect(publicPerformance({ ...performance, status: 'DRAFT' })).toBeNull()
    expect(publicPerformance({ ...performance, status: 'CANCELLED' })?.cancelled).toBe(true)
  })

  test('a slug is lowercase words joined by hyphens, and the form refuses anything else', () => {
    expect(toSlug('The Seagull: Act II')).toBe('the-seagull-act-ii')
    const base = { title: 'The Seagull' }
    expect(showForm.safeParse({ ...base, slug: 'the-seagull' }).success).toBe(true)
    expect(showForm.safeParse({ ...base, slug: 'The Seagull' }).success).toBe(false)
    expect(showForm.safeParse({ ...base, slug: 'the--seagull' }).success).toBe(false)
  })
})

describe('the booking window inherits performance, then show, then curtain-up (D-112 criterion 1)', () => {
  test('a performance with no window of its own takes the show default', () => {
    expect(resolveBookingClosesHours({ bookingClosesHoursBefore: null }, { bookingClosesHoursBefore: 2 })).toBe(2)
    expect(bookingWindowSource({ bookingClosesHoursBefore: null }, { bookingClosesHoursBefore: 2 })).toBe('show')
  })

  test('a performance window overrides the show default', () => {
    expect(resolveBookingClosesHours({ bookingClosesHoursBefore: 4 }, { bookingClosesHoursBefore: 2 })).toBe(4)
    expect(bookingWindowSource({ bookingClosesHoursBefore: 4 }, { bookingClosesHoursBefore: 2 })).toBe('performance')
  })

  // The trap the price overrides taught: nought is a level saying curtain-up, not an absent value,
  // so a performance set to nought must not fall back to a show default of two hours (D-120).
  test('an explicit nought is an override and never an absence', () => {
    expect(resolveBookingClosesHours({ bookingClosesHoursBefore: 0 }, { bookingClosesHoursBefore: 2 })).toBe(0)
    expect(bookingWindowSource({ bookingClosesHoursBefore: 0 }, { bookingClosesHoursBefore: 2 })).toBe('performance')
  })

  test('neither level stating a window means curtain-up', () => {
    expect(resolveBookingClosesHours({ bookingClosesHoursBefore: null }, { bookingClosesHoursBefore: null })).toBe(0)
    expect(bookingWindowSource({ bookingClosesHoursBefore: null }, { bookingClosesHoursBefore: null })).toBe('curtain-up')
    expect(saysBookingWindow(0)).toBe('Closes at curtain-up')
    expect(saysBookingWindow(1)).toBe('Closes 1 hour before curtain')
    expect(saysBookingWindow(3)).toBe('Closes 3 hours before curtain')
  })

  // Measured back from the curtain instant, so the clocks going back do not move the window
  // relative to the performance it belongs to (0014).
  test('the closing moment is an offset from curtain, not a wall clock', () => {
    const inBst = seconds(fromLondonWallClock(2026, 10, 24, 19, 30))
    const inGmt = seconds(fromLondonWallClock(2026, 10, 31, 19, 30))
    expect(bookingClosesAt(inBst, 2)).toBe(inBst - 7200)
    expect(bookingClosesAt(inGmt, 2)).toBe(inGmt - 7200)
  })

  test('a window longer than a month is a typed mistake and is refused', () => {
    const base = { venueId: 'v1', startsAt: seconds(CURTAIN) }
    expect(performanceForm.safeParse({ ...base, bookingClosesHoursBefore: 720 }).success).toBe(true)
    expect(performanceForm.safeParse({ ...base, bookingClosesHoursBefore: 721 }).success).toBe(false)
    expect(performanceForm.safeParse({ ...base, bookingClosesHoursBefore: -1 }).success).toBe(false)
  })

  // The screen holds a day and two wall clocks; the request holds instants. Validating the state
  // against the request schema fails on every field, and a form that never submits says nothing.
  test('the screen schema takes what the screen holds, which the request schema does not', () => {
    const state = {
      venueId: 'venue-a',
      day: '2026-10-17',
      clock: '19:30',
      doorsClock: '',
      durationMinutes: null,
      intervalCount: 0,
      intervalMinutes: null,
      capacityOverride: null,
      bookingClosesHoursBefore: null,
      notes: '',
    }
    expect(performanceScreenForm.safeParse(state).success).toBe(true)
    expect(performanceForm.safeParse(state).success).toBe(false)

    expect(performanceScreenForm.safeParse({ ...state, day: '' }).success).toBe(false)
    expect(performanceScreenForm.safeParse({ ...state, clock: '7pm' }).success).toBe(false)
    expect(performanceScreenForm.safeParse({ ...state, doorsClock: '19:00' }).success).toBe(true)
    expect(performanceScreenForm.safeParse({ ...state, doorsClock: '24:00' }).success).toBe(false)
  })

  test('doors open before curtain, never after it', () => {
    const base = { venueId: 'v1', startsAt: seconds(CURTAIN) }
    expect(performanceForm.safeParse({ ...base, doorsAt: seconds(CURTAIN) - 1800 }).success).toBe(true)
    expect(performanceForm.safeParse({ ...base, doorsAt: seconds(CURTAIN) + 1800 }).success).toBe(false)
  })
})

describe('an external booking URL is a URL or nothing (D-122)', () => {
  const base = { venueId: 'v1', startsAt: seconds(CURTAIN) }

  test('a real URL is accepted', () => {
    expect(performanceForm.safeParse({ ...base, externalBookingUrl: 'https://tickets.example.org/seagull' }).success)
      .toBe(true)
  })

  test('leaving it out, sending null, or a blank field, all mean no external link', () => {
    expect(performanceForm.safeParse(base).success).toBe(true)
    expect(performanceForm.safeParse({ ...base, externalBookingUrl: null }).success).toBe(true)
    // The screen's untouched state is an empty string, and the same schema validates it
    // directly (the modal binds `performanceScreenForm` to that state, not to the request body).
    expect(performanceScreenForm.safeParse({
      venueId: 'v1', day: '2026-10-17', clock: '19:30', doorsClock: '', externalBookingUrl: '',
    }).success).toBe(true)
  })

  test('text that is not a URL is refused', () => {
    expect(performanceForm.safeParse({ ...base, externalBookingUrl: 'the box office' }).success).toBe(false)
  })
})

describe('a closed window refuses quoting the time it closed (D-112 criterion 2)', () => {
  const performance = (over: Partial<PerformanceSaleState> = {}): PerformanceSaleState => ({
    status: 'ON_SALE',
    showStatus: 'PUBLISHED',
    startsAt: seconds(CURTAIN),
    bookingClosesHoursBefore: null,
    showBookingClosesHoursBefore: null,
    externalBookingUrl: null,
    ...over,
  })

  test('the window resolves through the show before it is applied', () => {
    const inherited = performance({ showBookingClosesHoursBefore: 2 })
    expect(performanceClosesAt(inherited)).toBe(seconds(CURTAIN) - 7200)
    expect(saleRefusal(inherited, new Date(CURTAIN.getTime() - 2.5 * 3_600_000))).toBeNull()
    expect(saleRefusal(inherited, new Date(CURTAIN.getTime() - 1.5 * 3_600_000))?.reason).toBe('WINDOW_CLOSED')
  })

  // The Worker runs in UTC, so an unpinned time would tell a booker in October that booking
  // closed an hour earlier than it did (0014).
  test('the refusal quotes the closing time in Europe/London and points at the door', () => {
    const closes = performance({ bookingClosesHoursBefore: 2 })
    const refused = saleRefusal(closes, CURTAIN)
    expect(refused?.reason).toBe('WINDOW_CLOSED')
    expect(refused?.closedAt).toBe(seconds(CURTAIN) - 7200)
    expect(refused?.says).toContain('17:30')
    expect(refused?.says).toContain('Saturday, 17 October 2026')
    expect(refused?.says).toContain('on the door')
    expect(saysClosingTime(seconds(CURTAIN))).toContain('19:30')
  })

  test('the boundary itself is closed, so a window is exclusive of its own moment', () => {
    const closes = performance({ bookingClosesHoursBefore: 2 })
    const closedAt = new Date((seconds(CURTAIN) - 7200) * 1000)
    expect(saleRefusal(closes, new Date(closedAt.getTime() - 1000))).toBeNull()
    expect(saleRefusal(closes, closedAt)?.reason).toBe('WINDOW_CLOSED')
  })

  test('every other refusal names its own reason rather than the window', () => {
    const early = new Date(CURTAIN.getTime() - 86_400_000)
    expect(saleRefusal(performance({ showStatus: 'DRAFT' }), early)?.reason).toBe('SHOW_UNPUBLISHED')
    expect(saleRefusal(performance({ status: 'DRAFT' }), early)?.reason).toBe('NOT_ON_SALE')
    expect(saleRefusal(performance({ status: 'CANCELLED' }), early)?.reason).toBe('CANCELLED')
    const external = saleRefusal(performance({ externalBookingUrl: 'https://example.org/tickets' }), early)
    expect(external?.reason).toBe('EXTERNAL')
    expect(external?.externalBookingUrl).toBe('https://example.org/tickets')
  })

  // A cancelled performance of an unpublished show is cancelled first: that is the fact the
  // customer needs, and the unpublished show is the operator's business.
  test('a cancellation is stated ahead of the show being unpublished', () => {
    const both = performance({ status: 'CANCELLED', showStatus: 'DRAFT' })
    expect(saleRefusal(both, new Date(CURTAIN.getTime() - 86_400_000))?.reason).toBe('CANCELLED')
  })
})

describe('the desk bypasses the customer window and nothing else (D-112 criterion 3)', () => {
  const performance = (over: Partial<PerformanceSaleState> = {}): PerformanceSaleState => ({
    status: 'ON_SALE',
    showStatus: 'PUBLISHED',
    startsAt: seconds(CURTAIN),
    bookingClosesHoursBefore: 2,
    showBookingClosesHoursBefore: null,
    externalBookingUrl: null,
    ...over,
  })

  test('the desk may sell after the window has closed', () => {
    expect(saleRefusal(performance(), CURTAIN, 'CUSTOMER')?.reason).toBe('WINDOW_CLOSED')
    expect(saleRefusal(performance(), CURTAIN, 'DESK')).toBeNull()
  })

  test('the desk still refuses a cancelled, unpublished or externally ticketed performance', () => {
    expect(saleRefusal(performance({ status: 'CANCELLED' }), CURTAIN, 'DESK')?.reason).toBe('CANCELLED')
    expect(saleRefusal(performance({ showStatus: 'DRAFT' }), CURTAIN, 'DESK')?.reason).toBe('SHOW_UNPUBLISHED')
    expect(saleRefusal(performance({ externalBookingUrl: 'https://example.org' }), CURTAIN, 'DESK')?.reason).toBe('EXTERNAL')
  })
})
