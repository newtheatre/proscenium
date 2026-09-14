import { describe, expect, test } from 'bun:test'
import {
  BOARD_CODE_DIGITS,
  FREE_TEXT_LIMIT,
  MAX_FAILED_ATTEMPTS,
  MESSAGE_RETENTION_DAYS,
  boardFeedRows,
  boardJoinForm,
  boardStateFrom,
  currentBoardState,
  deriveBoardCode,
  deriveFohCredential,
  fohMessageForm,
  liveBoardMessages,
  milestoneTypeForm,
  otherBoardSide,
  postMessageForm,
  presetForm,
  saysBoardSide,
  supersedeMessageForm,
} from '#shared/utils/backstage'
import type { BoardSide } from '#shared/utils/backstage'

// E-120's pure derivation and validation. What the database holds is proved against the real
// migrations in `tests/integration/backstage.test.ts`.

const SECRET = 'a-worker-secret-that-is-long-enough'

describe('the join code is derived, not stored (criterion 2)', () => {
  test('the same inputs always produce the same code', async () => {
    const first = await deriveBoardCode(SECRET, '2026-09-14', 'venue-1', 0)
    const second = await deriveBoardCode(SECRET, '2026-09-14', 'venue-1', 0)
    expect(first).toBe(second)
    expect(first).toMatch(new RegExp(`^\\d{${BOARD_CODE_DIGITS}}$`))
  })

  test('a different night, venue, epoch or secret all change the code', async () => {
    const base = await deriveBoardCode(SECRET, '2026-09-14', 'venue-1', 0)
    expect(await deriveBoardCode(SECRET, '2026-09-15', 'venue-1', 0)).not.toBe(base)
    expect(await deriveBoardCode(SECRET, '2026-09-14', 'venue-2', 0)).not.toBe(base)
    expect(await deriveBoardCode(SECRET, '2026-09-14', 'venue-1', 1)).not.toBe(base)
    expect(await deriveBoardCode('a-different-secret-entirely', '2026-09-14', 'venue-1', 0)).not.toBe(base)
  })

  test('rotation is ten failed attempts, stated directly by the story rather than configured', () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(10)
  })
})

describe('joining names a code and a display label, nothing else (criterion 1)', () => {
  test('a six-digit code and a label parse', () => {
    expect(boardJoinForm.safeParse({ code: '048213', label: 'Stage left' }).success).toBe(true)
  })

  test('a code that is not six digits is refused', () => {
    expect(boardJoinForm.safeParse({ code: '1234', label: 'Stage left' }).success).toBe(false)
    expect(boardJoinForm.safeParse({ code: 'abcdef', label: 'Stage left' }).success).toBe(false)
  })

  test('an empty label is refused', () => {
    expect(boardJoinForm.safeParse({ code: '048213', label: '' }).success).toBe(false)
  })

  test('the form asks for nothing that identifies a person', () => {
    expect(Object.keys(boardJoinForm.shape)).toEqual(['code', 'label'])
  })
})

describe('posting a message names exactly one of a milestone, a preset, or free text (E-121)', () => {
  test('a milestone alone parses', () => {
    expect(postMessageForm.safeParse({ milestoneTypeId: 'mt-1', composedAt: 1700000000 }).success).toBe(true)
  })

  test('a preset alone parses', () => {
    expect(postMessageForm.safeParse({ presetId: 'p-1', composedAt: 1700000000 }).success).toBe(true)
  })

  test('free text alone parses', () => {
    expect(postMessageForm.safeParse({ body: 'Five minutes please', composedAt: 1700000000 }).success).toBe(true)
  })

  test('none of the three is refused', () => {
    expect(postMessageForm.safeParse({ composedAt: 1700000000 }).success).toBe(false)
  })

  test('two of the three at once is refused', () => {
    expect(postMessageForm.safeParse({ milestoneTypeId: 'mt-1', presetId: 'p-1', composedAt: 1700000000 }).success).toBe(false)
    expect(postMessageForm.safeParse({ milestoneTypeId: 'mt-1', body: 'Also this', composedAt: 1700000000 }).success).toBe(false)
  })

  test('free text is capped, stated directly by the story', () => {
    expect(FREE_TEXT_LIMIT).toBe(500)
    expect(postMessageForm.safeParse({ body: 'x'.repeat(500), composedAt: 1700000000 }).success).toBe(true)
    expect(postMessageForm.safeParse({ body: 'x'.repeat(501), composedAt: 1700000000 }).success).toBe(false)
  })

  test('composedAt is required: it is what survives an offline queue (criterion 6)', () => {
    expect(postMessageForm.safeParse({ body: 'Text', composedAt: -1 }).success).toBe(false)
  })
})

describe('a correction names a different milestone, nothing else (criterion 5)', () => {
  test('a milestone and a composed time parse', () => {
    expect(supersedeMessageForm.safeParse({ milestoneTypeId: 'mt-2', composedAt: 1700000000 }).success).toBe(true)
  })

  test('nothing else is accepted in its place', () => {
    expect(supersedeMessageForm.safeParse({ composedAt: 1700000000 }).success).toBe(false)
  })
})

describe('committee configuration for milestone types and presets (criteria 1, 2)', () => {
  test('a milestone type names a label and an order', () => {
    expect(milestoneTypeForm.safeParse({ label: 'Fire check', sort: 6 }).success).toBe(true)
    expect(milestoneTypeForm.safeParse({ label: '', sort: 6 }).success).toBe(false)
  })

  test('a preset names a label, a body and an order', () => {
    expect(presetForm.safeParse({ label: '5 minutes', body: 'Five minutes please', sort: 0 }).success).toBe(true)
    expect(presetForm.safeParse({ label: '5 minutes', body: '', sort: 0 }).success).toBe(false)
  })
})

describe('retention (E-122 criterion 4)', () => {
  test('free text and presets purge at 30 days, stated directly by the story', () => {
    expect(MESSAGE_RETENTION_DAYS).toBe(30)
  })
})

// E-121 criterion 7: front of house's own end of the board.

describe('the FOH credential is derived and never issued (criterion 7)', () => {
  test('the same night always produces the same credential, a different night never does', async () => {
    const first = await deriveFohCredential(SECRET, 'night-1')
    expect(await deriveFohCredential(SECRET, 'night-1')).toBe(first)
    expect(await deriveFohCredential(SECRET, 'night-2')).not.toBe(first)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
  })

  test('a different secret produces a different credential', async () => {
    const mine = await deriveFohCredential(SECRET, 'night-1')
    expect(await deriveFohCredential('another-worker-secret-entirely', 'night-1')).not.toBe(mine)
  })
})

describe('front of house sends a preset or free text, never a milestone (criterion 7)', () => {
  const composedAt = 1_795_000_000

  test('a preset alone, or free text alone, is accepted', () => {
    expect(fohMessageForm.safeParse({ presetId: 'preset-1', composedAt }).success).toBe(true)
    expect(fohMessageForm.safeParse({ body: 'Two minutes on the bar queue', composedAt }).success).toBe(true)
  })

  test('both at once, or neither, is refused', () => {
    expect(fohMessageForm.safeParse({ presetId: 'preset-1', body: 'And this', composedAt }).success).toBe(false)
    expect(fohMessageForm.safeParse({ composedAt }).success).toBe(false)
  })

  test('free text over the limit is refused', () => {
    expect(fohMessageForm.safeParse({ body: 'x'.repeat(FREE_TEXT_LIMIT + 1), composedAt }).success).toBe(false)
  })
})

describe('the current state is each side\'s own last call (criterion 7)', () => {
  const messages = [
    { id: 'm1', side: 'FOH' as const, supersedesId: null, composedAt: 100 },
    { id: 'm2', side: 'BACKSTAGE' as const, supersedesId: null, composedAt: 120 },
    { id: 'm3', side: 'FOH' as const, supersedesId: null, composedAt: 140 },
  ]

  test('the latest from each side, not the latest overall', () => {
    const state = currentBoardState(messages)
    expect(state.foh?.id).toBe('m3')
    expect(state.backstage?.id).toBe('m2')
  })

  test('a side that has said nothing yet has no current call', () => {
    expect(currentBoardState(messages.filter(message => message.side === 'FOH')).backstage).toBeNull()
    expect(currentBoardState([]).foh).toBeNull()
  })

  test('a superseded milestone is never the current state: the correction is', () => {
    const corrected = [
      { id: 'm1', side: 'BACKSTAGE' as const, supersedesId: null, composedAt: 200 },
      { id: 'm2', side: 'BACKSTAGE' as const, supersedesId: 'm1', composedAt: 190 },
    ]
    const live = liveBoardMessages(corrected)
    expect(live.map(message => message.id)).toEqual(['m2'])
    expect(currentBoardState(live).backstage?.id).toBe('m2')
  })
})

describe('each side is named for the reader, not by its code', () => {
  test('FOH and Backstage', () => {
    expect(saysBoardSide('FOH')).toBe('FOH')
    expect(saysBoardSide('BACKSTAGE')).toBe('Backstage')
  })
})

describe('either end reads the board from its own side (criterion 7, amended 14 September 2026)', () => {
  interface Call { id: string, side: BoardSide, composedAt: number }
  const foh: Call = { id: 'm1', side: 'FOH', composedAt: 100 }
  const backstage: Call = { id: 'm2', side: 'BACKSTAGE', composedAt: 120 }
  const state = { foh, backstage }

  test('front of house leads with its own call and reads the wings as the other side', () => {
    expect(boardStateFrom('FOH', state)).toEqual({ own: foh, other: backstage })
    expect(otherBoardSide('FOH')).toBe('BACKSTAGE')
  })

  test('the wings lead with their own call and read front of house as the other side', () => {
    expect(boardStateFrom('BACKSTAGE', state)).toEqual({ own: backstage, other: foh })
    expect(otherBoardSide('BACKSTAGE')).toBe('FOH')
  })

  test('a side that has said nothing yet reads as nothing on either end', () => {
    expect(boardStateFrom('BACKSTAGE', { foh, backstage: null })).toEqual({ own: null, other: foh })
  })
})

describe('the history is the live feed with the other side\'s tick on each row (criteria 4, 5, 7)', () => {
  const messages = [
    { id: 'm1', side: 'FOH' as const, supersedesId: null, composedAt: 100 },
    { id: 'm2', side: 'BACKSTAGE' as const, supersedesId: null, composedAt: 120 },
    { id: 'm3', side: 'BACKSTAGE' as const, supersedesId: 'm2', composedAt: 130 },
  ]

  test('a superseded row is gone, and a seen row carries when it was first seen', () => {
    const rows = boardFeedRows(messages, [{ messageId: 'm1', seenAt: 110 }])
    expect(rows.map(row => row.message.id)).toEqual(['m1', 'm3'])
    expect(rows[0]?.seenAt).toBe(110)
    expect(rows[1]?.seenAt).toBeNull()
  })

  test('a tick on a row nobody can see any more changes nothing', () => {
    const rows = boardFeedRows(messages, [{ messageId: 'm2', seenAt: 125 }])
    expect(rows.every(row => row.seenAt === null)).toBe(true)
  })

  test('nothing posted is an empty history, not a crash', () => {
    expect(boardFeedRows([], [])).toEqual([])
  })
})
