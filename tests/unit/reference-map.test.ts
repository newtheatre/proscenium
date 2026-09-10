import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { draftReferenceMap, readReferenceMap } from '#migration/reference-map'

// A reference map points at a row this migration does not create: a room, a union venue, an
// eventual ticket type, authored through its own admin screen rather than migrated (10 Sept).

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'reference-map-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('a reference map confirms against what is already authored, and never invents', () => {
  test('a name that matches the target is pre-filled', async () => {
    const result = await draftReferenceMap(
      'room-map.tsv', 'room:', [{ id: 1, name: 'The Studio' }], new Map([['The Studio', 'new-studio']]), dir,
    )
    expect(result).toMatchObject({ written: 1, matched: 1, blank: 0 })
    const { resolved, blanks } = await readReferenceMap('room-map.tsv', dir)
    expect(resolved.get('room:1')).toBe('new-studio')
    expect(blanks).toEqual([])
  })

  test('a name with no target match is left blank, not guessed', async () => {
    const result = await draftReferenceMap(
      'room-map.tsv', 'room:', [{ id: 1, name: 'A Room Nobody Authored Yet' }], new Map(), dir,
    )
    expect(result).toMatchObject({ written: 1, matched: 0, blank: 1 })
    const { resolved, blanks } = await readReferenceMap('room-map.tsv', dir)
    expect(resolved.size).toBe(0)
    expect(blanks).toEqual(['room:1'])
  })

  test('a near match is never taken: only the exact name the target index actually holds', async () => {
    const result = await draftReferenceMap(
      'room-map.tsv', 'room:', [{ id: 1, name: 'the studio' }], new Map([['The Studio', 'new-studio']]), dir,
    )
    expect(result.blank).toBe(1)
    expect((await readReferenceMap('room-map.tsv', dir)).blanks).toEqual(['room:1'])
  })

  test('a second run keeps a human-confirmed answer, and does not overwrite it', async () => {
    await draftReferenceMap('room-map.tsv', 'room:', [{ id: 1, name: 'Unmatched Then' }], new Map(), dir)
    // A person fills the blank in by hand, the same file format the draft itself writes.
    await Bun.write(join(dir, 'room-map.tsv'), 'room:1\tnew-studio\n')

    await draftReferenceMap('room-map.tsv', 'room:', [{ id: 1, name: 'Unmatched Then' }], new Map(), dir)
    const { resolved, blanks } = await readReferenceMap('room-map.tsv', dir)
    expect(resolved.get('room:1')).toBe('new-studio')
    expect(blanks).toEqual([])
  })

  test('a second run keeps a still-blank row blank, rather than re-guessing', async () => {
    await draftReferenceMap('room-map.tsv', 'room:', [{ id: 1, name: 'Still Missing' }], new Map(), dir)
    // Authored later, under a name the draft would now match, but the row has already been seen.
    await draftReferenceMap(
      'room-map.tsv', 'room:', [{ id: 1, name: 'Still Missing' }], new Map([['Still Missing', 'new-room']]), dir,
    )
    expect((await readReferenceMap('room-map.tsv', dir)).blanks).toEqual(['room:1'])
  })

  test('a new old row alongside an already-confirmed one only drafts the new one', async () => {
    await Bun.write(join(dir, 'room-map.tsv'), 'room:1\tnew-studio\n')
    const result = await draftReferenceMap(
      'room-map.tsv', 'room:',
      [{ id: 1, name: 'The Studio' }, { id: 2, name: 'A New Room' }],
      new Map([['A New Room', 'new-room-2']]),
      dir,
    )
    expect(result).toMatchObject({ written: 2, matched: 2, blank: 0 })
    const { resolved } = await readReferenceMap('room-map.tsv', dir)
    expect(resolved.get('room:1')).toBe('new-studio')
    expect(resolved.get('room:2')).toBe('new-room-2')
  })

  // ticket_types carries a case-insensitive unique index alongside its case-sensitive one
  // (ticket_types_name_nocase); generate-reference-maps.ts folds case before calling here.
  test('a caller folding case before matching gets a case-insensitive result, with no prefix', async () => {
    const result = await draftReferenceMap(
      'ticket-type-map.tsv', '',
      [{ id: 'old-adult', name: 'adult' }],
      new Map([['adult', 'new-adult']]),
      dir,
    )
    expect(result).toMatchObject({ written: 1, matched: 1, blank: 0 })
    const { resolved } = await readReferenceMap('ticket-type-map.tsv', dir)
    expect(resolved.get('old-adult')).toBe('new-adult')
  })
})
