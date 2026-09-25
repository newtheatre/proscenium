import { describe, expect, test } from 'bun:test'
import {
  ACCESS_FLAGS,
  ACCESS_PROFILE_STATUSES,
  MAX_ACCESS_TICKETS_PER_PERFORMANCE,
  MAX_COMPANIONS,
  accessConsentForm,
  accessEntitlementRefusal,
  changesDeclaration,
  declareAccessProfileForm,
  declineAccessProfileForm,
  doorWording,
  effectiveStatus,
  isEntitledToAccessTickets,
  saveRepends,
  saysAccessProfileStatus,
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

describe('booking eligibility is the door\'s own gates, minus the wording (D-128 criterion 1)', () => {
  const base = { status: 'VERIFIED' as const, consentFohAt: NOW - 100, expiresAt: NOW + 100 }

  test('every gate held: entitled', () => {
    expect(isEntitledToAccessTickets(base, NOW)).toBe(true)
  })

  test('no profile at all: never entitled', () => {
    expect(isEntitledToAccessTickets(null, NOW)).toBe(false)
  })

  test('not verified: never entitled, whatever else is true', () => {
    expect(isEntitledToAccessTickets({ ...base, status: 'PENDING' }, NOW)).toBe(false)
  })

  test('no consent: never entitled, even once verified', () => {
    expect(isEntitledToAccessTickets({ ...base, consentFohAt: null }, NOW)).toBe(false)
  })

  test('past its expiry: never entitled', () => {
    expect(isEntitledToAccessTickets({ ...base, expiresAt: NOW - 1 }, NOW)).toBe(false)
  })

  test('never expires: still entitled', () => {
    expect(isEntitledToAccessTickets({ ...base, expiresAt: null }, NOW)).toBe(true)
  })
})

describe('exceeding the entitlement names the limit, not the profile (D-128 criterion 5)', () => {
  test('within both limits: no refusal', () => {
    expect(accessEntitlementRefusal({ access: 1, companion: 1 }, { access: 0, companion: 0 }, 2)).toBeNull()
  })

  test('a second access ticket, whatever already held plus requested adds to', () => {
    expect(accessEntitlementRefusal({ access: 1, companion: 0 }, { access: 1, companion: 0 }, 2))
      .toBe(`Only ${MAX_ACCESS_TICKETS_PER_PERFORMANCE} access ticket may be held for this performance.`)
  })

  test('a companion past the verified entitlement', () => {
    expect(accessEntitlementRefusal({ access: 0, companion: 2 }, { access: 0, companion: 1 }, 2))
      .toBe('Only 2 companion tickets may be held for this performance.')
  })

  test('a singular companion entitlement reads without the plural', () => {
    expect(accessEntitlementRefusal({ access: 0, companion: 2 }, { access: 0, companion: 0 }, 1))
      .toBe('Only 1 companion ticket may be held for this performance.')
  })

  test('zero companion entitlement refuses the first one requested', () => {
    expect(accessEntitlementRefusal({ access: 0, companion: 1 }, { access: 0, companion: 0 }, 0))
      .toBe('Only 0 companion tickets may be held for this performance.')
  })

  test('what is already held counts even when nothing new is requested for that kind', () => {
    expect(accessEntitlementRefusal({ access: 0, companion: 0 }, { access: 1, companion: 0 }, 2)).toBeNull()
  })
})

describe('a declaration status reads as a sentence, never the raw enum (issue 914)', () => {
  test('every status has its own reading', () => {
    for (const status of ACCESS_PROFILE_STATUSES) {
      expect(saysAccessProfileStatus(status)).not.toBe(status)
      expect(saysAccessProfileStatus(status).length).toBeGreaterThan(0)
    }
  })
})

describe('a save re-pends only on a real change; consent is its own switch (D-127 criterion 7, issue 1334)', () => {
  const saved = {
    flags: { ...flags(), levelAccess: true },
    companions: 1,
    requesterNote: 'Uses a wheelchair',
    accessCardNumber: null,
  }
  const resaved = declareAccessProfileForm.parse({ ...saved, requesterNote: 'Uses a wheelchair', accessCardNumber: '', consent: true })

  test('the same declaration, blank card number and all, is no change', () => {
    expect(changesDeclaration(saved, resaved)).toBe(false)
  })

  test('consent is not part of the declaration: flipping it alone is no change', () => {
    expect(changesDeclaration(saved, { ...resaved, consent: false })).toBe(false)
  })

  test('a need ticked or unticked is a change', () => {
    expect(changesDeclaration(saved, { ...resaved, flags: { ...resaved.flags, crowds: true } })).toBe(true)
    expect(changesDeclaration(saved, { ...resaved, flags: { ...resaved.flags, levelAccess: false } })).toBe(true)
  })

  test('the companions, the note and a card number offered are each a change', () => {
    expect(changesDeclaration(saved, { ...resaved, companions: 2 })).toBe(true)
    expect(changesDeclaration(saved, { ...resaved, requesterNote: 'Uses a wheelchair, and a stick' })).toBe(true)
    expect(changesDeclaration(saved, { ...resaved, requesterNote: null })).toBe(true)
    expect(changesDeclaration(saved, { ...resaved, accessCardNumber: 'NAC0001234' })).toBe(true)
  })

  test('a current profile goes back to the officer only when the declaration changed', () => {
    expect(saveRepends('VERIFIED', false)).toBe(false)
    expect(saveRepends('VERIFIED', true)).toBe(true)
    expect(saveRepends('PENDING', false)).toBe(false)
  })

  test('saving a profile that is not current is the ask to be checked again, changed or not', () => {
    for (const status of ['EXPIRED', 'DECLINED', 'WITHDRAWN'] as const) {
      expect(`${status}: ${saveRepends(status, false)}`).toBe(`${status}: true`)
    }
    expect(saveRepends(null, false)).toBe(true)
  })

  test('the switch carries the consent and nothing else', () => {
    expect(accessConsentForm.parse({ consent: false }).consent).toBe(false)
    expect(() => accessConsentForm.parse({ consent: true, companions: 2 })).toThrow()
  })
})

describe('a decline says why, for the owner alone (issue 1334, 0050)', () => {
  test('the reason is required', () => {
    expect(() => declineAccessProfileForm.parse({})).toThrow()
    expect(() => declineAccessProfileForm.parse({ reason: '  ' })).toThrow()
  })

  test('a reason is trimmed and kept', () => {
    expect(declineAccessProfileForm.parse({ reason: ' The card number did not match ' }).reason).toBe('The card number did not match')
  })
})
