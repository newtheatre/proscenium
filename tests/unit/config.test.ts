import { describe, expect, test } from 'bun:test'
import type { ConfigKey } from '#shared/utils/config'
import { CONFIG_KEYS, CONFIG_KEY_NAMES, hasDefault, isConfigKey } from '#shared/utils/config'
import { PERMISSION_MAP, ROLES } from '#shared/utils/roles'
import type { Permission } from '#shared/utils/roles'

// The keys the workshop register proposes no value for (0019). They ship unset, and the
// features needing them wait rather than guessing. Typed, so a typo here is a build error.
const UNSET: ConfigKey[] = [
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

  test('retention ships disarmed', () => {
    expect(CONFIG_KEYS.RETENTION_ARMED.default).toBe(false)
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
    'emergency-card.write', 'age-checks.export',
  ]

  test('every role touching money, personal data or safety records needs a second factor', () => {
    const shouldBePrivileged = ROLES.filter(role => PERMISSION_MAP[role].some(permission => MONEY_OR_SAFETY_PERMISSIONS.includes(permission)))
    const privileged = new Set<string>(CONFIG_KEYS.PRIVILEGED_ROLES.default)
    expect(shouldBePrivileged.filter(role => !privileged.has(role))).toEqual([])
  })
})
