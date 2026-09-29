import { describe, expect, test } from 'bun:test'
import { committeeYearEnd, fromLondonWallClock } from '#shared/utils/london'
import {
  COMMITTEE_ROLES,
  OPERATIONAL_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_MAP,
  PROTECTED_ROLE,
  ROLES,
  defaultRoleExpiry,
  isGrantLive,
  isRole,
  permissionsFor,
  saysRole,
  withCommitteeStanding,
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
    // The posts the old estate never modelled are granted by hand: no president or secretary, no
    // access profiles (D-127) and no treasurer (I-103).
    expect([...ROLES].filter(role => !targets.has(role))).toEqual(['PRESIDENT', 'SECRETARY', 'TREASURER'])
    // Retired and marker roles are decided by hand or skipped, never suggested (A-134 c4, 0112).
    expect(map['proscenium:FRONT_OF_HOUSE']).toBeUndefined()
    expect(map['proscenium:MANAGER']).toBeUndefined()
    expect(map['ticketing:MANAGER']).toBeUndefined()
    expect(map['training:ADMIN']).toBe('THEATRE_MANAGER')
  })

  // Questions 7 and 8, answered 2 September, and 0111. Pinned because a role widening is a
  // governance decision, and the map is one line a later edit could undo unnoticed.
  test('the Theatre Manager appoints leads and revokes, but never stamps never-expiring', () => {
    const officer = PERMISSION_MAP.THEATRE_MANAGER
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
      { role: 'PRESIDENT', expiresAt: null },
      { role: 'THEATRE_MANAGER', expiresAt: null },
    ], now)
    expect(held.has('audit.read')).toBe(true)
    expect(held.has('training.write')).toBe(true)
    expect(held.has('roles.grant')).toBe(false)
  })

  test('no grants means no permissions', () => {
    expect(permissionsFor([], now).size).toBe(0)
  })

  // The season dashboard's aggregates and the cross-season report, nothing else standing
  // (I-105 criterion 5, E-126).
  test('the committee holds the season summary, the cross-season report, and no entry-level drill-down', () => {
    expect([...permissionsFor([{ role: 'COMMITTEE', expiresAt: null }], now)].sort()).toEqual(['finance.summary', 'reports.read'])
  })

  // The one named exception, and it stays one: the one officer role opens tonight's screens and
  // every use of it is audited (0044, 0110). Administering the bar sitting down is not a bypass.
  test('the Front of House Manager carries all three night bypasses, and no other post role any', () => {
    const bypass = (role: Role): string[] =>
      [...permissionsFor([{ role, expiresAt: null }], now)].filter(held => OPERATIONAL_PERMISSIONS.includes(held)).sort()
    expect(bypass('FOH_MANAGER')).toEqual(['night.door', 'night.manage', 'night.till'])
    for (const role of ROLES.filter(role => role !== 'FOH_MANAGER' && role !== PROTECTED_ROLE)) {
      expect(`${role}: ${bypass(role).join(',')}`).toBe(`${role}: `)
    }
  })

  // Nothing outside the three named ones may be operational, whatever a role picks up later.
  test('the exception has exactly three members', () => {
    expect([...OPERATIONAL_PERMISSIONS]).toEqual(['night.door', 'night.till', 'night.manage'])
  })

  test('the box office is no longer a role of its own, so nothing can grant it (A-133 criterion 2)', () => {
    expect(isRole('BOX_OFFICE')).toBe(false)
    expect(permissionsFor([{ role: 'BOX_OFFICE' as Role, expiresAt: null }], now).size).toBe(0)
  })

  test('front of house is no longer a role, and a stored grant naming it grants nothing (A-134 criterion 1)', () => {
    expect(isRole('FRONT_OF_HOUSE')).toBe(false)
    expect(permissionsFor([{ role: 'FRONT_OF_HOUSE' as Role, expiresAt: null }], now).size).toBe(0)
  })
})

// The final vocabulary, whole: one role per post with standing work, the Committee for every other
// post, and the IT Manager's function (0110 to 0113). A change here is a governance decision.
describe('one role per committee post (A-135 criterion 1, 0112)', () => {
  const now = fromLondonWallClock(2026, 10, 15, 19, 0)
  const holds = (role: Role): string[] => [...permissionsFor([{ role, expiresAt: null }], now)].sort()

  test('the vocabulary is exactly seven roles', () => {
    expect([...ROLES]).toEqual(['ADMIN', 'PRESIDENT', 'SECRETARY', 'TREASURER', 'FOH_MANAGER', 'THEATRE_MANAGER', 'COMMITTEE'])
  })

  test('the IT Manager holds every permission (0113)', () => {
    expect(holds('ADMIN')).toEqual([...PERMISSIONS].sort())
  })

  test('the President reads the trail, the open safety items and the season, and writes no money (4.1)', () => {
    expect(holds('PRESIDENT')).toEqual(['accounts.read', 'audit.read', 'audit.write', 'finance.summary', 'reports.read', 'safety.read'])
  })

  test('the Secretary verifies access and reads the roll (4.2, D-127 criterion 2)', () => {
    expect(holds('SECRETARY')).toEqual(['access.verify', 'fellowships.read', 'finance.summary', 'reports.read'])
  })

  test('the Treasurer keeps the record, and reopening a period stays the IT Manager\'s (4.3, I-107 c4)', () => {
    expect(holds('TREASURER')).toEqual(['finance.export', 'finance.read', 'finance.summary', 'finance.write', 'reports.read'])
  })

  test('the Front of House Manager holds sales, the bar and the night (4.4, 0090, 0102, 0110)', () => {
    expect(holds('FOH_MANAGER')).toEqual([
      'age-checks.export', 'bar.read', 'bar.stocktake', 'bar.write', 'board.read', 'board.write', 'checklist.read', 'checklist.write',
      'emergency-card.read', 'emergency-card.write', 'finance.summary', 'money.refund', 'night.door', 'night.manage', 'night.till',
      'reports.read', 'rota.read', 'rota.write', 'ticketing.export', 'ticketing.read', 'ticketing.write',
    ])
  })

  test('the Theatre Manager holds the rooms, safety and the training catalogue (4.11, 0111)', () => {
    expect(holds('THEATRE_MANAGER')).toEqual([
      'accounts.read', 'config.read', 'emergency-card.read', 'emergency-card.write', 'finance.summary', 'members.read', 'reports.read',
      'rooms.read', 'rooms.write', 'safety.read', 'safety.write', 'training.by-address', 'training.leads', 'training.read', 'training.revoke', 'training.write',
    ])
  })

  // The season dashboard's aggregates and the cross-season report, nothing else (I-105 c5, E-126).
  test('the Committee holds the season summary and the cross-season report alone', () => {
    expect(holds('COMMITTEE')).toEqual(['finance.summary', 'reports.read'])
  })

  test('every post role carries the Committee\'s standing, so nobody needs a second grant', () => {
    for (const role of COMMITTEE_ROLES) {
      for (const permission of PERMISSION_MAP.COMMITTEE) {
        expect(`${role}: ${holds(role).includes(permission)}`).toBe(`${role}: true`)
      }
    }
  })

  test('the Committee means every post role and never the IT Manager\'s function', () => {
    expect([...COMMITTEE_ROLES].sort()).toEqual(ROLES.filter(role => role !== 'ADMIN').sort())
    expect(withCommitteeStanding(['COMMITTEE']).sort()).toEqual([...COMMITTEE_ROLES].sort())
    expect(withCommitteeStanding(['TREASURER'])).toEqual(['TREASURER'])
    expect(withCommitteeStanding(['ADMIN', 'COMMITTEE'])).toContain('ADMIN')
  })

  test('each retired role is no longer grantable, grants nothing, and still reads by name', () => {
    const retired = { MANAGER: 'Manager', BAR_MANAGER: 'Bar Manager', SAFETY_OFFICER: 'Safety Officer', TRAINING_MANAGER: 'Training Manager', ACCESSIBILITY_OFFICER: 'Accessibility Officer' }
    for (const [role, words] of Object.entries(retired)) {
      expect(isRole(role)).toBe(false)
      expect(permissionsFor([{ role: role as Role, expiresAt: null }], now).size).toBe(0)
      expect(saysRole(role)).toBe(words)
    }
    expect(saysRole('SECRETARY')).toBe('Secretary and Welfare Officer')
  })
})

// The separations the constitution draws, pinned so a later widening is a decision and not a
// slip (0112, 0115). The IT Manager is excepted: it holds everything by decision (0113).
describe('separations that stand', () => {
  const others = ROLES.filter(role => role !== PROTECTED_ROLE)

  test('no role that takes money also keeps the record (4.3 against 4.4, 7.2)', () => {
    for (const role of others) {
      const held = PERMISSION_MAP[role]
      const takes = held.includes('ticketing.write') || held.includes('bar.write') || held.includes('night.till')
      expect(`${role}: ${takes && held.includes('finance.write')}`).toBe(`${role}: false`)
    }
  })

  test('only the Secretary verifies access, never the box office (D-127 criterion 2, 0050)', () => {
    expect(others.filter(role => PERMISSION_MAP[role].includes('access.verify'))).toEqual(['SECRETARY'])
    expect(PERMISSION_MAP.FOH_MANAGER).not.toContain('access.verify')
  })

  test('approving a comp on any day and narrowing a pass stay the IT Manager\'s (D-117 c1, D-123 c4)', () => {
    expect(others.filter(role => PERMISSION_MAP[role].includes('ticketing.manage'))).toEqual([])
  })

  test('the night\'s own officer does not close the night\'s own incidents (4.4 against 4.11.6)', () => {
    expect(others.filter(role => PERMISSION_MAP[role].includes('safety.write'))).toEqual(['THEATRE_MANAGER'])
  })

  test('the President grants nothing, closes nothing and writes no money', () => {
    for (const permission of ['roles.grant', 'safety.write', 'finance.write', 'money.refund'] as const) {
      expect(PERMISSION_MAP.PRESIDENT).not.toContain(permission)
    }
  })

  test('the Committee is aggregate-only, so it needs no second factor (0044)', () => {
    expect(PERMISSION_MAP.COMMITTEE.every(permission => permission === 'finance.summary' || permission === 'reports.read')).toBe(true)
  })
})
