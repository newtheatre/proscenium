import { describe, expect, test } from 'bun:test'
import { eligibilityRefusal } from '#shared/utils/rota-eligibility'

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
