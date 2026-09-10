import { describe, expect, test } from 'bun:test'
import { passRedemptionRefusal, redeemPassForm } from '#shared/utils/passes'
import type { PassRedemptionState } from '#shared/utils/passes'

// D-125 as pure rules. The database enforcement is tests/integration/races-pass-redemption.test.ts;
// the full flow is tests/e2e/pass-redemption.test.ts.

const eligible: PassRedemptionState = {
  status: 'ACTIVE',
  passTypeStatus: 'ON_SALE',
  validFrom: 1_000,
  validUntil: 2_000,
  coversShow: true,
}

describe('a pass redeems only inside its own terms (criterion 1)', () => {
  test('active, on sale, inside the window and covering the show has nothing to refuse', () => {
    expect(passRedemptionRefusal(eligible, 1_500)).toBeNull()
  })

  test('a cancelled or expired pass refuses, naming that it is not active', () => {
    expect(passRedemptionRefusal({ ...eligible, status: 'CANCELLED' }, 1_500)).toContain('not active')
    expect(passRedemptionRefusal({ ...eligible, status: 'EXPIRED' }, 1_500)).toContain('not active')
  })

  test('an archived product refuses, naming that it no longer admits', () => {
    expect(passRedemptionRefusal({ ...eligible, passTypeStatus: 'CLOSED' }, 1_500)).toContain('no longer admits')
  })

  test('before the validity window opens is refused as not yet valid', () => {
    expect(passRedemptionRefusal(eligible, 999)).toContain('not valid yet')
  })

  test('after the validity window closes is refused as expired', () => {
    expect(passRedemptionRefusal(eligible, 2_001)).toContain('expired')
  })

  test('at the boundary of the window it still redeems', () => {
    expect(passRedemptionRefusal(eligible, 1_000)).toBeNull()
    expect(passRedemptionRefusal(eligible, 2_000)).toBeNull()
  })

  test('a show this pass does not cover is refused, whatever else is true', () => {
    expect(passRedemptionRefusal({ ...eligible, coversShow: false }, 1_500)).toContain('does not cover')
  })
})

describe('redeeming names only which performance (criterion 1)', () => {
  test('a well-formed redemption parses', () => {
    expect(redeemPassForm.safeParse({ performanceId: 'performance-1' }).success).toBe(true)
  })

  test('anything beyond the performance id is a different shape entirely, and is refused', () => {
    expect(redeemPassForm.safeParse({ performanceId: 'performance-1', passId: 'pass-1' }).success).toBe(false)
  })

  test('an empty performance id is refused', () => {
    expect(redeemPassForm.safeParse({ performanceId: '' }).success).toBe(false)
  })
})
