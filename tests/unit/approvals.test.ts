import { describe, expect, test } from 'bun:test'
import { BULK_LIMIT, chunked, decisionForm, refusalToDecide } from '#shared/utils/approvals'

// C-109's pure half: what may be decided, and what a decision has to carry.

describe('a decision is refused on anything already settled (criterion 5)', () => {
  test('a waiting request may be decided', () => {
    expect(refusalToDecide({ status: 'PENDING_APPROVAL' })).toBeNull()
  })

  test.each(['REJECTED', 'CANCELLED', 'BUMPED'])('%s is terminal, officers included', (status) => {
    expect(refusalToDecide({ status })).toContain('already')
  })

  test('a confirmed booking is not waiting for anything', () => {
    expect(refusalToDecide({ status: 'CONFIRMED' })).toBe('That booking is not waiting for a decision')
  })
})

describe('a rejection carries its reason (criterion 2)', () => {
  test('rejecting without one is refused', () => {
    const parsed = decisionForm.safeParse({ ids: ['a'], action: 'REJECT' })
    expect(parsed.success).toBe(false)
  })

  test('whitespace is not a reason', () => {
    expect(decisionForm.safeParse({ ids: ['a'], action: 'REJECT', reason: '   ' }).success).toBe(false)
  })

  test('approving needs none', () => {
    expect(decisionForm.safeParse({ ids: ['a'], action: 'APPROVE' }).success).toBe(true)
  })
})

describe('a different room is one at a time (criterion 1)', () => {
  test('one request may be moved', () => {
    expect(decisionForm.safeParse({ ids: ['a'], action: 'APPROVE', roomId: 'studio' }).success).toBe(true)
  })

  test('a batch may not', () => {
    expect(decisionForm.safeParse({ ids: ['a', 'b'], action: 'APPROVE', roomId: 'studio' }).success).toBe(false)
  })

  test('a rejection may not move anything', () => {
    const parsed = decisionForm.safeParse({ ids: ['a'], action: 'REJECT', reason: 'No', roomId: 'studio' })
    expect(parsed.success).toBe(false)
  })
})

describe('a batch is bounded (criterion 4)', () => {
  test('a hundred is allowed', () => {
    const ids = Array.from({ length: BULK_LIMIT }, (_, at) => `id-${at}`)
    expect(decisionForm.safeParse({ ids, action: 'APPROVE' }).success).toBe(true)
  })

  test('a hundred and one is not', () => {
    const ids = Array.from({ length: BULK_LIMIT + 1 }, (_, at) => `id-${at}`)
    expect(decisionForm.safeParse({ ids, action: 'APPROVE' }).success).toBe(false)
  })

  test('an empty batch is not a decision', () => {
    expect(decisionForm.safeParse({ ids: [], action: 'APPROVE' }).success).toBe(false)
  })
})

describe('a read covering a batch stays under the parameter cap D1 sets (0003)', () => {
  test('a hundred ids split into two statements', () => {
    expect(chunked(Array.from({ length: 100 }, (_, at) => at)).map(batch => batch.length)).toEqual([90, 10])
  })

  test('ninety is one', () => {
    expect(chunked(Array.from({ length: 90 }, (_, at) => at))).toHaveLength(1)
  })

  test('nothing chunks to nothing', () => {
    expect(chunked([])).toEqual([])
  })
})
