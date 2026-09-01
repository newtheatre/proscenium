import { describe, expect, test } from 'bun:test'
import { REQUEST_REASON_LIMIT, dueToEscalate, dueToExpire, requestForm } from '#shared/utils/requests'

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
