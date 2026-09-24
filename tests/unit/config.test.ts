import { describe, expect, test } from 'bun:test'
import type { ConfigKey } from '#shared/utils/config'
import { CONFIG_KEYS, CONFIG_KEY_NAMES, ENFORCED_KEYS, hasDefault, isConfigKey, isEnforced, plannedFor } from '#shared/utils/config'
import { PERMISSION_MAP, ROLES, isRole } from '#shared/utils/roles'
import type { Permission } from '#shared/utils/roles'

// The keys the workshop register proposes no value for (0019). They ship unset, and the
// features needing them wait rather than guessing. Typed, so a typo here is a build error.
const UNSET: ConfigKey[] = [
  'MEMBERSHIP_PURCHASE_URL',
  'NIGHT_REPORT_RECIPIENTS',
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

  // The till's holder picker binds one parameter per id, so the list's own length is what keeps
  // that query inside D1's limit (0003). Committee-sized by nature is a habit, not a rule.
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

  // A-112 (#900): the key's own description names three categories; a role holding one of these
  // entry-level permissions is in one of them, whatever the default list currently says.
  const MONEY_OR_SAFETY_PERMISSIONS: Permission[] = [
    'money.refund', 'finance.read', 'finance.write', 'finance.export', 'finance.reopen',
    'ticketing.export', 'bar.write', 'night.till', 'access.verify',
    'emergency-card.write', 'age-checks.export', 'safety.read', 'safety.write',
  ]

  test('every role touching money, personal data or safety records needs a second factor', () => {
    const shouldBePrivileged = ROLES.filter(role => PERMISSION_MAP[role].some(permission => MONEY_OR_SAFETY_PERMISSIONS.includes(permission)))
    const privileged = new Set<string>(CONFIG_KEYS.PRIVILEGED_ROLES.default)
    expect(shouldBePrivileged.filter(role => !privileged.has(role))).toEqual([])
  })

  // A retired role left in the default reads as a requirement nobody can be subject to (0090).
  test('every privileged role in the default is a role that can still be granted', () => {
    expect(CONFIG_KEYS.PRIVILEGED_ROLES.default.filter(role => !isRole(role))).toEqual([])
  })

  // Named as well as derived: the safety officer holds safety records, so a stolen password alone
  // must not reach the open-items list (A-112, #1211).
  test('the safety officer needs a second factor', () => {
    expect(CONFIG_KEYS.PRIVILEGED_ROLES.default).toContain('SAFETY_OFFICER')
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
