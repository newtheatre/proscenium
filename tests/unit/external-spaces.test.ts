import { describe, expect, test } from 'bun:test'
import { blocksAssignment, noteFor, saysVerdict, spaceForm, spaceNoteForm, warningFor } from '#shared/utils/external-spaces'
import type { SpaceNote } from '#shared/utils/external-spaces'

// C-119's pure half. The whole feature is one question: is this room any good for that?

const NOTES: SpaceNote[] = [
  { spaceId: 'portland-b12', purpose: 'REHEARSAL', verdict: 'UNSUITABLE', reason: 'A fixed table fills the room' },
  { spaceId: 'portland-b12', purpose: 'MEETING', verdict: 'SUITABLE', reason: 'The table is the point' },
  { spaceId: 'trent-c4', purpose: 'REHEARSAL', verdict: 'CAUTION', reason: 'A pillar in the middle' },
]

describe('a note is about one room and one purpose', () => {
  test('the room that has one, for the purpose it is about', () => {
    expect(noteFor(NOTES, 'portland-b12', 'REHEARSAL')?.verdict).toBe('UNSUITABLE')
  })

  // The point of keying on both: the fixed table that ruins a rehearsal is what a meeting wants.
  test('the same room for another purpose is a different answer', () => {
    expect(noteFor(NOTES, 'portland-b12', 'MEETING')?.verdict).toBe('SUITABLE')
  })

  test('a purpose nobody wrote about is silence, not a verdict', () => {
    expect(noteFor(NOTES, 'portland-b12', 'WORKSHOP')).toBeUndefined()
  })

  test('a room nobody wrote about is silence too', () => {
    expect(noteFor(NOTES, 'somewhere-else', 'REHEARSAL')).toBeUndefined()
  })

  // A booking with no purpose recorded cannot be judged against anything.
  test('no purpose is no note', () => {
    expect(noteFor(NOTES, 'portland-b12', null)).toBeUndefined()
  })
})

describe('what somebody is told', () => {
  test('an unsuitable room says so, with the reason', () => {
    expect(warningFor(noteFor(NOTES, 'portland-b12', 'REHEARSAL'))).toBe(
      'This room is no good for that: A fixed table fills the room')
  })

  test('a caution is softer, and still says why', () => {
    expect(warningFor(noteFor(NOTES, 'trent-c4', 'REHEARSAL'))).toContain('may not suit')
  })

  // Only a note worth acting on speaks: "this is fine" is not a warning.
  test('a suitable room says nothing at all', () => {
    expect(warningFor(noteFor(NOTES, 'portland-b12', 'MEETING'))).toBeNull()
  })

  test('and no note says nothing', () => {
    expect(warningFor(undefined)).toBeNull()
  })
})

describe('only unsuitable blocks an assignment', () => {
  test('unsuitable must be asserted past', () => {
    expect(blocksAssignment(noteFor(NOTES, 'portland-b12', 'REHEARSAL'))).toBe(true)
  })

  test('a caution warns without standing in the way', () => {
    expect(blocksAssignment(noteFor(NOTES, 'trent-c4', 'REHEARSAL'))).toBe(false)
  })

  test('and silence never blocks', () => {
    expect(blocksAssignment(undefined)).toBe(false)
  })

  test.each([['UNSUITABLE', 'No good for'], ['CAUTION', 'May not suit'], ['SUITABLE', 'Fine for']])(
    '%s reads as "%s"', (verdict, reads) => {
      expect(saysVerdict(verdict)).toBe(reads)
    })
})

describe('what a space and a note must carry', () => {
  test('a space needs a name people would recognise', () => {
    expect(spaceForm.safeParse({ name: 'Portland B12' }).success).toBe(true)
    expect(spaceForm.safeParse({ name: '   ' }).success).toBe(false)
  })

  test('everything else about a space is optional, because the SU tells us little', () => {
    const parsed = spaceForm.safeParse({ name: 'Portland B12' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.campus).toBeNull()
      expect(parsed.data.contact).toBeNull()
      expect(parsed.data.isActive).toBe(true)
    }
  })

  test('a room holds a positive number of people or an unknown number', () => {
    expect(spaceForm.safeParse({ name: 'A', capacity: 0 }).success).toBe(false)
    expect(spaceForm.safeParse({ name: 'A', capacity: 40 }).success).toBe(true)
  })

  test('a note says which purpose, how bad, and why', () => {
    expect(spaceNoteForm.safeParse({ purpose: 'REHEARSAL', verdict: 'UNSUITABLE', reason: 'Fixed table' }).success).toBe(true)
    expect(spaceNoteForm.safeParse({ purpose: 'REHEARSAL', verdict: 'UNSUITABLE' }).success).toBe(false)
    expect(spaceNoteForm.safeParse({ purpose: 'REHEARSAL', verdict: 'MAYBE', reason: 'Hmm' }).success).toBe(false)
  })

  // A note with no reason is a rumour, and the next committee cannot act on it.
  test('a reason is never blank', () => {
    expect(spaceNoteForm.safeParse({ purpose: 'REHEARSAL', verdict: 'UNSUITABLE', reason: '  ' }).success).toBe(false)
  })
})
