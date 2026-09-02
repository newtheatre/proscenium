import { describe, expect, test } from 'bun:test'
import { inQueueOrder } from '#shared/utils/queue'
import type { QueueItem } from '#shared/utils/queue'

// C-122 criterion 2. The queue is a list of work, so open rows come first and soonest first, and
// settled ones follow most recently settled first whichever table they came from.

const item = (over: Partial<QueueItem> & Pick<QueueItem, 'id' | 'kind' | 'status' | 'startsAt'>): QueueItem => ({
  userId: 'u', requester: 'A Member', title: 'Rehearsal', purpose: 'REHEARSAL', attendees: null,
  endsAt: over.startsAt + 7200, where: null, createdAt: 0, decidedAt: null, ...over,
})

describe('what an officer sees first', () => {
  test('open rows come before settled ones, whichever table they are from', () => {
    const ordered = inQueueOrder([
      item({ id: 'settled-room', kind: 'room', status: 'CONFIRMED', startsAt: 100, decidedAt: 50 }),
      item({ id: 'open-unlisted', kind: 'unlisted', status: 'AWAITING_EXTERNAL', startsAt: 900 }),
      item({ id: 'settled-unlisted', kind: 'unlisted', status: 'CANCELLED', startsAt: 200, decidedAt: 60 }),
      item({ id: 'open-room', kind: 'room', status: 'PENDING_APPROVAL', startsAt: 800 }),
    ]).map(one => one.id)

    expect(ordered.slice(0, 2)).toEqual(['open-room', 'open-unlisted'])
    expect(ordered.slice(2)).toEqual(['settled-unlisted', 'settled-room'])
  })

  test('open rows are soonest first, so the one about to happen is at the top', () => {
    const ordered = inQueueOrder([
      item({ id: 'later', kind: 'room', status: 'PENDING_APPROVAL', startsAt: 900 }),
      item({ id: 'sooner', kind: 'unlisted', status: 'REQUESTED', startsAt: 100 }),
    ]).map(one => one.id)

    expect(ordered).toEqual(['sooner', 'later'])
  })

  test('settled rows are most recently settled first, because they are a lookup', () => {
    const ordered = inQueueOrder([
      item({ id: 'older', kind: 'room', status: 'REJECTED', startsAt: 100, decidedAt: 10 }),
      item({ id: 'newer', kind: 'unlisted', status: 'CONFIRMED', startsAt: 900, decidedAt: 90 }),
    ]).map(one => one.id)

    expect(ordered).toEqual(['newer', 'older'])
  })

  // Confirmed is answered on both sides, even though a room we do not manage can still be
  // corrected. Otherwise every confirmed request sits at the top of the work list for ever.
  test('CONFIRMED settles a row of either kind, and waiting on somebody does not', () => {
    const ordered = inQueueOrder([
      item({ id: 'confirmed-ours', kind: 'room', status: 'CONFIRMED', startsAt: 100, decidedAt: 10 }),
      item({ id: 'confirmed-theirs', kind: 'unlisted', status: 'CONFIRMED', startsAt: 200, decidedAt: 20 }),
      item({ id: 'still-waiting', kind: 'unlisted', status: 'AWAITING_EXTERNAL', startsAt: 900 }),
    ]).map(one => one.id)

    expect(ordered).toEqual(['still-waiting', 'confirmed-theirs', 'confirmed-ours'])
  })

  test('a settled row with no decision date falls back to when it was written', () => {
    const ordered = inQueueOrder([
      item({ id: 'written-first', kind: 'room', status: 'CANCELLED', startsAt: 100, createdAt: 10 }),
      item({ id: 'written-later', kind: 'room', status: 'CANCELLED', startsAt: 900, createdAt: 90 }),
    ]).map(one => one.id)

    expect(ordered).toEqual(['written-later', 'written-first'])
  })
})
