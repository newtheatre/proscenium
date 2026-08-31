import { describe, expect, test } from 'bun:test'
import { REFUSALS, judge, resolvePolicy, spanMinutes } from '#shared/utils/booking-policy'
import type { EstatePolicy, Proposal } from '#shared/utils/booking-policy'

// C-106. The published policy and the enforced policy are the same document, and every rule has a
// distinct named refusal a member can act on (criterion 6).

const ESTATE = {
  minBookingMinutes: 30,
  maxBookingHours: 4,
  noticeHours: 48,
  horizonWeeks: 12,
  activeBookingsCap: 10,
  maxBookingAdminsExempt: true,
}

const ROOM = {
  isActive: true,
  sensitive: false,
  hours: [{ weekday: 1, opens: '09:00', closes: '22:00' }],
  minBookingMinutes: null,
  maxBookingHours: null,
  noticeHours: null,
  horizonWeeks: null,
  activeBookingsCap: null,
}

// Monday 14 September 2026, 10:00 to 12:00 London. Well inside every rule.
const NOW = new Date('2026-09-01T09:00:00Z')
const GOOD: Proposal = {
  startsAt: new Date('2026-09-14T09:00:00Z'),
  endsAt: new Date('2026-09-14T11:00:00Z'),
}

const CONTEXT = { now: NOW, isAdmin: false, hasMembership: true, activeBookings: 0 }

const policy = (over: Partial<EstatePolicy> = {}): EstatePolicy => ({ ...ESTATE, ...over })
const reasons = (verdict: { failures: { reason: string }[] }): string[] =>
  verdict.failures.map(failure => failure.reason)

describe('a booking inside every rule passes', () => {
  test('nothing fails and nothing needs approving', () => {
    const verdict = judge(GOOD, policy(), ROOM, CONTEXT)
    expect(verdict.failures).toEqual([])
    expect(verdict.needsApproval).toBe(false)
  })

  test('every refusal the engine can give has a sentence somebody can act on', () => {
    for (const reason of REFUSALS) {
      expect(`${reason}: ${reason.length > 3}`).toBe(`${reason}: true`)
    }
  })
})

describe('each rule refuses in its own name (criterion 6)', () => {
  test('a booking wholly in the past', () => {
    const past = { startsAt: new Date('2026-08-01T09:00:00Z'), endsAt: new Date('2026-08-01T11:00:00Z') }
    expect(reasons(judge(past, policy(), ROOM, CONTEXT))).toContain('IN_THE_PAST')
  })

  test('a retired room', () => {
    expect(reasons(judge(GOOD, policy(), { ...ROOM, isActive: false }, CONTEXT))).toContain('ROOM_RETIRED')
  })

  test('a weekday the room never opens', () => {
    const tuesday = { startsAt: new Date('2026-09-15T09:00:00Z'), endsAt: new Date('2026-09-15T11:00:00Z') }
    expect(reasons(judge(tuesday, policy(), ROOM, CONTEXT))).toContain('ROOM_CLOSED')
  })

  test('a span reaching past closing time', () => {
    const late = { startsAt: new Date('2026-09-14T20:00:00Z'), endsAt: new Date('2026-09-14T22:00:00Z') }
    expect(reasons(judge(late, policy(), ROOM, CONTEXT))).toContain('OUT_OF_HOURS')
  })

  test('a span shorter than the minimum', () => {
    const brief = { startsAt: new Date('2026-09-14T09:00:00Z'), endsAt: new Date('2026-09-14T09:15:00Z') }
    expect(reasons(judge(brief, policy(), ROOM, CONTEXT))).toContain('TOO_SHORT')
  })

  test('a span longer than the maximum', () => {
    const long = { startsAt: new Date('2026-09-14T08:00:00Z'), endsAt: new Date('2026-09-14T18:00:00Z') }
    expect(reasons(judge(long, policy(), ROOM, CONTEXT))).toContain('TOO_LONG')
  })

  test('less notice than the window asks for', () => {
    const soon = { startsAt: new Date('2026-09-01T14:00:00Z'), endsAt: new Date('2026-09-01T16:00:00Z') }
    expect(reasons(judge(soon, policy(), ROOM, CONTEXT))).toContain('SHORT_NOTICE')
  })

  test('further ahead than the horizon', () => {
    const distant = { startsAt: new Date('2027-06-14T09:00:00Z'), endsAt: new Date('2027-06-14T11:00:00Z') }
    expect(reasons(judge(distant, policy(), ROOM, CONTEXT))).toContain('BEYOND_HORIZON')
  })

  test('more bookings already held than the cap allows', () => {
    expect(reasons(judge(GOOD, policy(), ROOM, { ...CONTEXT, activeBookings: 10 }))).toContain('OVER_CAP')
  })

  test('a lapsed membership, named as the reason (C-105 criterion 2)', () => {
    expect(reasons(judge(GOOD, policy(), ROOM, { ...CONTEXT, hasMembership: false }))).toContain('NO_MEMBERSHIP')
  })

  test('two broken rules are both named, not just the first', () => {
    const bad = { startsAt: new Date('2026-09-15T23:00:00Z'), endsAt: new Date('2026-09-15T23:10:00Z') }
    const named = reasons(judge(bad, policy(), ROOM, CONTEXT))
    expect(named).toContain('ROOM_CLOSED')
    expect(named).toContain('TOO_SHORT')
  })
})

describe('who the rules bend for', () => {
  test('an administrator may book past the maximum when the setting allows it', () => {
    const long = { startsAt: new Date('2026-09-14T08:00:00Z'), endsAt: new Date('2026-09-14T18:00:00Z') }
    expect(reasons(judge(long, policy(), ROOM, { ...CONTEXT, isAdmin: true }))).not.toContain('TOO_LONG')
  })

  test('and may not when it does not', () => {
    const long = { startsAt: new Date('2026-09-14T08:00:00Z'), endsAt: new Date('2026-09-14T18:00:00Z') }
    const strict = policy({ maxBookingAdminsExempt: false })
    expect(reasons(judge(long, strict, ROOM, { ...CONTEXT, isAdmin: true }))).toContain('TOO_LONG')
  })

  test('the exemption lifts the length rule and nothing else', () => {
    const shortNotice = { startsAt: new Date('2026-09-01T14:00:00Z'), endsAt: new Date('2026-09-01T16:00:00Z') }
    expect(reasons(judge(shortNotice, policy(), ROOM, { ...CONTEXT, isAdmin: true }))).toContain('SHORT_NOTICE')
  })
})

// C-105 criterion 5: a sensitive room queues even when nothing is wrong, which is why the engine
// returns a verdict rather than a yes or no.
describe('a sensitive room always goes to a person', () => {
  test('it needs approval with no failure at all', () => {
    const verdict = judge(GOOD, policy(), { ...ROOM, sensitive: true }, CONTEXT)
    expect(verdict.failures).toEqual([])
    expect(verdict.needsApproval).toBe(true)
  })

  test('anything that fails a rule needs approval too, rather than being refused outright', () => {
    const soon = { startsAt: new Date('2026-09-01T14:00:00Z'), endsAt: new Date('2026-09-01T16:00:00Z') }
    expect(judge(soon, policy(), ROOM, CONTEXT).needsApproval).toBe(true)
  })

  // A lapsed membership is not a thing an approver can wave through, so it is not divertible.
  test('a lapsed membership is a refusal, not a request', () => {
    const verdict = judge(GOOD, policy(), ROOM, { ...CONTEXT, hasMembership: false })
    expect(verdict.needsApproval).toBe(false)
    expect(verdict.refusedOutright).toBe(true)
  })
})

// Criterion 1: per room, or estate-wide with a per-room override.
describe('a room may override the estate', () => {
  test('its own maximum is what applies', () => {
    const room = { ...ROOM, maxBookingHours: 12 }
    const long = { startsAt: new Date('2026-09-14T08:00:00Z'), endsAt: new Date('2026-09-14T18:00:00Z') }
    expect(reasons(judge(long, resolvePolicy(room, ESTATE), room, CONTEXT))).not.toContain('TOO_LONG')
  })

  test('a room with no override falls back to the estate value', () => {
    expect(resolvePolicy(ROOM, ESTATE).maxBookingHours).toBe(4)
    expect(resolvePolicy({ ...ROOM, maxBookingHours: 2 }, ESTATE).maxBookingHours).toBe(2)
  })

  test('the resolution says where each number came from, so a screen can too', () => {
    const resolved = resolvePolicy({ ...ROOM, noticeHours: 0 }, ESTATE)
    expect(resolved.from.noticeHours).toBe('room')
    expect(resolved.from.horizonWeeks).toBe('estate')
  })

  // Zero is a real override meaning no notice needed, and must not read as absent.
  test('an override of nought is an override', () => {
    expect(resolvePolicy({ ...ROOM, noticeHours: 0 }, ESTATE).noticeHours).toBe(0)
  })
})

describe('a span is measured in London, not in milliseconds', () => {
  test('two hours is two hours', () => {
    expect(spanMinutes(GOOD.startsAt, GOOD.endsAt)).toBe(120)
  })

  // 2026-10-25: the clocks go back, so 01:00 to 02:00 London is two hours of wall clock.
  test('an hour that happens twice is counted once for each time it happens', () => {
    const across = { startsAt: new Date('2026-10-25T00:00:00Z'), endsAt: new Date('2026-10-25T02:00:00Z') }
    expect(spanMinutes(across.startsAt, across.endsAt)).toBe(120)
  })

  test('a booking on the evening of a spring transition lands on the right London day', () => {
    // 2026-03-29 is the spring transition; 22:00 UTC is 23:00 London, still the 29th.
    const evening = { startsAt: new Date('2026-03-29T21:00:00Z'), endsAt: new Date('2026-03-29T22:00:00Z') }
    expect(judge(evening, policy(), { ...ROOM, hours: [{ weekday: 0, opens: '09:00', closes: '23:59' }] }, CONTEXT)
      .failures.map(failure => failure.reason)).not.toContain('ROOM_CLOSED')
  })
})
