import { describe, expect, test } from 'bun:test'
import type { ConfigKey } from '#shared/utils/config'
import {
  CONFIG_KEYS, CONFIG_KEY_NAMES, ENFORCED_KEYS, PEOPLE_KEYS, PRIVILEGED_FLOOR, ROLE_KEYS, TECHNICAL_KEYS, WIDE_BLAST_RADIUS,
  hasDefault, holdsRoles, isConfigKey, isEnforced, isSensitive, isTechnical, isWideBlastRadius, plannedFor,
} from '#shared/utils/config'
import { PERMISSION_MAP, ROLES, isRole } from '#shared/utils/roles'
import type { Permission } from '#shared/utils/roles'

// The keys the workshop register proposes no value for (0019). They ship unset, and the
// features needing them wait rather than guessing. Typed, so a typo here is a build error.
const UNSET: ConfigKey[] = [
  'FIRST_AID_MODULE',
  'MEMBERSHIP_PURCHASE_URL',
  'NIGHT_REPORT_ROLES',
  'RETENTION_FINAL_WARNING_DAYS',
  'RETENTION_WARNING_DAYS',
]

describe('configuration surface (0012, 0019)', () => {
  test('every shipped default validates against its own key schema', () => {
    for (const key of CONFIG_KEY_NAMES) {
      const definition = CONFIG_KEYS[key]
      if (!hasDefault(key)) continue
      const result = definition.schema.safeParse((definition as { default: unknown }).default)
      expect(`${key}: ${result.success}`).toBe(`${key}: true`)
    }
  })

  test('exactly the keys the workshops left open ship unset', () => {
    expect(CONFIG_KEY_NAMES.filter(key => !hasDefault(key)).sort()).toEqual([...UNSET].sort())
  })

  test('the bar tab cap is integer pence, not pounds', () => {
    expect(CONFIG_KEYS.BAR_TAB_CAP_PENCE.default).toBe(2000)
  })

  // Committee-sized by nature is a habit, not a rule: the list is held at the parameter bound so
  // no caller binding one parameter per id can pass D1's limit (0003).
  test('the tab allow-list is bounded at the parameter limit', () => {
    const ids = (count: number): string[] => Array.from({ length: count }, (_, index) => `user-${index}`)
    const schema = CONFIG_KEYS.BAR_AUTHORISED_TAB_HOLDERS.schema

    expect(schema.safeParse(ids(90)).success).toBe(true)
    expect(schema.safeParse(ids(91)).success).toBe(false)
  })

  test('retention ships disarmed', () => {
    expect(CONFIG_KEYS.RETENTION_ARMED.default).toBe(false)
  })

  test('the membership fee is proposed and quoted, but nothing enforces it', () => {
    expect(CONFIG_KEYS.MEMBERSHIP_FEE_PENCE.default).toBe(600)
    expect(isEnforced('MEMBERSHIP_FEE_PENCE')).toBe(false)
    expect(ENFORCED_KEYS).not.toContain('MEMBERSHIP_FEE_PENCE')
  })

  test('an unknown key is not a configuration key', () => {
    expect(isConfigKey('ROOM_MAX_BOOKING_HOURS')).toBe(true)
    expect(isConfigKey('NOT_A_KEY')).toBe(false)
  })

  // A setting is a rule, and a rule is a scalar or a list of them. An object or a keyed record is
  // a table in a blob: no history, no per-row audit, no foreign key (0025).
  test('no setting holds a record rather than a rule', () => {
    const offenders = CONFIG_KEY_NAMES.filter((key) => {
      if (!hasDefault(key)) return false
      const value = (CONFIG_KEYS[key] as { default: unknown }).default
      const parts = Array.isArray(value) ? value : [value]
      return parts.some(part => part !== null && typeof part === 'object')
    })

    expect(offenders).toEqual([])
  })

  test('the entities that were mistaken for settings are gone', () => {
    for (const name of ['PASS_PRODUCTS', 'ROOM_OPENING_HOURS', 'NOTIFICATION_TOPICS']) {
      expect(`${name}: ${isConfigKey(name)}`).toBe(`${name}: false`)
    }
  })

  // Issue 854: cancelling an unpaid booking is free because no money has moved (D-110 criterion 4),
  // so there is no switch for it.
  test('free cancellation of an unpaid booking is not a setting', () => {
    expect(isConfigKey('REFUND_UNPAID_CANCELLATION_FREE')).toBe(false)
  })

  // A-112 (#900): the key's own description names three categories; a role holding one of these
  // entry-level permissions is in one of them, whatever the default list currently says.
  const MONEY_OR_SAFETY_PERMISSIONS: Permission[] = [
    'money.refund', 'finance.read', 'finance.write', 'finance.export', 'finance.reopen',
    'ticketing.export', 'bar.write', 'night.till', 'access.verify',
    'emergency-card.write', 'age-checks.export', 'safety.read', 'safety.write',
  ]

  // The floor is what the settings route refuses to go below (0009, issue 1357), so the rule is
  // pinned on the floor itself and not only on what ships.
  test('every role touching money, personal data or safety records is on the floor', () => {
    const shouldBePrivileged = ROLES.filter(role => PERMISSION_MAP[role].some(permission => MONEY_OR_SAFETY_PERMISSIONS.includes(permission)))
    const floor = new Set<string>(PRIVILEGED_FLOOR)
    expect(shouldBePrivileged.filter(role => !floor.has(role))).toEqual([])
  })

  test('the list ships as its floor', () => {
    expect(CONFIG_KEYS.PRIVILEGED_ROLES.default).toEqual([...PRIVILEGED_FLOOR])
  })

  // A retired role left in the floor reads as a requirement nobody can be subject to (0090).
  test('every role on the floor is a role that can still be granted', () => {
    expect(PRIVILEGED_FLOOR.filter(role => !isRole(role))).toEqual([])
  })

  // Named as well as derived: the safety officer holds safety records, so a stolen password alone
  // must not reach the open-items list (A-112, #1211).
  test('the safety officer needs a second factor', () => {
    expect(PRIVILEGED_FLOOR).toContain('SAFETY_OFFICER')
  })

  // Chosen from the roles, never typed as a code, so a misspelt role cannot be saved (issue 1357).
  test('the list takes only roles that exist, from the role picker', () => {
    expect(CONFIG_KEYS.PRIVILEGED_ROLES.schema.safeParse([...PRIVILEGED_FLOOR, 'NOT_A_ROLE']).success).toBe(false)
    expect(CONFIG_KEYS.PRIVILEGED_ROLES.schema.safeParse([...PRIVILEGED_FLOOR, 'COMMITTEE']).success).toBe(true)
    expect(holdsRoles('PRIVILEGED_ROLES')).toBe(true)
  })
})

// J-105 criterion 5 is trimmed (issue 1357): which keys need a preview is code, reviewed like any
// other change, and never a setting one plain save could empty.
describe('the settings that need a preview and a typed confirmation', () => {
  test('the flag list is not a setting', () => {
    expect(isConfigKey('WIDE_BLAST_RADIUS_KEYS')).toBe(false)
    expect(ENFORCED_KEYS as readonly string[]).not.toContain('WIDE_BLAST_RADIUS_KEYS')
  })

  test('refund policy, retention arming and the second-factor roles are flagged', () => {
    expect([...WIDE_BLAST_RADIUS].sort()).toEqual(['PRIVILEGED_ROLES', 'REFUND_PAID_REQUIRES_MANAGER', 'RETENTION_ARMED'])
    expect(isWideBlastRadius('PRIVILEGED_ROLES')).toBe(true)
    expect(isWideBlastRadius('PASSWORD_MIN_LENGTH')).toBe(false)
  })
})

// How much one run of a sweep does is a limit on the machinery, not a rule anybody works to, so the
// screen folds these away (issue 1357). A cap a person meets, such as the tab cap, is a rule.
describe('the technical limits', () => {
  test('are the batch and sweep caps, and nothing a person meets', () => {
    expect([...TECHNICAL_KEYS].sort()).toEqual([
      'HOLD_RELEASE_BATCH_CAP',
      'PASS_REQUEST_EXPIRE_BATCH_CAP',
      'RETENTION_SWEEP_CAP',
      'RETENTION_WARNING_CAP',
      'ROOM_AVAILABILITY_ROW_BOUND',
      'UNVERIFIED_EXPIRY_CAP',
      'WAITING_LIST_OFFER_BATCH_CAP',
      'WAITING_LIST_PURGE_BATCH_CAP',
    ])
    expect(isTechnical('PUBLIC_ORDER_SEAT_CAP')).toBe(false)
    expect(isTechnical('BAR_TAB_CAP_PENCE')).toBe(false)
  })

  test('every batch cap is one', () => {
    expect(CONFIG_KEY_NAMES.filter(key => key.endsWith('_BATCH_CAP') && !isTechnical(key))).toEqual([])
  })
})

// A-202: the SU's purchase page, never guessed. Only an https address is a place to send somebody.
describe('the membership purchase address (issue 1005)', () => {
  test('ships unset, is not a rule anything enforces, and takes only an https address', () => {
    expect(hasDefault('MEMBERSHIP_PURCHASE_URL')).toBe(false)
    expect(isEnforced('MEMBERSHIP_PURCHASE_URL')).toBe(false)
    const schema = CONFIG_KEYS.MEMBERSHIP_PURCHASE_URL.schema
    expect(schema.safeParse('https://su.example.invalid/shop/new-theatre').success).toBe(true)
    expect(schema.safeParse('http://su.example.invalid/shop').success).toBe(false)
    expect(schema.safeParse('ftp://su.example.invalid/shop').success).toBe(false)
    expect(schema.safeParse('not a url').success).toBe(false)
  })
})

// A switch for a feature nobody has built decides nothing, so the screen names the story instead
// of offering it as live (J-104 criterion 6, issue 1265).
describe('capability switches for features not built', () => {
  test('discount codes name the story that builds them', () => {
    expect(plannedFor('DISCOUNT_CODES_ENABLED')).toEqual({ story: 'D-204', issue: 436 })
  })

  test('a key something enforces is built, so it names no story', () => {
    expect(ENFORCED_KEYS.filter(key => plannedFor(key) !== null)).toEqual([])
    expect(plannedFor('BAR_TAB_CAP_PENCE')).toBeNull()
  })

  test('every story a key waits on is one the backlog has', async () => {
    let backlog = ''
    for await (const file of new Bun.Glob('docs/backlog/*.md').scan('.')) backlog += await Bun.file(file).text()

    const missing = CONFIG_KEY_NAMES
      .map(key => plannedFor(key)?.story)
      .filter((story): story is string => Boolean(story) && !backlog.includes(`## ${story}:`))
    expect(missing).toEqual([])
  })
})

// Issue 1264: people and roles, as two keys, because a key holds scalars and never records (0025).
describe('who may run up a tab', () => {
  test('the roles are a list of roles that exist, starting empty', () => {
    const schema = CONFIG_KEYS.BAR_AUTHORISED_TAB_ROLES.schema
    expect(CONFIG_KEYS.BAR_AUTHORISED_TAB_ROLES.default).toEqual([])
    expect(schema.safeParse(['COMMITTEE', 'TREASURER']).success).toBe(true)
    expect(schema.safeParse(['NOT_A_ROLE']).success).toBe(false)
  })

  test('both keys are read at the charge', () => {
    expect(isEnforced('BAR_AUTHORISED_TAB_HOLDERS')).toBe(true)
    expect(isEnforced('BAR_AUTHORISED_TAB_ROLES')).toBe(true)
  })

  // A role name identifies nobody, so its changes are audited with their values (0024).
  test('the people are sensitive and the roles are not', () => {
    expect(isSensitive('BAR_AUTHORISED_TAB_HOLDERS')).toBe(true)
    expect(isSensitive('BAR_AUTHORISED_TAB_ROLES')).toBe(false)
  })

  // Which keys hold people or roles is said, never guessed from a key's name.
  test('the screen is told which keys hold people and which hold roles', () => {
    expect([...PEOPLE_KEYS]).toEqual(['BAR_AUTHORISED_TAB_HOLDERS'])
    expect([...ROLE_KEYS]).toEqual(['BAR_AUTHORISED_TAB_ROLES', 'PRIVILEGED_ROLES', 'NIGHT_REPORT_ROLES'])
    expect(PEOPLE_KEYS.filter(key => !isSensitive(key))).toEqual([])
  })

  // Naming a role extends credit to everybody holding it, so the setting says so (issue 1264).
  test('the settings text says a role widens who is given credit', () => {
    expect(CONFIG_KEYS.BAR_AUTHORISED_TAB_ROLES.describes).toContain('credit')
    expect(CONFIG_KEYS.BAR_AUTHORISED_TAB_ROLES.describes).toContain('everybody')
  })
})

// Issue 1356, E-124 criterion 3 as amended: the night report goes to roles, which lapse at the
// committee year end on their own, never to a list of addresses somebody must remember to edit.
describe('who the night report goes to', () => {
  test('the standing list is roles, not addresses', () => {
    expect(isConfigKey('NIGHT_REPORT_RECIPIENTS')).toBe(false)
    const schema = CONFIG_KEYS.NIGHT_REPORT_ROLES.schema
    expect(schema.safeParse(['FOH_MANAGER', 'SAFETY_OFFICER']).success).toBe(true)
    expect(schema.safeParse(['duty@newtheatre.org.uk']).success).toBe(false)
  })

  test('the roles are chosen from the roles, read at the send, and audited with their values', () => {
    expect(ROLE_KEYS as readonly string[]).toContain('NIGHT_REPORT_ROLES')
    expect(isEnforced('NIGHT_REPORT_ROLES')).toBe(true)
    expect(isSensitive('NIGHT_REPORT_ROLES')).toBe(false)
  })
})
