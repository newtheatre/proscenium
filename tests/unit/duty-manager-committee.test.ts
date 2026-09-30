import { describe, expect, test } from 'bun:test'
import { committeeShiftRefusal, mostSpecificRefusal } from '#shared/utils/night-authority'
import { forCommitteeMembers, needsCommitteeRole, noLongerOnCommittee } from '#shared/utils/rota-eligibility'
import { saysTrainingAction, trainingAction } from '#shared/utils/training-action'
import type { ActionSession } from '#shared/utils/training-action'

// Decision 0115's words: every refusal names what is missing, a committee role, and never reads
// as a training gap the member could close by booking a session.

describe('which shift roles need a committee role', () => {
  test('the duty manager does, and the door and the bar do not', () => {
    expect(needsCommitteeRole('DUTY_MANAGER')).toBe(true)
    expect(needsCommitteeRole('DOOR')).toBe(false)
    expect(needsCommitteeRole('BAR')).toBe(false)
  })
})

describe('the refusals name the committee role (E-103 criterion 6)', () => {
  test('a claim or an assignment says the shift is for committee members', () => {
    expect(forCommitteeMembers('DUTY_MANAGER', 'you do not')).toBe('A duty manager shift is for committee members, and you do not hold a committee role')
    expect(forCommitteeMembers('DUTY_MANAGER', 'Rowan Hale does not')).toBe('A duty manager shift is for committee members, and Rowan Hale does not hold a committee role')
  })

  test('a queued claim whose claimant has left the committee offers a decline reason saying so (E-105 criterion 3)', () => {
    expect(noLongerOnCommittee('DUTY_MANAGER', 'Rowan Hale')).toEqual({
      statusMessage: 'No longer qualifies: Rowan Hale no longer holds a committee role, which a duty manager shift needs',
      declineReason: 'A duty manager shift is for committee members, and you no longer hold a committee role.',
    })
  })

  test('on the night, the shift is named and so is what it lacks (E-111 criterion 1)', () => {
    expect(committeeShiftRefusal()).toEqual({
      statusCode: 403,
      statusMessage: 'Your duty manager shift tonight opens nothing: a duty manager shift is for committee members, and you do not hold a committee role',
    })
  })

  // A shift the holder cannot use is more specific than having no shift, and less than its hours.
  test('the missing role outranks no shift and a waiting claim, and yields to the shift\'s hours', () => {
    const refusal = (kind: 'OUTSIDE_WINDOW' | 'NO_STANDING' | 'CLAIMED' | 'NO_SHIFT') => ({ kind })
    expect(mostSpecificRefusal([refusal('NO_SHIFT'), refusal('NO_STANDING'), refusal('CLAIMED')])).toEqual(refusal('NO_STANDING'))
    expect(mostSpecificRefusal([refusal('NO_STANDING'), refusal('OUTSIDE_WINDOW')])).toEqual(refusal('OUTSIDE_WINDOW'))
  })
})

describe('a committee-only module offers no action to somebody off the committee (G-105 criterion 8)', () => {
  test('its one action reads as the committee\'s', () => {
    expect(saysTrainingAction({ kind: 'COMMITTEE_ONLY' })).toBe('Only available to the committee')
  })

  const session = (overrides: Partial<ActionSession> = {}): ActionSession => ({
    id: 'session-1', heldOn: '2026-10-12', startsAt: '19:00', place: null, full: false, open: true,
    placed: null, waitlistPosition: null, ...overrides,
  })

  test('an open session is not offered, and neither is the ask', () => {
    expect(trainingAction([session()], false, true)).toEqual({ kind: 'COMMITTEE_ONLY' })
    expect(trainingAction([], false, true)).toEqual({ kind: 'COMMITTEE_ONLY' })
  })

  // A trainer may still have put them on the list (the register ignores the flag), so a place held says so.
  test('a place already held is still said', () => {
    expect(trainingAction([session({ placed: true })], false, true)).toMatchObject({ kind: 'PLACED' })
  })

  test('without the flag, nothing changes', () => {
    expect(trainingAction([session()], false, false)).toMatchObject({ kind: 'SIGN_UP' })
  })
})
