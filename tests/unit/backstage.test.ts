import { describe, expect, test } from 'bun:test'
import {
  BOARD_CODE_DIGITS,
  FREE_TEXT_LIMIT,
  MAX_FAILED_ATTEMPTS,
  MESSAGE_RETENTION_DAYS,
  boardJoinForm,
  deriveBoardCode,
  milestoneTypeForm,
  postMessageForm,
  presetForm,
  supersedeMessageForm,
} from '#shared/utils/backstage'

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
