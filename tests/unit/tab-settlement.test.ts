import { describe, expect, test } from 'bun:test'
import { MAX_SETTLEMENT_CHARGES, settleTabForm, voidTabChargeForm } from '#shared/utils/tab-settlement'

// Settlement and void vocabulary (F-109). The write path has its own tests in
// tests/e2e/tab-settlement.test.ts.

describe('a settlement names a holder, a bounded list of charges and its own belief of the total', () => {
  const base = { holderId: 'u1', entryIds: ['e1', 'e2'], expectedTotalPence: 1000 }

  test('a well-formed settlement is accepted', () => {
    expect(settleTabForm.safeParse(base).success).toBe(true)
  })

  test('no charges is refused', () => {
    expect(settleTabForm.safeParse({ ...base, entryIds: [] }).success).toBe(false)
  })

  test('more than the bound is refused', () => {
    const entryIds = Array.from({ length: MAX_SETTLEMENT_CHARGES + 1 }, (_, index) => `e${index}`)
    expect(settleTabForm.safeParse({ ...base, entryIds }).success).toBe(false)
  })

  test('a negative expected total is refused', () => {
    expect(settleTabForm.safeParse({ ...base, expectedTotalPence: -1 }).success).toBe(false)
  })
})

describe('a void needs a reason', () => {
  test('a reason is accepted', () => {
    expect(voidTabChargeForm.safeParse({ reason: 'Charged to the wrong member' }).success).toBe(true)
  })

  test('no reason is refused', () => {
    expect(voidTabChargeForm.safeParse({}).success).toBe(false)
  })

  test('a whitespace-only reason is refused', () => {
    expect(voidTabChargeForm.safeParse({ reason: '   ' }).success).toBe(false)
  })
})
