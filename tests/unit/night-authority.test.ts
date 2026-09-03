import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { ABILITY_PERMISSIONS, can, manageTonight, workTheDoor, workTheTill } from '#shared/utils/abilities'
import { isAuditAction } from '#shared/utils/audit-actions'
import { AUDIT_COVERAGE } from '#shared/utils/audit-coverage'
import { PERMISSION_MAP } from '#shared/utils/roles'
import {
  NIGHT_ROLES,
  NIGHT_ROLE_OFFICER,
  NIGHT_ROLE_PERMISSION,
  OFFICER_BYPASS_ACTION,
  nightAuthorityRefusal,
  officerBypassEntry,
  officerBypassTarget,
} from '#shared/utils/night-authority'
import type { Viewer } from '#shared/utils/abilities'
import type { NightRole } from '#shared/utils/night-authority'

// The officer branch of shift-scoped authority (E-111, 0044). What the guard does with a request
// is pinned end to end in tests/e2e/night-authority.test.ts; this is the vocabulary it stands on.

const NIGHT = '2026-10-17'
const VENUE = 'venue-a'

const viewer = (permissions: Viewer['permissions']): Viewer =>
  ({ id: 'someone', permissions, onShiftTonight: false, leadsDepartment: false, isTrainer: false })

describe('the night roles are the three the rota staffs (E-111 criterion 1)', () => {
  test('there are three, and nothing else is one', () => {
    expect([...NIGHT_ROLES]).toEqual(['DUTY_MANAGER', 'DOOR', 'BAR'])
  })

  test('each stands on its own permission, and no two share one', () => {
    const permissions = NIGHT_ROLES.map(role => NIGHT_ROLE_PERMISSION[role])
    expect(permissions).toEqual(['night.manage', 'night.door', 'night.till'])
    expect(new Set(permissions).size).toBe(NIGHT_ROLES.length)
  })

  // The refusal names an officer role, so it is a defect for that role not to hold the permission.
  test('the officer a refusal names is one that actually holds the permission (0044)', () => {
    for (const role of NIGHT_ROLES) {
      const officer = NIGHT_ROLE_OFFICER[role]
      const held = PERMISSION_MAP[officer.role] as readonly string[]
      expect(`${role}: ${held.includes(NIGHT_ROLE_PERMISSION[role])}`).toBe(`${role}: true`)
      expect(officer.words.length).toBeGreaterThan(4)
    }
  })

  // F-101 criterion 2, and E-111 criterion 1's last sentence: the roles are not interchangeable.
  test('the front of house officer does not open the till, and the bar manager opens nothing else', () => {
    expect(PERMISSION_MAP.FOH_MANAGER).toEqual(['night.door', 'night.manage'])
    expect(PERMISSION_MAP.BAR_MANAGER).toEqual(['night.till'])
  })

  test('an ordinary front of house member holds no bypass at all (0009)', () => {
    expect(PERMISSION_MAP.FRONT_OF_HOUSE).toEqual([])
  })
})

describe('a refusal names what would unlock it (E-111, F-101 criterion 5)', () => {
  test('it is a 403, and it names both the shift and the officer role', () => {
    for (const role of NIGHT_ROLES) {
      const refusal = nightAuthorityRefusal(role)
      expect(refusal.statusCode).toBe(403)
      expect(refusal.statusMessage).toContain(role)
      expect(refusal.statusMessage).toContain(NIGHT_ROLE_OFFICER[role].words)
    }
  })

  // Naming the administrator as the way out is not advice, it is an invitation.
  test('it never suggests becoming an administrator', () => {
    for (const role of NIGHT_ROLES) {
      expect(nightAuthorityRefusal(role).statusMessage).not.toContain('ADMIN')
    }
  })
})

describe('the bypass is recorded once per account, night, venue and role (0044)', () => {
  test('the target carries the whole key', () => {
    expect(officerBypassTarget(NIGHT, VENUE, 'DOOR')).toBe(`night:${NIGHT}:${VENUE}:DOOR`)
  })

  test('a second venue on the same night is a different key', () => {
    expect(officerBypassTarget(NIGHT, 'venue-b', 'DOOR')).not.toBe(officerBypassTarget(NIGHT, VENUE, 'DOOR'))
  })

  test('a second role at the same venue is a different key, and a second night too', () => {
    expect(officerBypassTarget(NIGHT, VENUE, 'BAR')).not.toBe(officerBypassTarget(NIGHT, VENUE, 'DOOR'))
    expect(officerBypassTarget('2026-10-18', VENUE, 'DOOR')).not.toBe(officerBypassTarget(NIGHT, VENUE, 'DOOR'))
  })

  test('a matinee and an evening at one venue are one key, and both are in the detail', () => {
    const entry = officerBypassEntry('actor-1', NIGHT, VENUE, 'DUTY_MANAGER', ['matinee', 'evening'])
    expect(entry.target).toBe(officerBypassTarget(NIGHT, VENUE, 'DUTY_MANAGER'))
    expect(entry.detail).toEqual({ role: 'DUTY_MANAGER', night: NIGHT, venueId: VENUE, performanceIds: ['matinee', 'evening'] })
  })

  test('the action is registered, and the entry names the officer as its actor', () => {
    expect(isAuditAction(OFFICER_BYPASS_ACTION)).toBe(true)
    expect(officerBypassEntry('actor-1', NIGHT, VENUE, 'BAR', ['evening']).actorId).toBe('actor-1')
  })

  // Erasure must never have to reach into the trail (0011), so the entry carries ids and nothing
  // a person could be recognised by.
  test('the detail holds identifiers only, so guardDetail accepts it', () => {
    expect(() => officerBypassEntry('actor-1', NIGHT, VENUE, 'DOOR', ['evening'])).not.toThrow()
  })
})

describe('the abilities are a view over the permissions, never the enforcement (0040, E-111 criterion 5)', () => {
  const ABILITIES = { workTheDoor, workTheTill, manageTonight }

  test('each ability opens to its own permission and to no other', () => {
    const grants: Record<keyof typeof ABILITIES, NightRole> = { workTheDoor: 'DOOR', workTheTill: 'BAR', manageTonight: 'DUTY_MANAGER' }
    for (const [name, ability] of Object.entries(ABILITIES)) {
      const own = NIGHT_ROLE_PERMISSION[grants[name as keyof typeof ABILITIES]]
      expect(`${name}: ${can(viewer([own]), ability)}`).toBe(`${name}: true`)
      const others = NIGHT_ROLES.map(role => NIGHT_ROLE_PERMISSION[role]).filter(permission => permission !== own)
      expect(`${name}: ${can(viewer(others), ability)}`).toBe(`${name}: false`)
    }
  })

  test('a signed-out viewer is refused before the body runs', () => {
    for (const ability of Object.values(ABILITIES)) expect(can(null, ability)).toBe(false)
  })

  test('each is declared in the ability-to-permission map, so the nav test can check it', () => {
    expect(ABILITY_PERMISSIONS.workTheDoor).toBe('night.door')
    expect(ABILITY_PERMISSIONS.workTheTill).toBe('night.till')
    expect(ABILITY_PERMISSIONS.manageTonight).toBe('night.manage')
  })
})

// E-111 criterion 5 is a property of every show-night route, not of the ones that remembered. A
// route that skips the guard fails here rather than at the door on a Friday.
describe('every show-night route checks authority itself (E-111 criterion 5)', () => {
  const NAMESPACES = ['server/api/tonight', 'server/api/till']

  // A namespace nobody has written into yet is empty, not a failure: the bar owns `/api/till`.
  const routes = (): string[] => NAMESPACES.flatMap((directory) => {
    try {
      return [...new Bun.Glob('**/*.ts').scanSync({ cwd: directory, onlyFiles: true })].map(path => join(directory, path)).sort()
    }
    catch {
      return []
    }
  })

  test('the namespaces exist and hold at least one route', () => {
    expect(routes().length).toBeGreaterThan(0)
  })

  test('no route under them resolves authority any other way', async () => {
    const skipped: string[] = []
    for (const route of routes()) {
      const source = await Bun.file(route).text()
      if (!source.includes('requireNightAuthority(')) skipped.push(route)
    }
    expect(skipped).toEqual([])
  })

  test('each is answerable in the audit coverage registry', () => {
    const covered = new Set(AUDIT_COVERAGE.map(entry => entry.route))
    expect(routes().filter(route => !covered.has(route))).toEqual([])
  })
})
