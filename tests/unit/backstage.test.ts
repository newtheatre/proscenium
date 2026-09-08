import { describe, expect, test } from 'bun:test'
import { BOARD_CODE_DIGITS, MAX_FAILED_ATTEMPTS, boardJoinForm, deriveBoardCode } from '#shared/utils/backstage'

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
