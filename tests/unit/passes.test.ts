import { describe, expect, test } from 'bun:test'
import {
  PASS_REFERENCE_LENGTH,
  PASS_REQUEST_STATUSES,
  PASS_STATUSES,
  generatePassReference,
  issuePassForm,
  passCapReason,
  passSaleRefusal,
  requestPassForm,
  saysPassStatus,
} from '#shared/utils/passes'

// D-124 as pure rules. The database enforcement (the cap, the race) is in
// tests/integration/races-pass-issue.test.ts; the full flow is tests/e2e/passes.test.ts.

describe('a pass reference is short, no-look-alike and never a credential', () => {
  test('every character comes from the no-look-alike alphabet, at the fixed length', () => {
    for (let i = 0; i < 200; i += 1) {
      const reference = generatePassReference()
      expect(reference).toHaveLength(PASS_REFERENCE_LENGTH)
      expect(reference).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]+$/)
    }
  })

  test('two references are not the same call answered twice', () => {
    const references = new Set(Array.from({ length: 50 }, () => generatePassReference()))
    expect(references.size).toBeGreaterThan(1)
  })
})

describe('the cap is quoted in the refusal, uncapped says nothing (criterion 4)', () => {
  test('uncapped has nothing to refuse', () => {
    expect(passCapReason(null)).toBeNull()
  })

  test('a capped product names the figure', () => {
    expect(passCapReason(200)).toContain('200')
  })
})

describe('a pass is only sold and requested inside its own sales window (criterion 3)', () => {
  test('a draft product refuses, naming that it is not on sale yet', () => {
    expect(passSaleRefusal({ status: 'DRAFT', salesOpenAt: null, salesCloseAt: null }, 1_000)).toContain('not on sale yet')
  })

  test('a closed product refuses, naming that it is no longer on sale', () => {
    expect(passSaleRefusal({ status: 'CLOSED', salesOpenAt: null, salesCloseAt: null }, 1_000)).toContain('no longer on sale')
  })

  test('on sale with no window at all has nothing to refuse', () => {
    expect(passSaleRefusal({ status: 'ON_SALE', salesOpenAt: null, salesCloseAt: null }, 1_000)).toBeNull()
  })

  test('before the sales window opens is refused, even while ON_SALE', () => {
    expect(passSaleRefusal({ status: 'ON_SALE', salesOpenAt: 2_000, salesCloseAt: null }, 1_000)).not.toBeNull()
  })

  test('at or after the sales window closes is refused', () => {
    expect(passSaleRefusal({ status: 'ON_SALE', salesOpenAt: null, salesCloseAt: 1_000 }, 1_000)).not.toBeNull()
    expect(passSaleRefusal({ status: 'ON_SALE', salesOpenAt: null, salesCloseAt: 1_000 }, 500)).toBeNull()
  })
})

describe('issuing asks for a buyer, a price point and the reader\'s own figure (criterion 1)', () => {
  test('a well-formed issue parses', () => {
    const parsed = issuePassForm.safeParse({
      passTypeId: 'pt-1', passTypePriceId: 'price-1', userId: 'u-1', expectedTotalPence: 4500,
    })
    expect(parsed.success).toBe(true)
  })

  test('a request id is optional, for fulfilling one at payment (criterion 3)', () => {
    const parsed = issuePassForm.safeParse({
      passTypeId: 'pt-1', passTypePriceId: 'price-1', userId: 'u-1', expectedTotalPence: 4500, requestId: 'req-1',
    })
    expect(parsed.success).toBe(true)
  })

  test('a negative figure is refused before it reaches the route', () => {
    const parsed = issuePassForm.safeParse({
      passTypeId: 'pt-1', passTypePriceId: 'price-1', userId: 'u-1', expectedTotalPence: -1,
    })
    expect(parsed.success).toBe(false)
  })
})

describe('a request names only which product (criterion 3)', () => {
  test('a well-formed request parses', () => {
    expect(requestPassForm.safeParse({ passTypeId: 'pt-1' }).success).toBe(true)
  })

  test('a price or a buyer would be a different shape entirely, and is refused', () => {
    expect(requestPassForm.safeParse({ passTypeId: 'pt-1', userId: 'u-1' }).success).toBe(false)
  })
})

describe('a pass or a request status reads as a sentence, never the raw enum (issue 914)', () => {
  test('every pass status has its own reading', () => {
    for (const status of PASS_STATUSES) {
      expect(saysPassStatus(status)).not.toBe(status)
      expect(saysPassStatus(status).length).toBeGreaterThan(0)
    }
  })

  test('every request status has its own reading', () => {
    for (const status of PASS_REQUEST_STATUSES) {
      expect(saysPassStatus(status)).not.toBe(status)
    }
  })
})
