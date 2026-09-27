import { describe, expect, test } from 'bun:test'
import { blackoutOver, lostWriteCause, saysClosed } from '#shared/utils/blackouts'
import { performanceClosure } from '#shared/utils/performance-closures'

// Issue 1347: a performance closes its venue's room over the performance's shift window (0043,
// 0078), derived at read time rather than retyped as a closure.

const OFFSETS = { startBeforeDoorsMinutes: 30, endAfterEndMinutes: 30 }
const CURTAIN = 1_791_000_000

const onStage = {
  performanceId: 'p-1',
  roomId: 'auditorium',
  showTitle: 'Review Show',
  startsAt: CURTAIN,
  doorsAt: CURTAIN - 30 * 60,
  durationMinutes: 120,
  intervalCount: 1,
  intervalMinutes: 20,
}

describe('the closure a performance implies', () => {
  test('runs from the offset before doors to the offset after the curtain comes down', () => {
    const closure = performanceClosure(onStage, OFFSETS)
    expect(closure.startsAt).toBe(CURTAIN - 60 * 60)
    expect(closure.endsAt).toBe(CURTAIN + (120 + 20 + 30) * 60)
    expect(closure.roomId).toBe('auditorium')
  })

  test('names the show, so a member turned away knows why', () => {
    const closure = performanceClosure(onStage, OFFSETS)
    expect(saysClosed(closure)).toBe('The room is closed then: Review Show is on')
  })

  // A show nobody has published is nowhere public (D-121), so its closure names no title.
  test('an unpublished show reads as a performance, and nothing more', () => {
    const closure = performanceClosure({ ...onStage, showTitle: null }, OFFSETS)
    expect(saysClosed(closure)).toBe('The room is closed then: A performance is on')
  })

  test('is keyed to its performance, on an id no closure an officer set can carry', () => {
    const closure = performanceClosure(onStage, OFFSETS)
    expect(closure.id).toBe('performance:p-1')
    expect(closure.performanceId).toBe('p-1')
  })

  test('with no doors time or running time recorded, the curtain is the fallback at both ends', () => {
    const closure = performanceClosure({ ...onStage, doorsAt: null, durationMinutes: null, intervalCount: 0, intervalMinutes: null }, OFFSETS)
    expect(closure.startsAt).toBe(CURTAIN - 30 * 60)
    expect(closure.endsAt).toBe(CURTAIN + 30 * 60)
  })

  test('refuses a booking over its window in the room, and not in another room', () => {
    const closure = performanceClosure(onStage, OFFSETS)
    const evening = { startsAt: CURTAIN - 3600, endsAt: CURTAIN + 3600 }
    expect(blackoutOver([closure], 'auditorium', evening)).toBe(closure)
    expect(blackoutOver([closure], 'studio', evening)).toBeUndefined()
    expect(blackoutOver([closure], 'auditorium', { startsAt: CURTAIN - 6 * 3600, endsAt: CURTAIN - 2 * 3600 })).toBeUndefined()
  })
})

describe('the Closures screen lists them beside the ones an officer set', () => {
  test('in a read-only section of their own', async () => {
    const source = await Bun.file('app/pages/rooms/manage/closures.vue').text()
    expect(source).toContain('data-test="performance-closures"')
    expect(source).toContain('/api/admin/rooms/blackouts/performances')
  })
})

// A write that wrote nothing names a closure only when one was read, never by elimination: a
// clash cancelled before the re-read is still the 409 it was (issue 1347 follow-up).
describe('why a write that wrote nothing wrote nothing', () => {
  test('a retired room is gone, whatever else was read', () => {
    expect(lostWriteCause({ roomLive: false, closed: true })).toBe('gone')
  })

  test('a closure read is closed', () => {
    expect(lostWriteCause({ roomLive: true, closed: true })).toBe('closed')
  })

  test('no closure read is the clash it has always been, even with nothing left in the way', () => {
    expect(lostWriteCause({ roomLive: true, closed: false })).toBe('conflict')
  })
})
