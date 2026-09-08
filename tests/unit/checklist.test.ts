import { describe, expect, test } from 'bun:test'
import {
  PHASES,
  SYSTEM_CHECKS,
  checklistItemForm,
  exemptForm,
  saysPhase,
  saysSystemCheck,
} from '#shared/utils/checklist'

// E-114's pure vocabulary and validation. What the database holds is proved against the real
// migrations in `tests/integration/checklist.test.ts`.

const base = { venueId: 'venue-1', phase: 'PRE' as const, label: 'Fire exits checked', sort: 1, required: true }

describe('a checklist item names a venue, a phase, a label and an order (criterion 1)', () => {
  test('a hand-ticked item parses with no system check', () => {
    expect(checklistItemForm.safeParse(base).success).toBe(true)
    expect(checklistItemForm.parse(base).systemCheck).toBeNull()
  })

  test('a system-verified item names which check', () => {
    const parsed = checklistItemForm.safeParse({ ...base, systemCheck: 'INCIDENTS_REVIEWED' })
    expect(parsed.success).toBe(true)
  })

  test('an empty label is refused', () => {
    expect(checklistItemForm.safeParse({ ...base, label: '' }).success).toBe(false)
  })

  test('an unknown phase is refused', () => {
    expect(checklistItemForm.safeParse({ ...base, phase: 'MIDNIGHT' }).success).toBe(false)
  })

  test('an unknown system check is refused', () => {
    expect(checklistItemForm.safeParse({ ...base, systemCheck: 'WEATHER_FINE' }).success).toBe(false)
  })
})

describe('the exception path names a reason (criterion 5)', () => {
  test('a reason is required', () => {
    expect(exemptForm.safeParse({ reason: '' }).success).toBe(false)
    expect(exemptForm.safeParse({ reason: 'The bar manager left before signing off; confirmed by phone' }).success).toBe(true)
  })
})

describe('the display wording names every value (0009: no member reads a bare code)', () => {
  test('every phase and system check says something', () => {
    for (const phase of PHASES) expect(saysPhase(phase).length).toBeGreaterThan(2)
    for (const check of SYSTEM_CHECKS) expect(saysSystemCheck(check).length).toBeGreaterThan(2)
  })
})
