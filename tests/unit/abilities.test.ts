import { describe, expect, test } from 'bun:test'
import { can, member, memberOrGrace } from '#shared/utils/abilities'
import type { Viewer } from '#shared/utils/abilities'
import type { MembershipState } from '#shared/utils/membership'

// A-129: membership is a fact the viewer carries, the way leadsDepartment and isTrainer are
// (0040). One shape, membershipState, carries current, grace and lapsed rather than two booleans.

const viewerWith = (membershipState: MembershipState): Viewer => ({
  id: 'someone',
  permissions: [],
  onShiftTonight: false,
  leadsDepartment: false,
  isTrainer: false,
  membershipState,
})

const CURRENT: MembershipState = { kind: 'current', until: '2027-09-13' }
const GRACE: MembershipState = { kind: 'grace', until: '2027-09-27', expiredOn: '2027-09-13' }
const LAPSED: MembershipState = { kind: 'lapsed', expiredOn: '2026-09-13' }
const NONE: MembershipState = { kind: 'none' }

describe('member is current only (A-129 criterion 1)', () => {
  test('current holds it', () => {
    expect(can(viewerWith(CURRENT), member)).toBe(true)
  })

  test('grace, lapsed and none do not', () => {
    expect(can(viewerWith(GRACE), member)).toBe(false)
    expect(can(viewerWith(LAPSED), member)).toBe(false)
    expect(can(viewerWith(NONE), member)).toBe(false)
  })
})

describe('memberOrGrace also admits a renewal in hand (0031)', () => {
  test('current and grace both hold it', () => {
    expect(can(viewerWith(CURRENT), memberOrGrace)).toBe(true)
    expect(can(viewerWith(GRACE), memberOrGrace)).toBe(true)
  })

  test('lapsed and none do not', () => {
    expect(can(viewerWith(LAPSED), memberOrGrace)).toBe(false)
    expect(can(viewerWith(NONE), memberOrGrace)).toBe(false)
  })
})

describe('a guest with no account never satisfies either ability', () => {
  test('a null viewer is refused, not thrown at', () => {
    expect(can(null, member)).toBe(false)
    expect(can(null, memberOrGrace)).toBe(false)
  })
})
