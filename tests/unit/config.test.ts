import { describe, expect, test } from 'bun:test'
import { CONFIG_KEYS, CONFIG_KEY_NAMES, hasDefault, isConfigKey } from '../../shared/config'

// The keys the workshop register proposes no value for (0019). They ship unset, and the
// features needing them wait rather than guessing.
const UNSET = ['PASS_PRODUCTS', 'ROOM_OPENING_HOURS', 'NIGHT_REPORT_RECIPIENTS']

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
})
