import { describe, expect, test } from 'bun:test'
import { join, sep } from 'node:path'
import { ABILITY_PERMISSIONS, can, manageTonight, reachConsole, workTheDoor, workTheTill } from '#shared/utils/abilities'
import { isAuditAction } from '#shared/utils/audit-actions'
import { AUDIT_COVERAGE } from '#shared/utils/audit-coverage'
import { OPERATIONAL_PERMISSIONS, PERMISSION_MAP, saysRole } from '#shared/utils/roles'
import {
  CLAIM_CONFIRMER,
  NIGHT_ROLES,
  NIGHT_ROLE_OFFICER,
  NIGHT_ROLE_PERMISSION,
  NIGHT_ROLE_WORDS,
  OFFICER_BYPASS_ACTION,
  bypassIsRecorded,
  claimedShiftRefusal,
  mostSpecificRefusal,
  nightAuthorityRefusal,
  officerBypassEntry,
  officerBypassTarget,
  outsideWindowRefusal,
  recordsReadFor,
  saysOfficerBypass,
} from '#shared/utils/night-authority'
import type { Viewer } from '#shared/utils/abilities'
import type { NightRefusalKind, NightRole } from '#shared/utils/night-authority'

// The officer branch of shift-scoped authority (E-111, 0044). What the guard does with a request
// is pinned end to end in tests/e2e/night-authority.test.ts; this is the vocabulary it stands on.

const NIGHT = '2026-10-17'
const VENUE = 'venue-a'

const viewer = (permissions: Viewer['permissions']): Viewer =>
  ({ id: 'someone', permissions, onShiftTonight: false, leadsDepartment: false, isTrainer: false, keepsBarTab: false, membershipState: { kind: 'none' } })

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

  // A volunteer's night comes from a shift, never a role, so only the officers hold a bypass (0009, A-134).
  test('no role but the two officers and the IT Manager holds a bypass', () => {
    const holders = Object.entries(PERMISSION_MAP)
      .filter(([, held]) => held.some(permission => OPERATIONAL_PERMISSIONS.includes(permission)))
      .map(([role]) => role)
    expect(holders.sort()).toEqual(['ADMIN', 'BAR_MANAGER', 'FOH_MANAGER'])
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

  // A claim waiting for an officer is not a shift, but it is not nothing either: the refusal says
  // so and names who confirms it (E-112 criterion 2, E-104, issue 1303).
  test('a claimed shift is refused as claimed, naming who confirms it', () => {
    for (const role of NIGHT_ROLES) {
      const refusal = claimedShiftRefusal(role)
      expect(refusal.statusCode).toBe(403)
      expect(refusal.statusMessage).toContain('claimed')
      expect(refusal.statusMessage).toContain('not confirmed')
      expect(refusal.statusMessage).toContain(saysRole(CLAIM_CONFIRMER))
      expect(refusal.statusMessage).not.toContain(role)
    }
    expect(claimedShiftRefusal('DOOR').statusMessage)
      .toBe('Your door shift tonight is claimed, not confirmed yet: the Front of House Manager confirms it on the rota')
  })

  test('whoever the claimed refusal names can confirm a claim (E-105)', () => {
    expect(PERMISSION_MAP[CLAIM_CONFIRMER] as readonly string[]).toContain('rota.write')
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

  // The hub polls the same route for the house, so only the glance's request for the wording records.
  test('the glance\'s request for the access wording records, and only it decrypts', async () => {
    const route = await Bun.file('server/api/tonight/duty-manager.get.ts').text()
    expect(route).toContain('{ recordsRead: withAccess }')
    expect(route).toContain('tonightView(performanceId, withAccess)')
    expect(await Bun.file('server/utils/tonight-house.ts').text()).toContain('withAccess ? accessTonight(performanceId)')
    expect(route).not.toContain('z.coerce.boolean')
    expect(await Bun.file('app/pages/tonight/glance.vue').text()).toContain('{ query: { access: 1 } }')
    expect(await Bun.file('app/pages/tonight/index.vue').text()).not.toContain('access: 1')
  })

  test('the role check the hub makes records nothing, since it is a read', async () => {
    const source = await Bun.file('server/api/tonight/authority.get.ts').text()
    expect(source).not.toContain('recordsRead')
  })

  // The house route serves the door and the bar the same view, so it records by the role that
  // resolved: the wording it asked for is decrypted for the door and the duty manager alone.
  test('recordsRead may name the roles whose read decrypts, and nothing is recorded by default', () => {
    expect(recordsReadFor(undefined, 'DOOR')).toBe(false)
    expect(recordsReadFor(true, 'BAR')).toBe(true)
    const onlyTheDoor = (role: NightRole): boolean => role === 'DOOR'
    expect(recordsReadFor(onlyTheDoor, 'DOOR')).toBe(true)
    expect(recordsReadFor(onlyTheDoor, 'BAR')).toBe(false)
  })

  test('the house route records an officer only for the read that decrypts access wording', async () => {
    const route = await Bun.file('server/api/tonight/house.get.ts').text()
    expect(route).toContain('{ recordsRead: role => Boolean(asked) && seesAccessTonight(role) }')
    expect(route).toContain('tonightView(performanceId, withAccess)')
    const guard = await Bun.file('server/utils/night-authority.ts').text()
    expect(guard.match(/recordsReadFor\(options\.recordsRead, /g)?.length).toBe(2)
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

// A screen more than one role reaches shows the refusal about the caller's own position, never
// merely the last role asked (E-111, issue 1303).
describe('the most specific refusal wins across several roles (E-111)', () => {
  const refusal = (kind: NightRefusalKind, role: NightRole) => ({ kind, role })

  test('the hours of a shift held beat anything else', () => {
    expect(mostSpecificRefusal([refusal('NO_SHIFT', 'DUTY_MANAGER'), refusal('CLAIMED', 'DOOR'), refusal('OUTSIDE_WINDOW', 'BAR')]))
      .toEqual(refusal('OUTSIDE_WINDOW', 'BAR'))
  })

  test('a refusal about the request or an officer\'s standing beats a claim, and a claim beats no shift', () => {
    expect(mostSpecificRefusal([refusal('CLAIMED', 'DOOR'), refusal('ASKED', 'DUTY_MANAGER')])).toEqual(refusal('ASKED', 'DUTY_MANAGER'))
    expect(mostSpecificRefusal([refusal('NO_SHIFT', 'DUTY_MANAGER'), refusal('CLAIMED', 'DOOR'), refusal('NO_SHIFT', 'BAR')]))
      .toEqual(refusal('CLAIMED', 'DOOR'))
  })

  test('among equals the first role asked wins, and nothing is nothing', () => {
    expect(mostSpecificRefusal([refusal('NO_SHIFT', 'DUTY_MANAGER'), refusal('NO_SHIFT', 'BAR')])).toEqual(refusal('NO_SHIFT', 'DUTY_MANAGER'))
    expect(mostSpecificRefusal([])).toBeUndefined()
  })
})

describe('several roles at once carry the single-role guard\'s options (0098)', () => {
  test('recordsRead reaches every role tried, so a multi-role read of access wording records', async () => {
    const source = await Bun.file('server/utils/night-authority.ts').text()
    expect(source).toMatch(/export async function requireAnyNightAuthority\([^)]*options: NightAuthorityOptions = \{\}/)
  })

  // An officer on a door shift resolves the log as DOOR, yet the review route still takes their duty
  // manager bypass, so the action follows the layout's check of that role, not the log's answer.
  test('the incident review is offered from the duty manager role check, not from the log\'s one answer', async () => {
    const source = await Bun.file('app/pages/tonight/incidents/index.vue').text()
    expect(source).toContain('nightAuthority.value.roles.includes(\'DUTY_MANAGER\')')
    expect(source).toContain('v-if="offersReview && !entry.reviewed"')
    expect(source).not.toContain('resolvedRole')
  })

  test('the screens more than one role reaches ask once, with no role, and show what comes back', async () => {
    for (const page of ['app/pages/tonight/incidents/index.vue', 'app/pages/tonight/age-checks/index.vue']) {
      const source = await Bun.file(page).text()
      expect(source).not.toContain('for (const role of NIGHT_ROLES)')
      expect(source).toContain('askNightAuthority(\'ANY\')')
    }
    // With no role the route itself ranks the refusals (issue 1411); `ANY` is that question.
    expect(await Bun.file('app/composables/useNightShell.ts').text()).toContain('{ query: role === \'ANY\' ? {} : { role } }')
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

  // requireAnyNightAuthority is the multi-role form (E-118 criterion 4), closerFor the till close's,
  // barAuthorityFor a till charge's answer and barOfficerFor its ended nights' half (F-102.5).
  const GUARDS = ['requireNightAuthority(', 'requireAnyNightAuthority(', 'closerFor(', 'barAuthorityFor(', 'barOfficerFor(']

  // Routes that refuse nobody on night authority: the till's venue picker answers the question the
  // guard asks when it refuses (0077), and the emergency card is every signed-in account's (E-113).
  const WITHOUT_AUTHORITY: Record<string, string> = {
    'server/api/till/venues.get.ts': 'names the venues a caller may open a till at, which is what a request naming none is refused for',
    'server/api/tonight/emergency.get.ts': 'serves every venue\'s card to anyone signed in; nightAuthorityIfAny only adds the duty manager numbers (A-114)',
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

// A screen that answers anyone signed in and only adds what tonight's team may see asks whether
// the caller has authority without paying for the refusal it would discard (issue 1310 review).
describe('the non-throwing authority probe', () => {
  const guard = (): Promise<string> => Bun.file('server/utils/night-authority.ts').text()
  const body = (source: string, name: string): string => {
    const start = source.indexOf(`export async function ${name}(`)
    return source.slice(start, source.indexOf('\n}\n', start))
  }

  test('the probe and the guard try the same steps in the same order, through one function', async () => {
    const source = await guard()
    expect(body(source, 'requireAnyNightAuthority')).toContain('await firstAuthority(')
    expect(body(source, 'nightAuthorityIfAny')).toContain('await firstAuthority(')
  })

  // A fault is not a refusal: thrown, so a phone keeps the numbers it last had rather than a 200
  // without them overwriting its copy (A-114, E-113 criterion 2).
  test('the probe answers null for a refusal, works out none, and throws a fault', async () => {
    const probe = body(await guard(), 'nightAuthorityIfAny')
    expect(probe).not.toContain('shiftRefusal(')
    expect(probe).not.toContain('mostSpecificRefusal(')
    expect(probe).toContain('>= 500')
    expect(probe).toContain('return null')
  })

  test('the emergency card asks the probe rather than catching the guard\'s refusal', async () => {
    const route = await Bun.file('server/api/tonight/emergency.get.ts').text()
    expect(route).toContain('nightAuthorityIfAny(event, [\'DUTY_MANAGER\', \'DOOR\', \'BAR\'], { venueId })')
    expect(route).not.toContain('requireAnyNightAuthority(')
    expect(route).not.toContain('statusCode === 403')
  })
})
