import { describe, expect, test } from 'bun:test'
import { financeScopeForm } from '#shared/utils/finance-reports'

// I-103 criterion 1: foregone value is reportable per show and per period, so the scope a caller
// asks for is one of exactly two shapes.

describe('a finance scope is a show or a period, never both', () => {
  test('a show scope takes an id', () => {
    expect(financeScopeForm.safeParse({ scope: 'SHOW', showId: 'show-1' }).success).toBe(true)
  })

  test('a period scope takes a London calendar range', () => {
    expect(financeScopeForm.safeParse({ scope: 'PERIOD', from: '2026-09-01', to: '2026-09-30' }).success).toBe(true)
  })

  test('a period scope refuses a date that is not YYYY-MM-DD', () => {
    expect(financeScopeForm.safeParse({ scope: 'PERIOD', from: '1 Sept 2026', to: '2026-09-30' }).success).toBe(false)
  })

  test('an unknown scope is refused', () => {
    expect(financeScopeForm.safeParse({ scope: 'NIGHT', night: '2026-09-01' }).success).toBe(false)
  })

  test('a show scope with no id is refused', () => {
    expect(financeScopeForm.safeParse({ scope: 'SHOW', showId: '' }).success).toBe(false)
  })
})
