import { describe, expect, test } from 'bun:test'
import { closeFollowUpForm, severityConfigForm } from '#shared/utils/incident-safety'

// E-116's pure validation. What the database holds is proved against the real migrations in
// `tests/integration/incident-safety.test.ts`.

describe('the severity routing form (criterion 1)', () => {
  test('a boolean parses either way', () => {
    expect(severityConfigForm.safeParse({ requiresFollowUp: true }).success).toBe(true)
    expect(severityConfigForm.safeParse({ requiresFollowUp: false }).success).toBe(true)
  })

  test('anything else is refused', () => {
    expect(severityConfigForm.safeParse({ requiresFollowUp: 'yes' }).success).toBe(false)
    expect(severityConfigForm.safeParse({}).success).toBe(false)
  })
})

describe('closing a follow-up names a resolution (criterion 3)', () => {
  test('a resolution note parses', () => {
    expect(closeFollowUpForm.safeParse({ resolutionNote: 'Fire door repaired and signed off by facilities' }).success).toBe(true)
  })

  test('an empty note is refused', () => {
    expect(closeFollowUpForm.safeParse({ resolutionNote: '' }).success).toBe(false)
  })

  test('an overlong note is refused', () => {
    expect(closeFollowUpForm.safeParse({ resolutionNote: 'x'.repeat(2001) }).success).toBe(false)
  })
})
