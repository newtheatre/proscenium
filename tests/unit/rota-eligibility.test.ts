import { describe, expect, test } from 'bun:test'
import { eligibilityRefusal, noLongerQualifies } from '#shared/utils/rota-eligibility'

// E-103's safety gate: an empty or unreadable rule refuses eligibility rather than granting it to
// everyone (criterion 4). Held modules come from `modulesHeldBy()`, never a copy (criterion 3).

describe('a role with no configured gate refuses rather than admits everyone (criterion 4)', () => {
  test('no rule for the role is a refusal, not a pass', () => {
    expect(eligibilityRefusal(null, new Set())).not.toBeNull()
  })

  test('a rule naming a module the member holds is not a refusal', () => {
    expect(eligibilityRefusal('fire-safety', new Set(['fire-safety']))).toBeNull()
  })

  test('a rule naming a module the member does not hold refuses, naming it', () => {
    expect(eligibilityRefusal('fire-safety', new Set())).toBe('fire-safety')
  })

  test('holding an unrelated module does not satisfy a different rule', () => {
    expect(eligibilityRefusal('fire-safety', new Set(['first-aid']))).toBe('fire-safety')
  })
})

describe('a queued claim that no longer qualifies says so, and offers its decline reason (E-105 criterion 3)', () => {
  test('the officer reads who lapsed and on what; the claimant reads what to renew', () => {
    expect(noLongerQualifies('DOOR', 'Tomasz Nowak', 'First Aid')).toEqual({
      statusMessage: 'No longer qualifies: Tomasz Nowak no longer holds First Aid, which a door shift needs',
      declineReason: 'You no longer hold First Aid, which a door shift needs. Renew it and claim again.',
    })
  })

  test('an unset rule is named as the committee\'s, never as the claimant\'s lapse (E-103 criterion 4)', () => {
    expect(noLongerQualifies('DUTY_MANAGER', 'Rowan Hale', null)).toEqual({
      statusMessage: 'No longer qualifies: no training is named for duty manager shifts, so nobody can be confirmed on one',
      declineReason: 'Duty manager shifts cannot be confirmed until the committee names the training they need.',
    })
  })
})
