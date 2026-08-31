import { describe, expect, test } from 'bun:test'
import { CANCELLABLE, refusalToCancel } from '#shared/utils/bookings'

// C-112. Cancellation is a status change, never a row deletion, and no member-facing delete path
// may exist at all (criterion 2, audit RM-3).

const mine = { userId: 'u-me', status: 'CONFIRMED' as const }

describe('what may be cancelled, and by whom', () => {
  test('a member cancels their own confirmed booking', () => {
    expect(refusalToCancel(mine, 'u-me')).toBeNull()
  })

  test('and their own request, while it is still waiting', () => {
    expect(refusalToCancel({ ...mine, status: 'PENDING_APPROVAL' }, 'u-me')).toBeNull()
  })

  test('somebody else\'s is refused, and the refusal does not confirm it exists', () => {
    const refusal = refusalToCancel(mine, 'u-somebody-else')
    expect(refusal).toBeTruthy()
    expect(refusal).not.toContain('u-me')
  })

  // Criterion 5: cancelled is terminal, and the row stays visible in the member's history.
  test('a cancelled booking cannot be cancelled again', () => {
    expect(refusalToCancel({ ...mine, status: 'CANCELLED' }, 'u-me')).toBeTruthy()
  })

  test('nor can a rejected or bumped one, which are terminal too', () => {
    expect(refusalToCancel({ ...mine, status: 'REJECTED' }, 'u-me')).toBeTruthy()
    expect(refusalToCancel({ ...mine, status: 'BUMPED' }, 'u-me')).toBeTruthy()
  })

  test('the two cancellable statuses are the two that hold a slot', () => {
    expect([...CANCELLABLE].sort()).toEqual(['CONFIRMED', 'PENDING_APPROVAL'])
  })
})
