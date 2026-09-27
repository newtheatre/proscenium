import { describe, expect, test } from 'bun:test'
import { CONFIG_KEY_NAMES } from '#shared/utils/config'
import { configHeading, configUnit, saysConfigValue } from '#shared/utils/config-wording'

// Issue 1357: a setting is headed by what it decides, with its key beneath, and a number carries
// its unit, so nobody reads ROOM_MAX_BOOKING_HOURS to learn how long a booking may be.

describe('a setting is headed in words', () => {
  test('every key has a heading that is not the key', () => {
    const unheaded = CONFIG_KEY_NAMES.filter(key => !/^[A-Z][a-z ]/.test(configHeading(key)) || configHeading(key).includes('_'))
    expect(unheaded).toEqual([])
  })

  test('no two settings share a heading', () => {
    const headings = CONFIG_KEY_NAMES.map(configHeading)
    expect(headings.filter((heading, index) => headings.indexOf(heading) !== index)).toEqual([])
  })

  test('a heading is a short phrase, not a sentence', () => {
    expect(CONFIG_KEY_NAMES.filter(key => configHeading(key).length > 48 || configHeading(key).endsWith('.'))).toEqual([])
  })
})

describe('the unit a number is in', () => {
  test('is read from the key, wherever in the key it is named', () => {
    expect(configUnit('ROOM_MAX_BOOKING_HOURS')).toBe('hours')
    expect(configUnit('HOLD_RELEASE_MINUTES_BEFORE')).toBe('minutes')
    expect(configUnit('EXTERNAL_REQUEST_NOTICE_WORKING_DAYS')).toBe('working days')
    expect(configUnit('REGISTER_NAG_START_DAY')).toBe('days')
    expect(configUnit('ROOM_BOOKING_HORIZON_WEEKS')).toBe('weeks')
    expect(configUnit('ACCESS_PROFILE_VALIDITY_MONTHS')).toBe('months')
    expect(configUnit('RETENTION_GUEST_YEARS')).toBe('years')
    expect(configUnit('BAR_DISCOUNT_MAX_PERCENT')).toBe('%')
  })

  test('a count has none, and money says its own', () => {
    expect(configUnit('PASSWORD_MIN_LENGTH')).toBeNull()
    expect(configUnit('BAR_TAB_CAP_PENCE')).toBeNull()
  })
})

describe('a value read rather than changed', () => {
  test('a number carries its unit, one or many', () => {
    expect(saysConfigValue('ROOM_MIN_BOOKING_MINUTES', 30)).toBe('30 minutes')
    expect(saysConfigValue('ROOM_MAX_BOOKING_HOURS', 1)).toBe('1 hour')
    expect(saysConfigValue('EXTERNAL_REQUEST_NOTICE_WORKING_DAYS', 3)).toBe('3 working days')
    expect(saysConfigValue('BAR_DISCOUNT_MAX_PERCENT', 50)).toBe('50%')
    expect(saysConfigValue('PUBLIC_ORDER_SEAT_CAP', 10)).toBe('10')
  })

  test('money reads in pounds, a switch in words and a day of the year as a day', () => {
    expect(saysConfigValue('BAR_TAB_CAP_PENCE', 2500)).toBe('£25.00')
    expect(saysConfigValue('RETENTION_ARMED', false)).toBe('Off')
    expect(saysConfigValue('SHIFT_CLAIM_AUTO_CONFIRM', true)).toBe('On')
    expect(saysConfigValue('YEAR_START', '08-01')).toBe('1 August')
  })

  test('roles read by title, a list by its items, and an unset key says so', () => {
    expect(saysConfigValue('PRIVILEGED_ROLES', ['TREASURER', 'ADMIN'])).toBe('Treasurer, IT Manager')
    expect(saysConfigValue('BAR_AUTHORISED_TAB_ROLES', [])).toBe('None')
    expect(saysConfigValue('ROOM_PRIORITY_TIERS', ['PRODUCTION', 'GENERAL'])).toBe('PRODUCTION, GENERAL')
    expect(saysConfigValue('NIGHT_REPORT_RECIPIENTS', null)).toBe('Not set')
    expect(saysConfigValue('SHIFT_ELIGIBILITY_BAR_MODULE', 'ADMN-102')).toBe('ADMN-102')
  })
})
