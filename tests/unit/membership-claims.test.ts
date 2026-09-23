import { describe, expect, test } from 'bun:test'
import { daysAfter, effectiveTerm, londonDay, membershipState, renewalTerm } from '#shared/utils/membership'
import {
  CLAIM_STATUSES,
  CLAIM_REASON_LIMIT,
  canTransition,
  claimDeclineForm,
  claimsWaitingClaimFor,
  membershipClaimForm,
} from '#shared/utils/membership-claims'
import { MY_NAV } from '#shared/utils/site-nav'

// A-130. A claim is a request to have something bought at the SU written down, so its life is
// short: open, then answered or withdrawn, and never reopened (criterion 1).

describe('the claim state machine (A-130 criterion 1)', () => {
  test('the four states are exactly these', () => {
    expect([...CLAIM_STATUSES]).toEqual(['OPEN', 'RECORDED', 'DECLINED', 'WITHDRAWN'])
  })

  test('an open claim may be recorded, declined or withdrawn', () => {
    expect(canTransition('OPEN', 'RECORDED')).toBe(true)
    expect(canTransition('OPEN', 'DECLINED')).toBe(true)
    expect(canTransition('OPEN', 'WITHDRAWN')).toBe(true)
  })

  test('nothing else moves, including a claim to itself', () => {
    expect(canTransition('OPEN', 'OPEN')).toBe(false)
    for (const settled of ['RECORDED', 'DECLINED', 'WITHDRAWN'] as const) {
      for (const next of CLAIM_STATUSES) expect(canTransition(settled, next)).toBe(false)
    }
  })
})

describe('what a claim carries (A-130 criterion 1)', () => {
  const today = londonDay(new Date())
  const good = { studentId: '20123456', startsOn: today, term: 1 as const }

  test('a student number, a purchase day and a term of one or three years', () => {
    expect(membershipClaimForm.parse(good)).toEqual(good)
    expect(membershipClaimForm.parse({ ...good, term: 3 }).term).toBe(3)
  })

  test('the number is trimmed, and blank is not a number', () => {
    expect(membershipClaimForm.parse({ ...good, studentId: '  20123456 ' }).studentId).toBe('20123456')
    expect(membershipClaimForm.safeParse({ ...good, studentId: '   ' }).success).toBe(false)
    expect(membershipClaimForm.safeParse({ ...good, studentId: 'x'.repeat(33) }).success).toBe(false)
  })

  test('a purchase day in the future is refused, and today is not the future', () => {
    expect(membershipClaimForm.safeParse({ ...good, startsOn: daysAfter(today, 1) }).success).toBe(false)
    expect(membershipClaimForm.safeParse({ ...good, startsOn: daysAfter(today, -30) }).success).toBe(true)
    expect(membershipClaimForm.safeParse({ ...good, startsOn: '14/09/2026' }).success).toBe(false)
    // A day the calendar does not have would roll into March at the first sum.
    expect(membershipClaimForm.safeParse({ ...good, startsOn: '2026-02-31' }).success).toBe(false)
  })

  test('the term is one or three, never anything the SU does not sell', () => {
    for (const term of [0, 2, 4, '1', undefined]) {
      expect(membershipClaimForm.safeParse({ ...good, term }).success).toBe(false)
    }
  })
})

describe('declining needs a reason the member reads (A-130 criterion 3)', () => {
  test('a reason is mandatory and bounded', () => {
    expect(claimDeclineForm.safeParse({}).success).toBe(false)
    expect(claimDeclineForm.safeParse({ reason: 'no' }).success).toBe(false)
    expect(claimDeclineForm.parse({ reason: '  Not on the SU list under that number  ' }).reason)
      .toBe('Not on the SU list under that number')
    expect(claimDeclineForm.safeParse({ reason: 'x'.repeat(CLAIM_REASON_LIMIT + 1) }).success).toBe(false)
  })
})

// The page says one of four things about a membership, and the sums behind them are the
// register's own (0031).
describe('what the page says about a membership (A-130 criterion 4)', () => {
  const term = { startsOn: '2026-09-14', expiresOn: '2027-09-13' }

  test('none, current, in grace, lapsed', () => {
    expect(membershipState(null, '2026-10-01', 14)).toEqual({ kind: 'none' })
    expect(membershipState(term, '2026-10-01', 14)).toEqual({ kind: 'current', until: '2027-09-13' })
    expect(membershipState(term, '2027-09-20', 14)).toEqual({ kind: 'grace', until: '2027-09-27', expiredOn: '2027-09-13' })
    expect(membershipState(term, '2027-10-01', 14)).toEqual({ kind: 'lapsed', expiredOn: '2027-09-13' })
  })
})

describe('the members area reaches it (A-130 criterion 4)', () => {
  test('Membership is a MY_NAV entry', () => {
    expect(MY_NAV.find(entry => entry.to === '/account/membership')?.label).toBe('Membership')
  })
})

// Once a day each, however many times the sweep runs (A-130 criterion 12).
describe('the waiting claims notice is claimed per person per London day', () => {
  test('two officers on one day, and one officer on two days, claim separately', () => {
    expect(claimsWaitingClaimFor('a1', '2026-09-23')).toBe('membership.claims.waiting:a1:2026-09-23')
    expect(claimsWaitingClaimFor('a1', '2026-09-23')).not.toBe(claimsWaitingClaimFor('a2', '2026-09-23'))
    expect(claimsWaitingClaimFor('a1', '2026-09-23')).not.toBe(claimsWaitingClaimFor('a1', '2026-09-24'))
  })
})

// A renewal bought while a term still runs starts where that one ends, so buying early loses no
// days; bought after it ended, it runs from the purchase (A-130 criterion 13, 0031).
describe('a claim extends a running term (A-130 criterion 13)', () => {
  test('nothing held: the term runs from the purchase', () => {
    expect(renewalTerm('2026-09-14', 1, null)).toEqual({ startsOn: '2026-09-14', expiresOn: '2027-09-13', extends: false })
  })

  test('bought inside a running term: the new one starts the day after it ends', () => {
    expect(renewalTerm('2027-08-01', 1, '2027-09-13')).toEqual({ startsOn: '2027-09-14', expiresOn: '2028-09-13', extends: true })
    expect(renewalTerm('2027-08-01', 3, '2027-09-13')).toEqual({ startsOn: '2027-09-14', expiresOn: '2030-09-13', extends: true })
  })

  test('bought on the last day of the term still extends it', () => {
    expect(renewalTerm('2027-09-13', 1, '2027-09-13')).toEqual({ startsOn: '2027-09-14', expiresOn: '2028-09-13', extends: true })
  })

  test('bought after the term ended, even inside grace, runs from the purchase', () => {
    expect(renewalTerm('2027-09-20', 1, '2027-09-13')).toEqual({ startsOn: '2027-09-20', expiresOn: '2028-09-19', extends: false })
  })

  test('a leap day end carries into the first of March', () => {
    expect(renewalTerm('2028-01-10', 1, '2028-02-28').startsOn).toBe('2028-02-29')
  })
})

// A renewal row starts in the future, so the term that decides whether somebody is current is the
// run of back-to-back rows around today, not whichever row ends last (A-130 criterion 13).
describe('the term a person holds reads across a renewal', () => {
  const held = { startsOn: '2026-09-14', expiresOn: '2027-09-13' }
  const renewal = { startsOn: '2027-09-14', expiresOn: '2028-09-13' }

  test('before the renewal starts, the person is current until the renewal ends', () => {
    expect(effectiveTerm([renewal, held], '2027-08-20')).toEqual({ startsOn: '2026-09-14', expiresOn: '2028-09-13' })
    expect(membershipState(effectiveTerm([held, renewal], '2027-08-20'), '2027-08-20', 14)).toEqual({ kind: 'current', until: '2028-09-13' })
  })

  test('a gap splits the run: an old lapsed term does not reach a later purchase', () => {
    const old = { startsOn: '2024-09-01', expiresOn: '2025-08-31' }
    const fresh = { startsOn: '2026-02-01', expiresOn: '2027-01-31' }
    expect(effectiveTerm([old, fresh], '2025-12-01')).toEqual(old)
    expect(effectiveTerm([old, fresh], '2026-03-01')).toEqual(fresh)
  })

  test('overlapping rows merge rather than one hiding the other', () => {
    const first = { startsOn: '2026-09-14', expiresOn: '2027-09-13' }
    const overlap = { startsOn: '2026-10-01', expiresOn: '2027-09-30' }
    expect(effectiveTerm([first, overlap], '2026-09-20')).toEqual({ startsOn: '2026-09-14', expiresOn: '2027-09-30' })
  })

  test('nothing held is nothing', () => {
    expect(effectiveTerm([], '2026-09-20')).toBeNull()
  })
})
