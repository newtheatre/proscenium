import { describe, expect, test } from 'bun:test'
import { daysAfter, londonDay } from '#shared/utils/membership'
import {
  CLAIM_STATUSES,
  DECLINE_REASON_LIMIT,
  canTransition,
  claimDeclineForm,
  membershipClaimForm,
  membershipState,
} from '#shared/utils/membership-claims'
import { MEMBER_NAV } from '#shared/utils/site-nav'

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
  const good = { studentId: '20123456', startsOn: today, term: 1 }

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
    expect(claimDeclineForm.safeParse({ reason: 'x'.repeat(DECLINE_REASON_LIMIT + 1) }).success).toBe(false)
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
  test('Membership is a MEMBER_NAV entry', () => {
    expect(MEMBER_NAV.find(entry => entry.to === '/account/membership')?.label).toBe('Membership')
  })
})
