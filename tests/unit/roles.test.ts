import { describe, expect, test } from 'bun:test'
import { committeeYearEnd, fromLondonWallClock } from '#shared/utils/london'
import {
  OPERATIONAL_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_MAP,
  PROTECTED_ROLE,
  ROLES,
  defaultRoleExpiry,
  isGrantLive,
  isRole,
  permissionsFor,
} from '#shared/utils/roles'
import type { Grant, Role } from '#shared/utils/roles'

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
    // Every role should be reachable by import, save the two the old estate never had: no card
    // reader (0044) and no access profiles to verify (D-127), so neither has an old row to map.
    expect([...ROLES].filter(role => !targets.has(role))).toEqual(['BAR_MANAGER', 'ACCESSIBILITY_OFFICER'])
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
    for (const role of ['FRONT_OF_HOUSE', 'COMMITTEE'] as const) {
      expect(`${role}: ${permissionsFor([{ role, expiresAt: null }], now).size}`).toBe(`${role}: 0`)
    }
  })

  // The one named exception, and it stays one: an officer role opens tonight's screens and every
  // use of it is audited (0044). Administering the bar sitting down is not a bypass (F-111).
  test('an officer role carries the night bypass, and its bypass alone', () => {
    const bypass = (role: Role): string[] =>
      [...permissionsFor([{ role, expiresAt: null }], now)].filter(held => OPERATIONAL_PERMISSIONS.includes(held)).sort()
    expect(bypass('FOH_MANAGER')).toEqual(['night.door', 'night.manage'])
    expect(bypass('BAR_MANAGER')).toEqual(['night.till'])
  })

  // The bar manager administers the catalogue and the stock register, as the box office does the
  // programme. Selling over the bar is the till's and still derives from tonight (0009, F-111).
  test('the bar manager holds the bar administration and nothing else standing', () => {
    const held = [...permissionsFor([{ role: 'BAR_MANAGER', expiresAt: null }], now)]
      .filter(permission => !OPERATIONAL_PERMISSIONS.includes(permission)).sort()
    expect(held).toEqual(['bar.read', 'bar.write'])
  })

  // The front of house officer administers the rota in the same way, days ahead and sitting
  // down. It is an ordinary standing permission beside the bypass, never part of it (0046).
  test('the front of house officer holds the rota administration and nothing else standing', () => {
    const held = [...permissionsFor([{ role: 'FOH_MANAGER', expiresAt: null }], now)]
      .filter(permission => !OPERATIONAL_PERMISSIONS.includes(permission)).sort()
    expect(held).toEqual(['rota.read', 'rota.write'])
  })

  // Nothing outside the three named ones may be operational, whatever a role picks up later.
  test('the exception has exactly three members', () => {
    expect([...OPERATIONAL_PERMISSIONS]).toEqual(['night.door', 'night.till', 'night.manage'])
  })

  // The box office administers the programme sitting down. Selling at the door and taking money
  // at the desk are operational and still derive from tonight (0009, D-119).
  test('the box office holds the programme configuration and nothing operational', () => {
    const held = permissionsFor([{ role: 'BOX_OFFICE', expiresAt: null }], now)
    expect([...held].sort()).toEqual(['ticketing.read', 'ticketing.write'])
  })

  // The whole point of the role: a named accessibility officer, never general box office
  // (D-127 criterion 2).
  test('only the accessibility officer holds access.verify, and the box office does not', () => {
    expect([...permissionsFor([{ role: 'ACCESSIBILITY_OFFICER', expiresAt: null }], now)]).toEqual(['access.verify'])
    expect(permissionsFor([{ role: 'BOX_OFFICE', expiresAt: null }], now).has('access.verify')).toBe(false)
    for (const [role, held] of Object.entries(PERMISSION_MAP)) {
      if (role === 'ADMIN' || role === 'ACCESSIBILITY_OFFICER') continue
      expect(`${role}: ${held.includes('access.verify')}`).toBe(`${role}: false`)
    }
  })
})
