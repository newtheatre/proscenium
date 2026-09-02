import { describe, expect, test } from 'bun:test'
import { refusalToUnlist, saysBookingState } from '#shared/utils/bookings'
import { refusalToRelist, saysExternalState } from '#shared/utils/external-requests'

// C-123. A moved row is superseded rather than deleted, and the whole risk of that is a member
// opening their bookings and seeing a request they very much still have marked as withdrawn.

describe('a moved row never reads as cancelled', () => {
  test('an ordinary cancellation still says cancelled', () => {
    expect(saysBookingState({ status: 'CANCELLED', convertedToRequestId: null })).toBe('Cancelled')
  })

  test('one moved to a room we do not manage says so instead', () => {
    expect(saysBookingState({ status: 'CANCELLED', convertedToRequestId: 'req-1' }))
      .toBe('Moved to a room not listed here')
  })

  test('and the same on the other side', () => {
    expect(saysExternalState({ status: 'CANCELLED', convertedToBookingId: null })).toBe('Cancelled')
    expect(saysExternalState({ status: 'CANCELLED', convertedToBookingId: 'bk-1' }))
      .toBe('Moved to one of our rooms')
  })

  // Only a cancellation is ever a move. A rejected row carrying a pointer would be a bug, and
  // reading it as moved would hide it.
  test('a pointer on anything but a cancellation is ignored', () => {
    expect(saysBookingState({ status: 'REJECTED', convertedToRequestId: 'req-1' })).toBe('Turned down')
    expect(saysExternalState({ status: 'REJECTED', convertedToBookingId: 'bk-1' })).toBe('Turned down')
  })
})

describe('which rows may move', () => {
  test('a request waiting on a decision may be unlisted', () => {
    expect(refusalToUnlist({ status: 'PENDING_APPROVAL', seriesId: null })).toBeNull()
  })

  // It frees a slot somebody is relying on, and a confirmed booking is not a request any more.
  test('a confirmed or settled booking may not', () => {
    expect(refusalToUnlist({ status: 'CONFIRMED', seriesId: null })).not.toBeNull()
    expect(refusalToUnlist({ status: 'CANCELLED', seriesId: null })).not.toBeNull()
  })

  // A term of rehearsals is one action, and moving one week of it silently would leave the member
  // holding a term that no longer means what it says (C-124 makes a series able to mix).
  test('an occurrence of a series may not, and says why', () => {
    expect(refusalToUnlist({ status: 'PENDING_APPROVAL', seriesId: 'series-1' }))
      .toContain('part of a series')
  })

  test('an open request may be relisted, a settled one may not', () => {
    expect(refusalToRelist({ status: 'REQUESTED' })).toBeNull()
    expect(refusalToRelist({ status: 'AWAITING_EXTERNAL' })).toBeNull()
    expect(refusalToRelist({ status: 'CONFIRMED' })).toBeNull()
    expect(refusalToRelist({ status: 'CANCELLED' })).not.toBeNull()
    expect(refusalToRelist({ status: 'REJECTED' })).not.toBeNull()
  })
})
