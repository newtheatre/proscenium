import { describe, expect, test } from 'bun:test'
import { confirmationMatches, confirmationOptions } from '#shared/utils/blast-radius'

// J-105 criterion 2, the typed echo confirming a flagged save: what counts as a match, pure.

describe('confirmationOptions names what a flagged save may be confirmed with (criterion 2)', () => {
  test('with a preview, the key and the count are both offered', () => {
    expect(confirmationOptions('RETENTION_ARMED', { count: 12, category: 'accounts' }))
      .toEqual(['RETENTION_ARMED', '12'])
  })

  test('with no preview for the key, only the key itself is offered', () => {
    expect(confirmationOptions('SOME_KEY', null)).toEqual(['SOME_KEY'])
  })

  test('a count of zero is still a real option, not treated as absent', () => {
    expect(confirmationOptions('RETENTION_ARMED', { count: 0, category: 'accounts' }))
      .toEqual(['RETENTION_ARMED', '0'])
  })
})

describe('confirmationMatches is validated text, never a checkbox (criterion 2)', () => {
  const preview = { count: 247, category: 'refunds' }

  test('typing the exact count matches', () => {
    expect(confirmationMatches('REFUND_PAID_REQUIRES_MANAGER', preview, '247')).toBe(true)
  })

  test('typing the exact key name matches', () => {
    expect(confirmationMatches('REFUND_PAID_REQUIRES_MANAGER', preview, 'REFUND_PAID_REQUIRES_MANAGER')).toBe(true)
  })

  test('surrounding whitespace is trimmed before it is judged', () => {
    expect(confirmationMatches('REFUND_PAID_REQUIRES_MANAGER', preview, '  247  ')).toBe(true)
  })

  test('a close but wrong number never matches', () => {
    expect(confirmationMatches('REFUND_PAID_REQUIRES_MANAGER', preview, '246')).toBe(false)
  })

  test('an empty string never matches, so a checkbox-shaped no-op cannot stand in', () => {
    expect(confirmationMatches('REFUND_PAID_REQUIRES_MANAGER', preview, '')).toBe(false)
  })

  test('case is significant: the key is typed exactly, not guessed at', () => {
    expect(confirmationMatches('REFUND_PAID_REQUIRES_MANAGER', preview, 'refund_paid_requires_manager')).toBe(false)
  })
})
