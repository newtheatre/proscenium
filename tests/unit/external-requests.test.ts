import { describe, expect, test } from 'bun:test'
import {
  assignForm, EXTERNAL_REFUSALS, externalRequestForm, judgeExternal, refusalToAct, refuseAssignmentForm,
  saysExternalStatus,
} from '#shared/utils/external-requests'

// C-120's pure half: the lifecycle, and what the union needs before it will answer.

const NOW = new Date('2027-03-01T12:00:00Z')
const CONTEXT = { now: NOW, hasMembership: true, noticeDays: 10, horizonWeeks: 12 }
const span = (days: number): { startsAt: Date, endsAt: Date } => ({
  startsAt: new Date(NOW.getTime() + days * 86_400_000),
  endsAt: new Date(NOW.getTime() + days * 86_400_000 + 7_200_000),
})

describe('what the union needs before it will answer', () => {
  test('a request with enough notice passes', () => {
    expect(judgeExternal(span(20), CONTEXT)).toEqual([])
  })

  // Longer than our own notice window, because a person fills in the form and waits.
  test('too little notice is refused, and says why the union needs it', () => {
    const failures = judgeExternal(span(2), CONTEXT)
    expect(failures.map(one => one.reason)).toContain('SHORT_NOTICE')
    expect(failures[0]!.says).toContain('10 days')
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

  // Opening hours, capacity and an active flag are things the union never tells us, so asking
  // about them would be inventing an answer.
  test('nothing is judged that the union never told us', () => {
    const everything = judgeExternal(span(-2), { ...CONTEXT, hasMembership: false }).map(one => one.reason)
    expect(everything.every(reason => EXTERNAL_REFUSALS.includes(reason))).toBe(true)
    expect(everything).not.toContain('CLOSED')
  })

  // The clocks going forward makes three London days 71 hours, and a window counted in blocks of
  // 24 refused an ask that had the notice the setting names (0014).
  test('notice counts London days, so a clock change does not eat one', () => {
    const clocksChange = {
      ...CONTEXT,
      noticeDays: 3,
      now: new Date('2027-03-26T12:00:00Z'),
    }
    const across = { startsAt: new Date('2027-03-29T10:30:00Z'), endsAt: new Date('2027-03-29T12:30:00Z') }

    expect(judgeExternal(across, clocksChange).map(one => one.reason)).not.toContain('SHORT_NOTICE')
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
