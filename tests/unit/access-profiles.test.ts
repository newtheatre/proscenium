import { describe, expect, test } from 'bun:test'
import {
  ACCESS_FLAGS,
  MAX_COMPANIONS,
  declareAccessProfileForm,
  doorWording,
  effectiveStatus,
} from '#shared/utils/access-profiles'

const NOW = 1_800_000_000

function flags(): Record<(typeof ACCESS_FLAGS)[number], boolean> {
  return Object.fromEntries(ACCESS_FLAGS.map(flag => [flag, false])) as Record<(typeof ACCESS_FLAGS)[number], boolean>
}

describe('what the door may ever see (D-127 criterion 2, criterion 3)', () => {
  const base = { status: 'VERIFIED' as const, consentFohAt: NOW - 100, expiresAt: NOW + 100, fohNote: 'Aisle seat, assistance dog' }

  test('every gate held: the agreed wording', () => {
    expect(doorWording(base, NOW)).toBe('Aisle seat, assistance dog')
  })

  test('no profile at all: nothing', () => {
    expect(doorWording(null, NOW)).toBeNull()
  })

  test('not verified: nothing, whatever else is true', () => {
    expect(doorWording({ ...base, status: 'PENDING' }, NOW)).toBeNull()
  })

  test('no consent: nothing, even once verified', () => {
    expect(doorWording({ ...base, consentFohAt: null }, NOW)).toBeNull()
  })

  test('past its expiry: nothing', () => {
    expect(doorWording({ ...base, expiresAt: NOW - 1 }, NOW)).toBeNull()
  })

  test('never expires: still the wording', () => {
    expect(doorWording({ ...base, expiresAt: null }, NOW)).toBe('Aisle seat, assistance dog')
  })
})

describe('effective status is read at enforcement time, not swept (0009)', () => {
  test('a live verification reads VERIFIED', () => {
    expect(effectiveStatus({ status: 'VERIFIED', expiresAt: NOW + 1 }, NOW)).toBe('VERIFIED')
  })

  test('a lapsed verification reads EXPIRED without the column changing', () => {
    expect(effectiveStatus({ status: 'VERIFIED', expiresAt: NOW - 1 }, NOW)).toBe('EXPIRED')
  })

  test('anything else passes through unchanged', () => {
    for (const status of ['PENDING', 'DECLINED', 'WITHDRAWN'] as const) {
      expect(effectiveStatus({ status, expiresAt: NOW - 1 }, NOW)).toBe(status)
    }
  })
})

describe('the declaration form (D-127 criterion 1)', () => {
  const valid = { flags: flags(), companions: 0, requesterNote: '', accessCardNumber: '', consent: false }

  test('accepts a bare declaration', () => {
    expect(declareAccessProfileForm.parse(valid).companions).toBe(0)
  })

  test('caps companions at two', () => {
    expect(() => declareAccessProfileForm.parse({ ...valid, companions: MAX_COMPANIONS + 1 })).toThrow()
  })

  test('refuses a negative companion count', () => {
    expect(() => declareAccessProfileForm.parse({ ...valid, companions: -1 })).toThrow()
  })

  test('blank text becomes no answer, not an empty one', () => {
    const parsed = declareAccessProfileForm.parse(valid)
    expect(parsed.requesterNote).toBeNull()
    expect(parsed.accessCardNumber).toBeNull()
  })

  test('refuses an unlisted flag', () => {
    expect(() => declareAccessProfileForm.parse({ ...valid, flags: { ...flags(), madeUp: true } })).toThrow()
  })

  test('the agreed wording has no place in a patron\'s own declaration', () => {
    expect(() => declareAccessProfileForm.parse({ ...valid, fohNote: 'not theirs to set' })).toThrow()
  })
})
