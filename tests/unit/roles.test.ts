import { describe, expect, test } from 'bun:test'
import { committeeYearEnd, fromLondonWallClock } from '#shared/utils/london'
import {
  PERMISSIONS,
  PERMISSION_MAP,
  PROTECTED_ROLE,
  ROLES,
  defaultRoleExpiry,
  isGrantLive,
  isRole,
  permissionsFor,
} from '#shared/utils/roles'
import type { Grant } from '#shared/utils/roles'

const seconds = (at: Date): number => Math.floor(at.getTime() / 1000)

describe('the role vocabulary', () => {
  test('every role has an entry in the permission map', () => {
    expect(Object.keys(PERMISSION_MAP).sort()).toEqual([...ROLES].sort())
  })

  test('every granted permission is a real one', () => {
    for (const [role, held] of Object.entries(PERMISSION_MAP)) {
      for (const permission of held) {
        expect(`${role}: ${PERMISSIONS.includes(permission)}`).toBe(`${role}: true`)
      }
    }
  })

  test('only the protected role can grant or revoke roles', () => {
    for (const [role, held] of Object.entries(PERMISSION_MAP)) {
      if (role === PROTECTED_ROLE) continue
      expect(`${role}: ${held.includes('roles.grant')}`).toBe(`${role}: false`)
    }
    expect(PERMISSION_MAP[PROTECTED_ROLE]).toContain('roles.grant')
  })

  // The import writes the values on the right of this map, so a rename on one side and not the
  // other lands roles the application does not recognise (K-112).
  test('the migration role map targets exactly this vocabulary', async () => {
    const map = await Bun.file('migration/role-map.json').json() as Record<string, string>
    const targets = new Set(Object.entries(map).filter(([key]) => !key.startsWith('_')).map(([, value]) => value))
    for (const target of targets) {
      expect(`${target}: ${isRole(target)}`).toBe(`${target}: true`)
    }
    // Every role should be reachable by import, or the old estate has no way to grant it.
    expect([...ROLES].filter(role => !targets.has(role))).toEqual([])
  })

  // Questions 7 and 8, answered 2 September. Pinned because a role widening is a governance
  // decision, and the map is one line that a later edit could undo without anyone noticing.
  test('the training officer appoints leads and revokes, but never stamps never-expiring', () => {
    const officer = PERMISSION_MAP.TRAINING_MANAGER
    expect(officer).toContain('training.leads')
    expect(officer).toContain('training.revoke')
    expect(officer).not.toContain('training.override')
    expect(PERMISSION_MAP[PROTECTED_ROLE]).toContain('training.override')
  })

  test('an unknown role is not a role', () => {
    expect(isRole('ADMIN')).toBe(true)
    expect(isRole('proscenium:ADMIN')).toBe(false)
    expect(isRole('SUPREME_LEADER')).toBe(false)
  })
})

describe('roles expire at the committee year (0009, 0014)', () => {
  const duringTheYear = fromLondonWallClock(2026, 9, 15, 19, 0)

  test('a grant made in the autumn expires the following 31 July', () => {
    expect(defaultRoleExpiry(duringTheYear)).toBe(seconds(committeeYearEnd(2027)))
  })

  test('a grant is live right up to its last instant and dead after it', () => {
    const expiresAt = defaultRoleExpiry(duringTheYear)
    const grant: Grant = { role: 'ADMIN', expiresAt }
    expect(isGrantLive(grant, new Date(expiresAt * 1000 - 1))).toBe(true)
    expect(isGrantLive(grant, new Date(expiresAt * 1000 + 1000))).toBe(false)
  })

  // Enforced at read time, so nothing has to sweep for a lapsed grant to stop working.
  test('a lapsed grant carries no permissions, with no sweep having run', () => {
    const lapsed: Grant = { role: 'ADMIN', expiresAt: seconds(committeeYearEnd(2026)) }
    const afterwards = fromLondonWallClock(2026, 8, 1, 9, 0)
    expect(permissionsFor([lapsed], afterwards).size).toBe(0)
    expect(permissionsFor([lapsed], fromLondonWallClock(2026, 7, 31, 9, 0)).size).toBeGreaterThan(0)
  })

  test('a permanent grant never lapses', () => {
    expect(isGrantLive({ role: 'ADMIN', expiresAt: null }, fromLondonWallClock(2099, 1, 1))).toBe(true)
  })
})

describe('permissions come from live grants only', () => {
  const now = fromLondonWallClock(2026, 9, 15, 19, 0)

  test('several roles combine', () => {
    const held = permissionsFor([
      { role: 'MANAGER', expiresAt: null },
      { role: 'TRAINING_MANAGER', expiresAt: null },
    ], now)
    expect(held.has('audit.read')).toBe(true)
    expect(held.has('accounts.read')).toBe(true)
    expect(held.has('roles.grant')).toBe(false)
  })

  test('no grants means no permissions', () => {
    expect(permissionsFor([], now).size).toBe(0)
  })

  test('an operational role carries no standing permission at all (0009)', () => {
    for (const role of ['FRONT_OF_HOUSE', 'FOH_MANAGER', 'BOX_OFFICE', 'COMMITTEE'] as const) {
      expect(`${role}: ${permissionsFor([{ role, expiresAt: null }], now).size}`).toBe(`${role}: 0`)
    }
  })
})
