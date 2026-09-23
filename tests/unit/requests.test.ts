import { describe, expect, test } from 'bun:test'
import { SERIES_EDIT_REFUSAL, refusalToEdit } from '#shared/utils/bookings'
import {
  REQUEST_REASON_LIMIT,
  dueToEscalate,
  dueToExpire,
  editDiff,
  editRequestForm,
  othersHeld,
  requestForm,
  restartsTheClock,
} from '#shared/utils/requests'

// C-108. A booking outside policy is a request somebody decides on, not a dead end. The old app
// let a pending request sit forever, which is what the two ages here exist to stop.

const HOUR = 3600

describe('what a request must say', () => {
  const span = {
    roomId: 'r-1',
    title: 'Dress run',
    purpose: 'REHEARSAL',
    startsAt: '2026-09-14T09:00:00.000Z',
    endsAt: '2026-09-14T11:00:00.000Z',
  }

  test('a reason is required, because somebody has to decide on it', () => {
    expect(requestForm.safeParse(span).success).toBe(false)
    expect(requestForm.safeParse({ ...span, reason: 'The get-in is that afternoon.' }).success).toBe(true)
  })

  test('an empty reason is no reason', () => {
    expect(requestForm.safeParse({ ...span, reason: '   ' }).success).toBe(false)
  })

  test('a thousand characters is the limit the story sets', () => {
    expect(requestForm.safeParse({ ...span, reason: 'a'.repeat(REQUEST_REASON_LIMIT) }).success).toBe(true)
    expect(requestForm.safeParse({ ...span, reason: 'a'.repeat(REQUEST_REASON_LIMIT + 1) }).success).toBe(false)
  })
})

// Criterion 3: told once when it has waited, and lapsed when it has waited too long.
describe('a request that nobody answers', () => {
  const now = 1_000_000 * HOUR

  test('one that has waited long enough is escalated', () => {
    expect(dueToEscalate({ createdAt: now - 49 * HOUR, escalatedAt: null }, now, 48)).toBe(true)
  })

  test('one that has not waited long enough is left alone', () => {
    expect(dueToEscalate({ createdAt: now - 3 * HOUR, escalatedAt: null }, now, 48)).toBe(false)
  })

  test('one already escalated is not escalated twice', () => {
    expect(dueToEscalate({ createdAt: now - 100 * HOUR, escalatedAt: now - 50 * HOUR }, now, 48)).toBe(false)
  })

  test('one that has waited past the second age lapses', () => {
    expect(dueToExpire({ createdAt: now - 169 * HOUR }, now, 168)).toBe(true)
    expect(dueToExpire({ createdAt: now - 100 * HOUR }, now, 168)).toBe(false)
  })

  // The two ages are independent, so a shortened expiry does not need the escalation to have run.
  test('expiry does not wait for the escalation to have happened', () => {
    expect(dueToExpire({ createdAt: now - 200 * HOUR }, now, 168)).toBe(true)
  })
})

// Criterion 4: a pending request is the member's to change, and nothing else is (issue 1055).
describe('editing a request while it waits', () => {
  const span = {
    roomId: 'r-1',
    title: 'Dress run',
    purpose: 'REHEARSAL',
    startsAt: '2026-09-14T09:00:00.000Z',
    endsAt: '2026-09-14T11:00:00.000Z',
    reason: 'The get-in is that afternoon.',
  }

  test('an edit carries the same checks as the request it replaces', () => {
    expect(editRequestForm.safeParse({ ...span, reason: '' }).success).toBe(false)
    expect(editRequestForm.safeParse({ ...span, endsAt: span.startsAt }).success).toBe(false)
  })

  // C-111 criterion 1: asked, never assumed, so an unsaid scope stays null for the route to refuse.
  test('the scope is carried as said, with no default', () => {
    expect(editRequestForm.parse(span).scope).toBeNull()
    expect(editRequestForm.parse({ ...span, scope: 'occurrence' }).scope).toBe('occurrence')
    expect(editRequestForm.safeParse({ ...span, scope: 'term' }).success).toBe(false)
  })

  test('only the owner of a request waiting on a decision may change it', () => {
    expect(refusalToEdit({ userId: 'u-1', status: 'PENDING_APPROVAL' }, 'u-1')).toBeNull()
    expect(refusalToEdit({ userId: 'u-1', status: 'PENDING_APPROVAL' }, 'u-2')).toBe('That is not your booking')
  })

  test('a decided booking is refused, confirmed included', () => {
    expect(refusalToEdit({ userId: 'u-1', status: 'CONFIRMED' }, 'u-1')).toBe('That booking is already confirmed, so it cannot be changed')
    expect(refusalToEdit({ userId: 'u-1', status: 'REJECTED' }, 'u-1')).toBe('That booking is already turned down, so it cannot be changed')
    expect(refusalToEdit({ userId: 'u-1', status: 'CANCELLED' }, 'u-1')).toBe('That booking is already cancelled, so it cannot be changed')
  })

  test('a series-wide edit says it is not available yet and what to do instead', () => {
    expect(SERIES_EDIT_REFUSAL).toContain('whole series')
    expect(SERIES_EDIT_REFUSAL).toContain('one at a time')
  })
})

describe('when an edit restarts the approval clock', () => {
  const at = (iso: string): number => Math.floor(new Date(iso).getTime() / 1000)
  const before = { roomId: 'r-1', startsAt: at('2026-09-14T18:00:00Z'), endsAt: at('2026-09-14T20:00:00Z') }

  test('a different room restarts it', () => {
    expect(restartsTheClock(before, { ...before, roomId: 'r-2' })).toBe(true)
  })

  test('a different day restarts it', () => {
    expect(restartsTheClock(before, { ...before, startsAt: at('2026-09-15T18:00:00Z'), endsAt: at('2026-09-15T20:00:00Z') })).toBe(true)
  })

  test('different times on the same London day do not', () => {
    expect(restartsTheClock(before, { ...before, startsAt: at('2026-09-14T17:00:00Z'), endsAt: at('2026-09-14T21:30:00Z') })).toBe(false)
  })

  test('an unchanged span does not', () => {
    expect(restartsTheClock(before, { ...before })).toBe(false)
  })

  // 23:30 UTC on 14 September is 00:30 on the 15th in London, which is the day that counts (0014).
  test('the day is the London day, not the UTC one', () => {
    expect(restartsTheClock(before, { ...before, endsAt: at('2026-09-14T23:30:00Z') })).toBe(true)
  })
})

describe('what an edit records (0011)', () => {
  const before = {
    roomId: 'r-1',
    startsAt: 100,
    endsAt: 200,
    attendees: 4,
    tier: 'GENERAL',
    purpose: 'REHEARSAL',
    title: 'Dress run for Jo Bloggs',
    notes: 'Bring the ladder',
    reason: 'My grandmother is visiting',
  }

  test('the span, room and numbers are recorded from and to', () => {
    expect(editDiff(before, { ...before, roomId: 'r-2', startsAt: 150, attendees: 6 })).toEqual({
      changed: { roomId: { from: 'r-1', to: 'r-2' }, startsAt: { from: 100, to: 150 }, attendees: { from: 4, to: 6 } },
      rewritten: [],
    })
  })

  test('free text is named as changed and never quoted', () => {
    const diff = editDiff(before, { ...before, title: 'Dress run', notes: null, reason: 'Another reason' })
    expect(diff).toEqual({ changed: {}, rewritten: ['title', 'notes', 'reason'] })
    expect(JSON.stringify(diff)).not.toContain('Jo Bloggs')
    expect(JSON.stringify(diff)).not.toContain('grandmother')
  })
})

describe('the booking cap while editing (C-106)', () => {
  test('the request being edited does not count against itself', () => {
    expect(othersHeld(3, { endsAt: 2_000 }, 1_000)).toBe(2)
  })

  test('one whose slot has already passed was never counted', () => {
    expect(othersHeld(3, { endsAt: 500 }, 1_000)).toBe(3)
  })
})
