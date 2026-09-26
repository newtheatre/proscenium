import { describe, expect, test } from 'bun:test'
import { can, canWorkTonight, member, memberOrGrace, viewBarReports, viewReports } from '#shared/utils/abilities'
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

// F-119 criterion 5, #906: the treasurer holds finance.read, not bar.read, and reports must
// still open without granting the wider bar catalogue or stock screens.
describe('viewBarReports admits the treasurer alongside the bar manager', () => {
  const withPermissions = (permissions: Viewer['permissions']): Viewer => ({
    id: 'someone', permissions, onShiftTonight: false, leadsDepartment: false, isTrainer: false, membershipState: { kind: 'none' },
  })

  test('bar.read and finance.read each satisfy it', () => {
    expect(can(withPermissions(['bar.read']), viewBarReports)).toBe(true)
    expect(can(withPermissions(['finance.read']), viewBarReports)).toBe(true)
  })

  test('a viewer with neither permission is refused', () => {
    expect(can(withPermissions([]), viewBarReports)).toBe(false)
  })
})

// E-126 criterion 5, #1042: the cross-season reports open to whoever holds reports.read, and a
// finance or bar read opens nothing here.
describe('viewReports rests on reports.read alone', () => {
  const withPermissions = (permissions: Viewer['permissions']): Viewer => ({
    id: 'someone', permissions, onShiftTonight: false, leadsDepartment: false, isTrainer: false, membershipState: { kind: 'none' },
  })

  test('reports.read satisfies it', () => {
    expect(can(withPermissions(['reports.read']), viewReports)).toBe(true)
  })

  test('the money dashboard or the bar reports do not', () => {
    expect(can(withPermissions(['finance.summary', 'finance.read', 'bar.read']), viewReports)).toBe(false)
  })
})

// 0094, amending 0040: Tonight in the account menu is gated on one fact, a confirmed shift in its
// window or a night permission. `tests/unit/work-tonight.test.ts` pins the permission half.
describe('canWorkTonight rests on the shift fact or a night permission', () => {
  const onShift = (onShiftTonight: boolean): Viewer => ({
    id: 'someone', permissions: [], onShiftTonight, leadsDepartment: false, isTrainer: false, membershipState: { kind: 'none' },
  })

  test('a viewer on shift tonight holds it, with no permission at all', () => {
    expect(can(onShift(true), canWorkTonight)).toBe(true)
  })

  test('a viewer who is not, and holds no night permission, refuses', () => {
    expect(can(onShift(false), canWorkTonight)).toBe(false)
    expect(can({ ...onShift(false), permissions: ['rota.write'], leadsDepartment: true }, canWorkTonight)).toBe(false)
  })

  test('a guest with no account is refused, not thrown at', () => {
    expect(can(null, canWorkTonight)).toBe(false)
  })
})
