import { describe, expect, test } from 'bun:test'
import { join, sep } from 'node:path'
import { ABILITY_PERMISSIONS, can, manageTonight, reachConsole, workTheDoor, workTheTill } from '#shared/utils/abilities'
import { isAuditAction } from '#shared/utils/audit-actions'
import { AUDIT_COVERAGE } from '#shared/utils/audit-coverage'
import { OPERATIONAL_PERMISSIONS, PERMISSION_MAP } from '#shared/utils/roles'
import {
  NIGHT_ROLES,
  NIGHT_ROLE_OFFICER,
  NIGHT_ROLE_PERMISSION,
  NIGHT_ROLE_WORDS,
  OFFICER_BYPASS_ACTION,
  bypassIsRecorded,
  nightAuthorityRefusal,
  officerBypassEntry,
  officerBypassTarget,
  outsideWindowRefusal,
  saysOfficerBypass,
} from '#shared/utils/night-authority'
import type { Viewer } from '#shared/utils/abilities'
import type { NightRole } from '#shared/utils/night-authority'

// The officer branch of shift-scoped authority (E-111, 0044). What the guard does with a request
// is pinned end to end in tests/e2e/night-authority.test.ts; this is the vocabulary it stands on.

const NIGHT = '2026-10-17'
const VENUE = 'venue-a'

const viewer = (permissions: Viewer['permissions']): Viewer =>
  ({ id: 'someone', permissions, onShiftTonight: false, leadsDepartment: false, isTrainer: false, membershipState: { kind: 'none' } })

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

  // F-101 criterion 2: the roles are not interchangeable, and the desk work each also does
  // (the bar's catalogue, the rota) is not a bypass, so it is not counted here.
  test('the front of house officer does not open the till, and the bar manager does not open the door', () => {
    const bypass = (role: 'FOH_MANAGER' | 'BAR_MANAGER'): string[] =>
      PERMISSION_MAP[role].filter(permission => OPERATIONAL_PERMISSIONS.includes(permission))
    expect(bypass('FOH_MANAGER')).toEqual(['night.door', 'night.manage'])
    expect(bypass('BAR_MANAGER')).toEqual(['night.till'])
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
      expect(refusal.statusMessage).toContain(NIGHT_ROLE_WORDS[role])
      expect(refusal.statusMessage).toContain(NIGHT_ROLE_OFFICER[role].words)
    }
  })

  // A volunteer is refused in English, not in the vocabulary the rota keys on: "BAR" is a value
  // in a column, and a refusal that quotes it is asking the reader to know the schema.
  test('it never quotes the role as the rota spells it', () => {
    for (const role of NIGHT_ROLES) {
      expect(nightAuthorityRefusal(role).statusMessage).not.toContain(role)
    }
  })

  test('the words for each role read as a shift somebody could go and get', () => {
    expect(NIGHT_ROLE_WORDS.BAR).toBe('a confirmed bar shift')
    expect(NIGHT_ROLE_WORDS.DOOR).toBe('a confirmed door shift')
    expect(NIGHT_ROLE_WORDS.DUTY_MANAGER).toBe('a confirmed duty manager shift')
  })

  // Naming the administrator as the way out is not advice, it is an invitation.
  test('it never suggests becoming an administrator', () => {
    for (const role of NIGHT_ROLES) {
      expect(nightAuthorityRefusal(role).statusMessage).not.toContain('ADMIN')
    }
  })

  // 0077: the bar has a third way in, and a volunteer refused on a hire night needs to hear it.
  test('the bar names a shift on tonight\'s bar opening as well', () => {
    expect(nightAuthorityRefusal('BAR').statusMessage).toContain('bar opening')
    expect(nightAuthorityRefusal('DOOR').statusMessage).not.toContain('bar opening')
    expect(nightAuthorityRefusal('DUTY_MANAGER').statusMessage).not.toContain('bar opening')
  })

  // 0078: a shift is authority inside its own window, so a refusal quotes the window rather than
  // telling somebody holding tonight's shift that they do not hold one.
  test('a shift outside its window is refused in London wall clock, naming the hours', () => {
    const refusal = outsideWindowRefusal('18:00 to 22:30')
    expect(refusal.statusCode).toBe(403)
    expect(refusal.statusMessage).toContain('18:00 to 22:30')
    expect(refusal.statusMessage).not.toContain('bar manager')
  })
})

// 0098: looking is not standing in, so a read records nothing; a write records as 0044 says, and
// the one read that shows what only tonight's team may see asks to be recorded.
describe('the bypass is recorded when the officer acts, not when a screen opens (0098)', () => {
  test('a read records nothing', () => {
    expect(bypassIsRecorded('GET')).toBe(false)
    expect(bypassIsRecorded('HEAD')).toBe(false)
    expect(bypassIsRecorded('get')).toBe(false)
  })

  test('every write records', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(bypassIsRecorded(method)).toBe(true)
  })

  test('a read that asks to be recorded is', () => {
    expect(bypassIsRecorded('GET', true)).toBe(true)
  })

  test('the glance, which reads the agreed access wording, asks to be recorded', async () => {
    const source = await Bun.file('server/api/tonight/duty-manager.get.ts').text()
    expect(source).toContain('{ recordsRead: true }')
  })

  test('the role check the hub makes records nothing, since it is a read', async () => {
    const source = await Bun.file('server/api/tonight/authority.get.ts').text()
    expect(source).not.toContain('recordsRead')
  })
})

describe('the night report says who stood in for which role, and beside what (0098, E-123)', () => {
  test('an officer with no confirmed shift of that role is said plainly', () => {
    expect(saysOfficerBypass({ role: 'DOOR', officerName: 'Fen Foh', confirmedShift: false }))
      .toBe('Door: Fen Foh stood in by officer role, with no confirmed door shift')
  })

  test('an officer beside a confirmed shift is said so, since that is a rota question of its own', () => {
    expect(saysOfficerBypass({ role: 'DUTY_MANAGER', officerName: 'Fen Foh', confirmedShift: true }))
      .toBe('Duty manager: Fen Foh stood in by officer role, beside a confirmed duty manager shift')
  })

  test('an officer whose account has gone is still a bypass, named as an officer', () => {
    expect(saysOfficerBypass({ role: 'BAR', officerName: null, confirmedShift: false }))
      .toBe('Bar: an officer stood in by officer role, with no confirmed bar shift')
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

  // The console admits somebody who holds administrative standing, and the bypass is not that:
  // an officer sent to `/admin` would find every screen on it answering 403 (0040, 0044).
  test('an officer holding the bypass and nothing else does not reach the console', () => {
    expect(can(viewer([...OPERATIONAL_PERMISSIONS]), reachConsole)).toBe(false)
    expect(can(viewer(['night.door', 'audit.read']), reachConsole)).toBe(true)
    expect(can(viewer([]), reachConsole)).toBe(false)
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
      // Posix separators, because the registries these are compared against are written with
      // them and `join` answers backslashes on Windows.
      return [...new Bun.Glob('**/*.ts').scanSync({ cwd: directory, onlyFiles: true })]
        .map(path => join(directory, path).split(sep).join('/')).sort()
    }
    catch {
      return []
    }
  })

  test('the namespaces exist and hold at least one route', () => {
    expect(routes().length).toBeGreaterThan(0)
  })

  // requireAnyNightAuthority is the multi-role form (E-118 criterion 4) and closerFor is the till
  // close's, shared so a preview cannot drift from the write; all three reach the same guard.
  const GUARDS = ['requireNightAuthority(', 'requireAnyNightAuthority(', 'closerFor(']

  // The one route that cannot resolve night authority, because it exists to answer the question
  // the guard asks when it refuses: which venue. It returns venue names and nothing else (0077).
  const WITHOUT_AUTHORITY: Record<string, string> = {
    'server/api/till/venues.get.ts': 'names the venues a caller may open a till at, which is what a request naming none is refused for',
  }

  test('no route under them resolves authority any other way', async () => {
    const skipped: string[] = []
    for (const route of routes()) {
      if (WITHOUT_AUTHORITY[route]) continue
      const source = await Bun.file(route).text()
      if (!GUARDS.some(guard => source.includes(guard))) skipped.push(route)
    }
    expect(skipped).toEqual([])
  })

  // An exemption is a decision somebody made, so it names a route that is actually there.
  test('every exempted route exists, so the list cannot outlive what it excuses', () => {
    expect(Object.keys(WITHOUT_AUTHORITY).filter(route => !routes().includes(route))).toEqual([])
  })

  // A named guard is only a guard while it holds one: without this, moving a route's authority
  // behind a helper would be a way to lose it rather than a way to share it.
  test('the shared closerFor resolves night authority itself', async () => {
    const source = await Bun.file('server/utils/till-close.ts').text()
    expect(source.includes('requireNightAuthority(')).toBe(true)
  })

  test('each is answerable in the audit coverage registry', () => {
    const covered = new Set(AUDIT_COVERAGE.map(entry => entry.route))
    expect(routes().filter(route => !covered.has(route))).toEqual([])
  })
})
