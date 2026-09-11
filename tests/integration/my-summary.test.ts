import { describe, expect, test } from 'bun:test'
import { assembleMySummary } from '#server/utils/my-summary'
import type { MySummaryInputs } from '#server/utils/my-summary'

// The tile grid's one allow-list (K-127 criterion 1, A-129 criterion 2): every field named here
// is column-shaped, and a lapsed member is given every tile rather than a blank page.

const BASE: MySummaryInputs = {
  now: new Date('2026-09-15T12:00:00Z'),
  viewerId: 'u1',
  shift: null,
  membershipTerm: { startsOn: '2025-09-01', expiresOn: '2026-07-31' },
  membershipGraceDays: 30,
  claim: null,
  room: null,
  trainingHeld: 3,
  trainingAvailable: 7,
  nextStep: { id: 'TECH-100', name: 'Working at height' },
  nextSession: null,
  passes: [],
  passRequest: null,
  notifications: [],
  nextShow: null,
}

describe('assembleMySummary (K-127 criterion 1)', () => {
  test('a lapsed member is given every tile, not fewer', () => {
    const summary = assembleMySummary({ ...BASE, membershipTerm: { startsOn: '2024-09-01', expiresOn: '2025-07-31' } })
    expect(summary.membership.state).toBe('lapsed')
    expect(summary.membership.until).toBeNull()
    expect(summary).toHaveProperty('shift')
    expect(summary).toHaveProperty('room')
    expect(summary).toHaveProperty('training')
    expect(summary).toHaveProperty('passes')
    expect(summary).toHaveProperty('notifications')
    expect(summary).toHaveProperty('nextShow')
    expect(summary.training.held).toBe(3)
    expect(summary.training.available).toBe(7)
  })

  test('a member with no membership on record reads as none, not an error', () => {
    const summary = assembleMySummary({ ...BASE, membershipTerm: null })
    expect(summary.membership.state).toBe('none')
  })

  test('the allow-list carries no student id and no free-text note', () => {
    const summary = assembleMySummary(BASE)
    const shape = JSON.stringify(summary)
    expect(shape).not.toContain('studentId')
    expect(shape).not.toContain('"notes"')
  })

  test('a confirmed shift inside tonight\'s show night is the one accent tile', () => {
    const tonight = new Date('2026-09-15T20:00:00Z')
    const summary = assembleMySummary({
      ...BASE,
      now: tonight,
      shift: {
        shiftId: 's1',
        role: 'FRONT_OF_HOUSE',
        status: 'CONFIRMED',
        venueName: 'Main Hall',
        showTitle: 'A Show',
        startsAt: Math.floor(tonight.getTime() / 1000),
      },
    })
    expect(summary.onShiftTonight).toBe(true)
    expect(summary.shift?.shiftId).toBe('s1')
  })

  test('a claimed shift on a future night is not tonight\'s accent', () => {
    const nextWeek = Math.floor(new Date('2026-09-22T20:00:00Z').getTime() / 1000)
    const summary = assembleMySummary({
      ...BASE,
      shift: { shiftId: 's2', role: 'FRONT_OF_HOUSE', status: 'CLAIMED', venueName: 'Main Hall', showTitle: 'A Show', startsAt: nextWeek },
    })
    expect(summary.onShiftTonight).toBe(false)
  })

  test('a declined shift is never the accent, whenever it falls', () => {
    const tonight = Math.floor(new Date('2026-09-15T20:00:00Z').getTime() / 1000)
    const summary = assembleMySummary({
      ...BASE,
      now: new Date('2026-09-15T12:00:00Z'),
      shift: { shiftId: 's3', role: 'FRONT_OF_HOUSE', status: 'DECLINED', venueName: 'Main Hall', showTitle: 'A Show', startsAt: tonight },
    })
    expect(summary.onShiftTonight).toBe(false)
  })

  test('a room booking the member holds and may still cancel reads as cancellable', () => {
    const summary = assembleMySummary({
      ...BASE,
      room: { bookingId: 'b1', roomName: 'Green Room', startsAt: 1, endsAt: 2, purpose: 'Rehearsal', status: 'CONFIRMED', userId: 'u1' },
    })
    expect(summary.room).toEqual({ bookingId: 'b1', roomName: 'Green Room', startsAt: 1, endsAt: 2, purpose: 'Rehearsal', cancellable: true })
  })

  test('a bumped room booking is not cancellable', () => {
    const summary = assembleMySummary({
      ...BASE,
      room: { bookingId: 'b2', roomName: 'Green Room', startsAt: 1, endsAt: 2, purpose: null, status: 'BUMPED', userId: 'u1' },
    })
    expect(summary.room?.cancellable).toBe(false)
  })

  test('an open claim and a declined claim read as their own words', () => {
    expect(assembleMySummary({ ...BASE, claim: { status: 'OPEN' } }).membership.claim).toBe('open')
    expect(assembleMySummary({ ...BASE, claim: { status: 'DECLINED' } }).membership.claim).toBe('declined')
    expect(assembleMySummary({ ...BASE, claim: { status: 'RECORDED' } }).membership.claim).toBeNull()
  })

  test('only the newest three notifications reach the tile', () => {
    const notifications = Array.from({ length: 5 }, (_, index) => ({ id: `n${index}`, title: `Item ${index}`, link: null, createdAt: index }))
    const summary = assembleMySummary({ ...BASE, notifications })
    expect(summary.notifications).toHaveLength(3)
  })

  test('the next show on sale reports its first and last performance and its earliest availability', () => {
    const summary = assembleMySummary({
      ...BASE,
      nextShow: {
        slug: 'the-tempest',
        title: 'The Tempest',
        performances: [
          { startsAt: 200, availability: 'LIMITED' },
          { startsAt: 100, availability: 'LIMITED' },
          { startsAt: 300, availability: 'AVAILABLE' },
        ],
      },
    })
    expect(summary.nextShow).toEqual({ slug: 'the-tempest', title: 'The Tempest', firstAt: 100, lastAt: 300, availability: 'LIMITED' })
  })

  test('a show with no on-sale performance is no show at all', () => {
    const summary = assembleMySummary({ ...BASE, nextShow: { slug: 'x', title: 'X', performances: [] } })
    expect(summary.nextShow).toBeNull()
  })
})
