import { describe, expect, test } from 'bun:test'
import { fromLondonWallClock } from '#shared/utils/london'
import { showNightBounds } from '#shared/utils/show-night'
import { effectiveCapacity, isOnSale, performanceNight } from '#server/utils/performances'
import type { PerformanceSaleState } from '#server/utils/performances'

// The programme utilities every show-night and box-office screen reads a performance through
// (build-order contract d). The boundary itself is show-night.ts's; nothing here restates it.

const seconds = (at: Date): number => Math.floor(at.getTime() / 1000)

describe('performanceNight names the night a curtain belongs to (E-110, 0014)', () => {
  test('an evening performance belongs to its own London day', () => {
    expect(performanceNight(fromLondonWallClock(2026, 10, 17, 19, 30))).toBe('2026-10-17')
  })

  test('a curtain before 04:00 belongs to the night that began the London day before', () => {
    expect(performanceNight(fromLondonWallClock(2026, 10, 18, 1, 0))).toBe('2026-10-17')
    expect(performanceNight(fromLondonWallClock(2026, 10, 18, 3, 59))).toBe('2026-10-17')
    expect(performanceNight(fromLondonWallClock(2026, 10, 18, 4, 0))).toBe('2026-10-18')
  })

  test('a stored curtain is integer seconds, and reads the same as its instant', () => {
    const curtain = fromLondonWallClock(2026, 10, 17, 19, 30)
    expect(performanceNight(seconds(curtain))).toBe(performanceNight(curtain))
  })

  // The night the clocks go back is 25 hours long, and a 01:30 curtain inside it is ambiguous
  // by wall clock. Both readings of it are still the night that began the day before.
  test('a curtain inside the extra hour still belongs to the night that began before it', () => {
    const { from, to } = showNightBounds('2026-10-24')
    expect((to.getTime() - from.getTime()) / 3_600_000).toBe(25)
    expect(performanceNight(new Date(from.getTime() + 21 * 3_600_000))).toBe('2026-10-24')
    expect(performanceNight(new Date(to.getTime() - 1000))).toBe('2026-10-24')
    expect(performanceNight(to)).toBe('2026-10-25')
  })
})

describe('effectiveCapacity resolves the override, then the venue (D-105, 0006)', () => {
  test('no override takes the venue capacity', () => {
    expect(effectiveCapacity({ capacityOverride: null, venueCapacity: 120 })).toBe(120)
  })

  test('an override wins over the venue', () => {
    expect(effectiveCapacity({ capacityOverride: 80, venueCapacity: 120 })).toBe(80)
  })

  // The trap a truthiness test walks into: nought seats is a closed house, not an absent override.
  test('an override of nought is an override, not an absence', () => {
    expect(effectiveCapacity({ capacityOverride: 0, venueCapacity: 120 })).toBe(0)
  })

  test('an uncapped venue with no override is uncapped, which is null and never nought', () => {
    expect(effectiveCapacity({ capacityOverride: null, venueCapacity: null })).toBeNull()
  })

  test('an override caps an otherwise uncapped venue', () => {
    expect(effectiveCapacity({ capacityOverride: 40, venueCapacity: null })).toBe(40)
  })
})

describe('isOnSale is the one predicate the internal sales paths ask (D-112, D-121, D-122)', () => {
  const curtain = fromLondonWallClock(2026, 10, 17, 19, 30)

  const performance = (over: Partial<PerformanceSaleState> = {}): PerformanceSaleState => ({
    status: 'ON_SALE',
    showStatus: 'PUBLISHED',
    startsAt: seconds(curtain),
    bookingClosesHoursBefore: null,
    externalBookingUrl: null,
    ...over,
  })

  test('an on-sale performance of a published show sells until curtain-up', () => {
    expect(isOnSale(performance(), new Date(curtain.getTime() - 60_000))).toBe(true)
    expect(isOnSale(performance(), new Date(curtain.getTime() + 1000))).toBe(false)
  })

  test('a draft or cancelled performance never sells', () => {
    expect(isOnSale(performance({ status: 'DRAFT' }), curtain)).toBe(false)
    expect(isOnSale(performance({ status: 'CANCELLED' }), new Date(curtain.getTime() - 86_400_000))).toBe(false)
  })

  test('an unpublished show closes its performances however they are flagged (D-121 criterion 1)', () => {
    expect(isOnSale(performance({ showStatus: 'DRAFT' }), new Date(curtain.getTime() - 86_400_000))).toBe(false)
  })

  test('an externally ticketed performance refuses every internal path (D-122 criterion 1)', () => {
    const external = performance({ externalBookingUrl: 'https://example.invalid/tickets' })
    expect(isOnSale(external, new Date(curtain.getTime() - 86_400_000))).toBe(false)
  })

  test('the booking window closes the stated hours before curtain (D-112 criterion 2)', () => {
    const closes = performance({ bookingClosesHoursBefore: 2 })
    expect(isOnSale(closes, new Date(curtain.getTime() - 2.5 * 3_600_000))).toBe(true)
    expect(isOnSale(closes, new Date(curtain.getTime() - 1.5 * 3_600_000))).toBe(false)
  })

  test('null and nought both mean curtain-up, which is the same window', () => {
    const at = new Date(curtain.getTime() - 60_000)
    expect(isOnSale(performance({ bookingClosesHoursBefore: null }), at)).toBe(true)
    expect(isOnSale(performance({ bookingClosesHoursBefore: 0 }), at)).toBe(true)
    expect(isOnSale(performance({ bookingClosesHoursBefore: 0 }), curtain)).toBe(false)
  })
})

// The show-night boundary has one definition (E-110). This is the same rule for the programme:
// a performance's night comes from that file, and nothing here recomputes 04:00.
describe('the programme utilities derive the night rather than restating it', () => {
  test('performances.ts calls showNightOf and holds no boundary of its own', async () => {
    const source = await Bun.file('server/utils/performances.ts').text()
    expect(source).toContain('showNightOf')
    expect(/hour\s*[<>]=?\s*4\b/.test(source)).toBe(false)
    expect(source).not.toContain('SHOW_NIGHT_START_HOUR =')
  })
})
