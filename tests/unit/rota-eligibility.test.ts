import { describe, expect, test } from 'bun:test'
import { barOverrideStands, candidateLock, eligibilityRefusal, noLongerQualifies } from '#shared/utils/rota-eligibility'

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

// 0210: an officer reads why somebody is locked, in the order the confirming write checks.
describe('a locked candidate says why', () => {
  const facts = { role: 'DUTY_MANAGER' as const, moduleId: 'ADMN-201', moduleName: 'Committee Operations', held: new Set(['ADMN-201']), committee: true, onPerformance: false }

  test('somebody who meets every gate is not locked', () => {
    expect(candidateLock(facts)).toBeNull()
  })

  test('training without a committee role names the role, not the training', () => {
    expect(candidateLock({ ...facts, committee: false })).toBe('Needs a committee role')
  })

  test('a missing module is named', () => {
    expect(candidateLock({ ...facts, held: new Set() })).toBe('Needs Committee Operations')
  })

  test('a door shift never asks for a committee role', () => {
    expect(candidateLock({ ...facts, role: 'DOOR', moduleId: 'ADMN-103', moduleName: 'Box Office', held: new Set(['ADMN-103']), committee: false })).toBeNull()
  })

  test('somebody already on the performance is locked for that', () => {
    expect(candidateLock({ ...facts, onPerformance: true })).toBe('Already on this performance')
  })

  test('an unset rule locks everybody and says so', () => {
    expect(candidateLock({ ...facts, moduleId: null })).toBe('No training is named for this role yet')
  })
})

// 0259: through the named show night a committee role stands in for the bar module, and nothing else.
describe('the committee may staff the bar untrained until a named night', () => {
  test('the override stands through its own night and ends after it', () => {
    expect(barOverrideStands('2026-12-13', '2026-11-11')).toBe(true)
    expect(barOverrideStands('2026-12-13', '2026-12-13')).toBe(true)
    expect(barOverrideStands('2026-12-13', '2026-12-14')).toBe(false)
  })

  test('unset, the override is off', () => {
    expect(barOverrideStands(null, '2026-11-11')).toBe(false)
  })

  const bar = { role: 'BAR' as const, moduleId: 'ADMN-102', moduleName: 'Bar Service', held: new Set<string>(), committee: true, onPerformance: false, committeeStandsIn: true }

  test('a committee member without the bar module is not locked while it stands', () => {
    expect(candidateLock(bar)).toBeNull()
  })

  test('nor when no bar module is named at all', () => {
    expect(candidateLock({ ...bar, moduleId: null, moduleName: null })).toBeNull()
  })

  test('somebody off the committee still needs the module', () => {
    expect(candidateLock({ ...bar, committee: false })).toBe('Needs Bar Service')
  })

  test('the performance and the clash still lock a committee member', () => {
    expect(candidateLock({ ...bar, onPerformance: true })).toBe('Already on this performance')
    expect(candidateLock({ ...bar, clashes: true })).toBe('On a shift at another venue at the same time')
  })

  test('the door and the duty manager are untouched', () => {
    expect(candidateLock({ ...bar, role: 'DOOR', moduleId: 'ADMN-103', moduleName: 'Box Office' })).toBe('Needs Box Office')
    expect(candidateLock({ ...bar, role: 'DUTY_MANAGER', moduleId: 'ADMN-201', moduleName: 'Committee Operations' })).toBe('Needs Committee Operations')
  })
})
