import { describe, expect, test } from 'bun:test'
import {
  lapseNoticeCutoff,
  lapsedBefore,
  roleDigestClaimFor,
  roleExpiryClaimFor,
} from '#shared/utils/role-expiry'
import { ROLES, saysRole } from '#shared/utils/roles'

// A-119: a holder is warned before a grant lapses, once per grant and date, and moving the date
// re-arms the warning. This is the pure half; the sweep itself is tests/e2e/role-lapse.

describe('claim keys (criterion 1)', () => {
  test('a warning claim carries the grant and the expiry it was computed against', () => {
    expect(roleExpiryClaimFor('g1', 1_700_000_000)).toBe('role.expiring:g1:1700000000')
  })

  // Criterion 1's re-arm clause: a claim keyed on the grant alone would find itself already spent
  // and never warn about the new date.
  test('moving the expiry changes the claim, so the new date is warned about again', () => {
    expect(roleExpiryClaimFor('g1', 1_700_000_000)).not.toBe(roleExpiryClaimFor('g1', 1_750_000_000))
  })

  // The trap the coordinator named: one holder's four grants must not spend a single notice.
  test('two grants expiring at the same instant claim separately', () => {
    expect(roleExpiryClaimFor('g1', 1_700_000_000)).not.toBe(roleExpiryClaimFor('g2', 1_700_000_000))
  })

  test('a digest claim is per administrator and per period', () => {
    expect(roleDigestClaimFor('a1', '2026-09')).not.toBe(roleDigestClaimFor('a2', '2026-09'))
    expect(roleDigestClaimFor('a1', '2026-09')).not.toBe(roleDigestClaimFor('a1', '2026-10'))
  })
})

describe('the windows the sweep binds (criteria 1, 4)', () => {
  const now = 1_700_000_000

  test('the notice cutoff is a whole number of days ahead of now', () => {
    expect(lapseNoticeCutoff(now, 14)).toBe(now + 14 * 86_400)
  })

  test('the prune cutoff is a whole number of days behind now', () => {
    expect(lapsedBefore(now, 90)).toBe(now - 90 * 86_400)
  })

  // The two windows must not overlap, or a grant would be warned about and pruned in one run.
  test('nothing is both inside the notice window and old enough to prune', () => {
    expect(lapsedBefore(now, 90)).toBeLessThan(lapseNoticeCutoff(now, 14))
    expect(lapsedBefore(now, 90)).toBeLessThan(now)
  })
})

describe('what a holder reads a role as', () => {
  test('every role has wording of its own, not its identifier', () => {
    for (const role of ROLES) {
      expect(`${role}: ${saysRole(role)}`).not.toBe(`${role}: ${role}`)
    }
  })

  // The vocabulary is provisional until the workshop signs the mapping, so an unregistered role
  // reads as itself rather than throwing.
  test('a role nobody registered reads as itself', () => {
    expect(saysRole('SOMETHING_ELSE')).toBe('SOMETHING_ELSE')
  })
})
