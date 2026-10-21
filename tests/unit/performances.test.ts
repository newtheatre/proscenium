import { describe, expect, test } from 'bun:test'
import { fromLondonWallClock } from '#shared/utils/london'
import { capacityOverrideRefusal, performanceCancelForm, runningTimeRefusal, saleRefusal } from '#shared/utils/programme'
import { showNightBounds } from '#shared/utils/show-night'
import { effectiveCapacity, isOnSale, performanceNight } from '#server/utils/performances'
import type { PerformanceSaleState } from '#shared/utils/programme'

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
    showBookingClosesHoursBefore: null,
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

  test('an unstated window at both levels means curtain-up, as does an explicit nought', () => {
    const at = new Date(curtain.getTime() - 60_000)
    expect(isOnSale(performance({ bookingClosesHoursBefore: null }), at)).toBe(true)
    expect(isOnSale(performance({ bookingClosesHoursBefore: 0 }), at)).toBe(true)
    expect(isOnSale(performance({ bookingClosesHoursBefore: 0 }), curtain)).toBe(false)
  })

  // One answer to one question: the boolean is the refusal with its reason dropped, so a path
  // that only needs a yes or no cannot drift from the one that quotes the reason.
  test('the predicate is the refusal, so the two can never disagree', () => {
    const cases: PerformanceSaleState[] = [
      performance(),
      performance({ status: 'CANCELLED' }),
      performance({ showStatus: 'DRAFT' }),
      performance({ externalBookingUrl: 'https://example.invalid/tickets' }),
      performance({ showBookingClosesHoursBefore: 2 }),
    ]
    const at = new Date(curtain.getTime() - 3_600_000)
    for (const one of cases) expect(isOnSale(one, at)).toBe(saleRefusal(one, at) === null)
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

// 0124: selling above the venue's house is deliberate oversell (D-105 criterion 4), never a slip.
describe('a performance above its venue is confirmed, not typed (0124)', () => {
  const house = { name: 'The Studio', capacity: 120 }

  test('an override above the venue is refused, quoting both figures and the venue', () => {
    const refusal = capacityOverrideRefusal(house, 10_000)
    expect(refusal).toContain('120')
    expect(refusal).toContain('10000')
    expect(refusal).toContain('The Studio')
  })

  test('an override at or below the venue, a closed house of nought, and no override at all are taken', () => {
    expect(capacityOverrideRefusal(house, 120)).toBeNull()
    expect(capacityOverrideRefusal(house, 80)).toBeNull()
    expect(capacityOverrideRefusal(house, 0)).toBeNull()
    expect(capacityOverrideRefusal(house, null)).toBeNull()
    expect(capacityOverrideRefusal(house, undefined)).toBeNull()
  })

  test('the officer\'s say-so lets a deliberate oversell through', () => {
    expect(capacityOverrideRefusal(house, 130, true)).toBeNull()
  })

  test('a venue with no capacity set caps nothing', () => {
    expect(capacityOverrideRefusal({ name: 'The Corn Exchange', capacity: null }, 400)).toBeNull()
  })
})

// A shift's window ends from the running time, so a performance at a venue we run without one
// strands every volunteer at curtain plus the offset (D-121 criterion 6, 0078).
describe('a performance at a venue we run carries its running time (D-121 criterion 6)', () => {
  const house = { name: 'The Studio', isExternal: false }
  const elsewhere = { name: 'The Corn Exchange', isExternal: true }

  test('one of ours with no running time is refused, naming the venue and why', () => {
    const refusal = runningTimeRefusal(house, null)
    expect(refusal).toContain('The Studio')
    expect(refusal).toContain('running time')
    expect(refusal).toContain('shift')
    expect(runningTimeRefusal(house, undefined)).toBe(refusal)
  })

  test('one of ours with a running time, any external venue, and a cancelled performance are taken', () => {
    expect(runningTimeRefusal(house, 120)).toBeNull()
    expect(runningTimeRefusal(elsewhere, null)).toBeNull()
    expect(runningTimeRefusal(elsewhere, 90)).toBeNull()
    expect(runningTimeRefusal(house, null, 'CANCELLED')).toBeNull()
  })
})

// D-121 criterion 5: the reason is optional, goes only to the holders, and an empty body still cancels.
describe('cancelling a performance takes an optional reason', () => {
  test('no body, an empty body and a blank reason all cancel with no reason', () => {
    expect(performanceCancelForm.parse(undefined)).toEqual({ reason: null })
    expect(performanceCancelForm.parse({})).toEqual({ reason: null })
    expect(performanceCancelForm.parse({ reason: '   ' })).toEqual({ reason: null })
  })

  test('a reason is trimmed, and one too long to read in an email is refused', () => {
    expect(performanceCancelForm.parse({ reason: '  The lead is unwell ' })).toEqual({ reason: 'The lead is unwell' })
    expect(performanceCancelForm.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false)
  })
})
