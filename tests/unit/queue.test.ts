import { describe, expect, test } from 'bun:test'
import { heldBesides, inQueueOrder, saysOutsideOpening, saysPreApproval, saysRequestName } from '#shared/utils/queue'
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

describe('how a row reads', () => {
  test('an unnamed request shows its purpose once', () => {
    expect(saysRequestName({ title: 'Meeting', purpose: 'MEETING' })).toBe('Meeting')
    expect(saysRequestName({ title: '  ', purpose: 'REHEARSAL' })).toBe('Rehearsal')
  })

  test('a named request keeps its purpose beside the name', () => {
    expect(saysRequestName({ title: 'Line run', purpose: 'REHEARSAL' })).toBe('Line run (Rehearsal)')
  })

  test('pre-approval names the count that put the member there', () => {
    expect(saysPreApproval(3)).toBe('Under pre-approval (3 no-shows)')
    expect(saysPreApproval(1)).toBe('Under pre-approval (1 no-show)')
  })
})

describe('a request is never counted against itself (0208)', () => {
  const now = 1000

  test('a waiting request still to happen leaves itself out', () => {
    expect(heldBesides(10, { status: 'PENDING_APPROVAL', endsAt: now + 60 }, now)).toBe(9)
  })

  test('a row that holds nothing, or has finished, is not in the count to begin with', () => {
    expect(heldBesides(10, { status: 'REJECTED', endsAt: now + 60 }, now)).toBe(10)
    expect(heldBesides(10, { status: 'PENDING_APPROVAL', endsAt: now - 60 }, now)).toBe(10)
  })
})

describe('a batch approval asks about days the room is shut', () => {
  const closed = { where: 'The Studio', failures: [{ reason: 'ROOM_CLOSED' }] }
  const late = { where: 'The Studio', failures: [{ reason: 'OUT_OF_HOURS' }] }
  const fine = { where: 'The Studio', failures: [{ reason: 'SHORT_NOTICE' }] }

  test('nothing is asked when every one is inside the opening hours', () => {
    expect(saysOutsideOpening([fine, { where: 'Green Room' }])).toBeNull()
  })

  test('closed days are counted and the room named', () => {
    expect(saysOutsideOpening([closed, closed, fine])).toBe('2 of these are on days The Studio is closed')
    expect(saysOutsideOpening([closed])).toBe('1 of these is on a day The Studio is closed')
  })

  test('hours and days together, across rooms', () => {
    expect(saysOutsideOpening([closed, { ...late, where: 'Green Room' }]))
      .toBe('1 of these is on a day their room is closed, and 1 of these is outside the hours their room opens')
  })
})
