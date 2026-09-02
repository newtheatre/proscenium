import { describe, expect, test } from 'bun:test'
import { prerequisiteGaps, saysGaps } from '#shared/utils/training'
import {
  blockingGaps,
  bySignUpOrder,
  configuredCloseAt,
  placesFrom,
  promotionClaimFor,
  saysPlace,
  sessionDayStarts,
  signUpClosure,
  warningGaps,
} from '#shared/utils/training-signup'
import type { SignUpOrder, SignUpWindow } from '#shared/utils/training-signup'

// The derivation, on its own, with no database in the way. A place is sign-up order against
// capacity and nothing else, which is the whole of why no column holds one (G-105).

let written = 0
const at = (id: string, signedUpAt: number, seq = ++written): SignUpOrder =>
  ({ id, userId: `u-${id}`, signedUpAt, seq })

describe('a place is derived from the order (G-105 criterion 1)', () => {
  test('the first `capacity` signed up hold places, and the rest are waiting in order', () => {
    const places = placesFrom([at('a', 10), at('b', 20), at('c', 30), at('d', 40)], 2)

    expect(places.map(place => place.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(places.map(place => place.placed)).toEqual([true, true, false, false])
    expect(places.map(place => place.waitlistPosition)).toEqual([null, null, 1, 2])
  })

  test('the order the query returns them in makes no difference to the answer', () => {
    const rows = [at('a', 10, 1), at('b', 20, 2), at('c', 30, 3)]
    expect(placesFrom([...rows].reverse(), 1)).toEqual(placesFrom(rows, 1))
  })

  test('a capacity nobody has reached leaves everybody placed', () => {
    expect(placesFrom([at('a', 10)], 20).every(place => place.placed)).toBe(true)
  })

  // Four people inside one second is ordinary, and the last place goes to whoever asked first.
  test('a tie inside one second falls back on the order the rows were written', () => {
    const places = placesFrom([at('z', 10, 2), at('a', 10, 1)], 1)
    expect(places.map(place => place.id)).toEqual(['a', 'z'])
    expect(places[0]!.placed).toBe(true)
    expect(places[1]!.placed).toBe(false)

    // Written second, so second, whatever the ids happen to sort as.
    const other = placesFrom([at('a', 10, 2), at('z', 10, 1)], 1)
    expect(other.map(place => place.id)).toEqual(['z', 'a'])
  })

  test('the comparator is what both the query and the derivation sort by', () => {
    expect(bySignUpOrder(at('a', 10, 1), at('b', 20, 2))).toBeLessThan(0)
    expect(bySignUpOrder(at('b', 20, 2), at('a', 10, 1))).toBeGreaterThan(0)
    expect(bySignUpOrder(at('a', 10, 1), at('b', 10, 2))).toBeLessThan(0)
    expect(bySignUpOrder(at('a', 10, 1), at('a', 10, 1))).toBe(0)
  })
})

describe('re-joining goes to the back (G-105 criterion 2)', () => {
  test('a later sign-up instant is a later place, whatever the row was before', () => {
    const before = placesFrom([at('a', 10, 1), at('b', 20, 2), at('c', 30, 3)], 2)
    expect(before.find(place => place.id === 'a')?.placed).toBe(true)

    // The same row, re-joined: it was written first and its instant has moved past both.
    const after = placesFrom([at('a', 40, 1), at('b', 20, 2), at('c', 30, 3)], 2)
    expect(after.map(place => place.id)).toEqual(['b', 'c', 'a'])
    expect(after.find(place => place.id === 'a')?.waitlistPosition).toBe(1)
  })
})

describe('the promotion claim (G-106 criterion 2)', () => {
  test('one claim per session, member and sign-up', () => {
    expect(promotionClaimFor('s1', 'u1', 100)).toBe('training.session.promoted:s1:u1:100')
  })

  test('a member who withdrew and re-joined can be promoted again', () => {
    expect(promotionClaimFor('s1', 'u1', 100)).not.toBe(promotionClaimFor('s1', 'u1', 200))
  })

  test('two members on one session never share a claim', () => {
    expect(promotionClaimFor('s1', 'u1', 100)).not.toBe(promotionClaimFor('s1', 'u2', 100))
  })
})

describe('sign-up closes at whichever comes first (G-105 criterion 5)', () => {
  const window: SignUpWindow = {
    heldOn: '2027-01-14',
    startsAt: '19:00',
    opensAt: null,
    status: 'OPEN',
    registerOpen: false,
  }

  const day = sessionDayStarts('2027-01-14')

  test('a session days away is open', () => {
    expect(signUpClosure(window, 24, new Date(day.getTime() - (5 * 86_400_000)))).toBeNull()
  })

  test('the configured close shuts it before the day arrives', () => {
    const closes = configuredCloseAt(window, 24)
    expect(signUpClosure(window, 24, new Date(closes.getTime() - 1000))).toBeNull()
    expect(signUpClosure(window, 24, closes)).toBe('CLOSE_TIME')
  })

  // Whichever is first: a close so short it falls inside the session day never reopens it.
  test('the day arriving shuts it however short the configured close is', () => {
    expect(signUpClosure(window, 1, new Date(day.getTime() + 1000))).toBe('SESSION_DAY')
  })

  test('the register opening shuts it before either date is reached', () => {
    const open = { ...window, registerOpen: true }
    expect(signUpClosure(open, 24, new Date(day.getTime() - (5 * 86_400_000)))).toBe('REGISTER_OPEN')
  })

  test('a session not yet visible to members takes no sign-ups', () => {
    const later = { ...window, opensAt: Math.floor(day.getTime() / 1000) - 3600 }
    expect(signUpClosure(later, 24, new Date(day.getTime() - (5 * 86_400_000)))).toBe('NOT_OPEN_YET')
  })

  test('a cancelled or delivered session takes none either', () => {
    const early = new Date(day.getTime() - (5 * 86_400_000))
    expect(signUpClosure({ ...window, status: 'CANCELLED' }, 24, early)).toBe('OFF')
    expect(signUpClosure({ ...window, status: 'DELIVERED' }, 24, early)).toBe('OFF')
  })

  // The wall clock is what a member turns up for, so the close counts back from it on either
  // side of a clock change (0014).
  test('the close counts back from the London wall clock, not from an offset', () => {
    const spring = configuredCloseAt({ ...window, heldOn: '2026-03-30' }, 2)
    expect(spring.toISOString()).toBe('2026-03-30T16:00:00.000Z')
    const winter = configuredCloseAt({ ...window, heldOn: '2026-03-28' }, 2)
    expect(winter.toISOString()).toBe('2026-03-28T17:00:00.000Z')
  })
})

describe('a prerequisite gap blocks or warns by the module it is on (criterion 3)', () => {
  const needed = [{ requiresId: 'TECH-100', requiresName: 'Ladder safety' }]
  const safety = { id: 'TECH-200', safetyCritical: true }
  const ordinary = { id: 'TECH-300', safetyCritical: false }

  // Sign-up reads the same rule the register and the retrospective log read (G-118 criterion 3).
  test('a safety-critical gap blocks and an ordinary one is acknowledged', () => {
    const gaps = [
      ...prerequisiteGaps(safety, needed, new Set()),
      ...prerequisiteGaps(ordinary, needed, new Set()),
    ]

    expect(blockingGaps(gaps).map(gap => gap.moduleId)).toEqual(['TECH-200'])
    expect(warningGaps(gaps).map(gap => gap.moduleId)).toEqual(['TECH-300'])
  })

  test('a safety-critical module whose prerequisites are held blocks nothing', () => {
    expect(blockingGaps(prerequisiteGaps(safety, needed, new Set(['TECH-100'])))).toEqual([])
  })

  test('the refusal names the modules, because "not eligible" is not an answer', () => {
    expect(saysGaps(prerequisiteGaps(safety, needed, new Set()))).toBe('TECH-100 Ladder safety')
  })
})

describe('what a member is told', () => {
  test('a place says so, and a wait says exactly where', () => {
    expect(saysPlace({ placed: true, waitlistPosition: null })).toBe('You have a place')
    expect(saysPlace({ placed: false, waitlistPosition: 3 })).toBe('You are 3 on the waiting list')
  })
})
