import { describe, expect, test } from 'bun:test'
import {
  assignForm, EXTERNAL_REFUSALS, externalRequestForm, judgeExternal, refusalToAct, refuseAssignmentForm,
  saysExternalStatus,
} from '#shared/utils/external-requests'

// C-120's pure half: the lifecycle, and what is needed before anybody will answer.

const NOW = new Date('2027-03-01T12:00:00Z')
// Reaching well past every span below, so only the case under test can refuse (C-121).
const HOLIDAYS = ['2027-03-26', '2027-03-29', '2027-05-03', '2028-01-03']
const CONTEXT = { now: NOW, hasMembership: true, noticeWorkingDays: 3, horizonWeeks: 12, holidays: HOLIDAYS }
const span = (days: number): { startsAt: Date, endsAt: Date } => ({
  startsAt: new Date(NOW.getTime() + days * 86_400_000),
  endsAt: new Date(NOW.getTime() + days * 86_400_000 + 7_200_000),
})

describe('what is needed before anybody will answer', () => {
  test('a request with enough notice passes', () => {
    expect(judgeExternal(span(20), CONTEXT)).toEqual([])
  })

  // Longer than our own notice window, because a person fills in the form and waits.
  test('too little notice is refused, and says why it is needed', () => {
    const failures = judgeExternal(span(1), CONTEXT)
    expect(failures.map(one => one.reason)).toContain('SHORT_NOTICE')
    expect(failures[0]!.says).toContain('3 working days')
  })

  test('beyond the horizon is refused', () => {
    expect(judgeExternal(span(200), CONTEXT).map(one => one.reason)).toContain('BEYOND_HORIZON')
  })

  test('the past is refused', () => {
    expect(judgeExternal(span(-2), CONTEXT).map(one => one.reason)).toContain('IN_THE_PAST')
  })

  test('a lapsed membership is refused', () => {
    expect(judgeExternal(span(20), { ...CONTEXT, hasMembership: false }).map(one => one.reason))
      .toContain('NO_MEMBERSHIP')
  })

  // Opening hours, capacity and an active flag are things nobody tells us about a room we do
  // not manage, so asking about them would be inventing an answer.
  test('nothing is judged that nobody ever told us', () => {
    const everything = judgeExternal(span(-2), { ...CONTEXT, hasMembership: false }).map(one => one.reason)
    expect(everything.every(reason => EXTERNAL_REFUSALS.includes(reason))).toBe(true)
    expect(everything).not.toContain('CLOSED')
  })

  // A weekend and two bank holidays sit between the Thursday and the following Wednesday, so
  // six calendar days are two working ones (C-121).
  test('notice counts working days, so a weekend and a bank holiday do not pay for it', () => {
    const easter = { ...CONTEXT, now: new Date('2027-03-25T12:00:00Z') }
    const after = { startsAt: new Date('2027-03-31T18:00:00Z'), endsAt: new Date('2027-03-31T20:00:00Z') }

    expect(judgeExternal(after, easter).map(one => one.reason)).toContain('SHORT_NOTICE')
  })

  // A booking may fall on a weekend or a bank holiday: only the gap before it is judged.
  test('a booking on a bank holiday is ordinary, given the notice', () => {
    const wellAhead = { ...CONTEXT, now: new Date('2027-04-01T12:00:00Z') }
    const onTheHoliday = { startsAt: new Date('2027-05-03T18:00:00Z'), endsAt: new Date('2027-05-03T20:00:00Z') }

    expect(judgeExternal(onTheHoliday, wellAhead)).toEqual([])
  })

  // A list that has run out must never read as "no holidays": that grants less notice than the
  // rule asks for, which is the failure the rule exists to prevent (0038).
  test('a date past the end of the calendar is refused, not guessed at', () => {
    const short = { ...CONTEXT, holidays: ['2027-03-26'] }
    const failures = judgeExternal(span(30), short)

    expect(failures.map(one => one.reason)).toContain('HOLIDAYS_UNKNOWN')
    expect(failures.map(one => one.reason)).not.toContain('SHORT_NOTICE')
    expect(failures.find(one => one.reason === 'HOLIDAYS_UNKNOWN')!.says).toContain('2027-03-26')
  })

  test('and an empty calendar refuses everything rather than counting every day', () => {
    expect(judgeExternal(span(30), { ...CONTEXT, holidays: [] }).map(one => one.reason))
      .toContain('HOLIDAYS_UNKNOWN')
  })
})

describe('the lifecycle', () => {
  test('a fresh request goes to the union, and nothing else', () => {
    expect(refusalToAct({ status: 'REQUESTED' }, 'submit')).toBeNull()
    expect(refusalToAct({ status: 'REQUESTED' }, 'assign')).toContain('cannot be given a room')
  })

  test('a room is recorded only once the form is in', () => {
    expect(refusalToAct({ status: 'AWAITING_EXTERNAL' }, 'assign')).toBeNull()
    expect(refusalToAct({ status: 'AWAITING_EXTERNAL' }, 'submit')).toContain('cannot be requested')
  })

  // The union moving us room to room after confirming is ordinary, so a confirmed request can
  // still be corrected or sent back; only a settled one cannot.
  test('it can be sent back to the union while it is with them, or after they answered', () => {
    expect(refusalToAct({ status: 'AWAITING_EXTERNAL' }, 'refuse-assignment')).toBeNull()
    expect(refusalToAct({ status: 'CONFIRMED' }, 'refuse-assignment')).toBeNull()
    expect(refusalToAct({ status: 'CANCELLED' }, 'refuse-assignment')).not.toBeNull()
  })

  test('and the room they gave us can be corrected', () => {
    expect(refusalToAct({ status: 'CONFIRMED' }, 'assign')).toBeNull()
    expect(refusalToAct({ status: 'REQUESTED' }, 'assign')).not.toBeNull()
  })

  test('it can be turned down at either open step', () => {
    expect(refusalToAct({ status: 'REQUESTED' }, 'reject')).toBeNull()
    expect(refusalToAct({ status: 'AWAITING_EXTERNAL' }, 'reject')).toBeNull()
  })

  // A confirmed request is still a member's to withdraw; the union is told by a person.
  test('a member may cancel at any open step, and after it is confirmed', () => {
    for (const status of ['REQUESTED', 'AWAITING_EXTERNAL', 'CONFIRMED']) {
      expect(refusalToAct({ status }, 'cancel')).toBeNull()
    }
  })

  test.each(['REJECTED', 'CANCELLED'])('%s is the end of it', (status) => {
    for (const verb of ['submit', 'assign', 'reject', 'cancel'] as const) {
      expect(refusalToAct({ status }, verb)).not.toBeNull()
    }
  })

  test('a refusal says the state in words a member would use', () => {
    expect(saysExternalStatus('AWAITING_EXTERNAL')).toBe('Requested, awaiting a room')
    expect(refusalToAct({ status: 'AWAITING_EXTERNAL' }, 'submit')).toContain('requested, awaiting a room')
  })
})

describe('what an ask and an answer must carry', () => {
  const ask = {
    title: 'Weekly rehearsal',
    purpose: 'REHEARSAL',
    startsAt: '2027-04-01T18:00:00.000Z',
    endsAt: '2027-04-01T20:00:00.000Z',
  }

  test('a preference is optional, because the union decides anyway', () => {
    const parsed = externalRequestForm.safeParse(ask)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.preferredSpaceId).toBeNull()
  })

  test('and may be given', () => {
    expect(externalRequestForm.safeParse({ ...ask, preferredSpaceId: 'portland-b12' }).success).toBe(true)
  })

  test('an ask says what it is for', () => {
    expect(externalRequestForm.safeParse({ ...ask, purpose: '' }).success).toBe(false)
  })

  // Never defaulted: an officer must assert past a room we have marked unsuitable.
  test('an assignment does not override a warning unless it says so', () => {
    const parsed = assignForm.safeParse({ spaceId: 'portland-b12' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.despite).toBe(false)
  })

  test('refusing what the union gave us needs a reason', () => {
    expect(refuseAssignmentForm.safeParse({ spaceId: 'a', reason: 'Fixed table' }).success).toBe(true)
    expect(refuseAssignmentForm.safeParse({ spaceId: 'a', reason: '  ' }).success).toBe(false)
  })

  // The blacklist builds itself as a by-product of the workflow rather than as a separate chore.
  test('and may write the suitability note in the same action', () => {
    const parsed = refuseAssignmentForm.safeParse({
      spaceId: 'a',
      reason: 'Fixed table',
      note: { verdict: 'UNSUITABLE', reason: 'A fixed table fills the room' },
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.note?.verdict).toBe('UNSUITABLE')
  })

  test('a note written that way is never "this was fine"', () => {
    expect(refuseAssignmentForm.safeParse({
      spaceId: 'a', reason: 'x', note: { verdict: 'SUITABLE', reason: 'Fine' },
    }).success).toBe(false)
  })
})
