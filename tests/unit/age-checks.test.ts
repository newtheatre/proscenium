import { describe, expect, test } from 'bun:test'
import {
  AGE_CHECK_CONSTRAINT_REFUSALS,
  ageCheckConstraintRefusal,
  ageCheckForm,
  inlineAgeCheckForm,
  saysIdType,
  saysOutcome,
  saysRefusalReason,
  supersedeForm,
} from '#shared/utils/age-checks'

// E-118's pure vocabulary and validation. What the database holds is proved against the real
// migrations in `tests/integration/age-checks.test.ts`.

const base = { description: 'Tall man, grey coat', product: null, notes: null, performanceId: null }
const inlineBase = { description: 'Tall man, grey coat', notes: null }

describe('an entry names exactly one side of its outcome (criterion 1)', () => {
  test('accepted names the ID and nothing else', () => {
    const parsed = ageCheckForm.safeParse({ ...base, outcome: 'ACCEPTED', idType: 'PASSPORT' })
    expect(parsed.success).toBe(true)
  })

  test('refused names why and nothing else', () => {
    const parsed = ageCheckForm.safeParse({ ...base, outcome: 'REFUSED', reason: 'NO_ID_SHOWN' })
    expect(parsed.success).toBe(true)
  })

  test('accepted with no ID type is refused', () => {
    expect(ageCheckForm.safeParse({ ...base, outcome: 'ACCEPTED' }).success).toBe(false)
  })

  test('refused with no reason is refused', () => {
    expect(ageCheckForm.safeParse({ ...base, outcome: 'REFUSED' }).success).toBe(false)
  })

  test('accepted carrying a refusal reason is refused', () => {
    expect(ageCheckForm.safeParse({ ...base, outcome: 'ACCEPTED', idType: 'PASSPORT', reason: 'NO_ID_SHOWN' }).success).toBe(false)
  })

  test('refused carrying an ID type is refused', () => {
    expect(ageCheckForm.safeParse({ ...base, outcome: 'REFUSED', reason: 'NO_ID_SHOWN', idType: 'PASSPORT' }).success).toBe(false)
  })
})

describe('an outcome folded into a sale needs the same shape, minus what the till already knows (F-106)', () => {
  test('accepted names the ID, with no performance or product to name', () => {
    const parsed = inlineAgeCheckForm.safeParse({ ...inlineBase, outcome: 'ACCEPTED', idType: 'PASSPORT' })
    expect(parsed.success).toBe(true)
  })

  test('refused names why, the same as standalone', () => {
    expect(inlineAgeCheckForm.safeParse({ ...inlineBase, outcome: 'REFUSED', reason: 'ID_LOOKED_FALSE' }).success).toBe(true)
  })

  test('accepted with no ID type is refused, the same as standalone', () => {
    expect(inlineAgeCheckForm.safeParse({ ...inlineBase, outcome: 'ACCEPTED' }).success).toBe(false)
  })

  test('a performance or a product sent anyway is not part of this shape', () => {
    const parsed = inlineAgeCheckForm.safeParse({ ...inlineBase, outcome: 'ACCEPTED', idType: 'PASSPORT', performanceId: 'perf-1', product: 'Vodka' })
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'performanceId' in parsed.data).toBe(false)
    expect(parsed.success && 'product' in parsed.data).toBe(false)
  })
})

describe('the subject is a description, never a name (criterion 2)', () => {
  test('an empty description is refused', () => {
    expect(ageCheckForm.safeParse({ ...base, outcome: 'ACCEPTED', idType: 'PASSPORT', description: '' }).success).toBe(false)
  })
})

describe('a correction carries the same outcome shape', () => {
  test('accepted names the ID, refused names why', () => {
    expect(supersedeForm.safeParse({ ...base, outcome: 'ACCEPTED', idType: 'DRIVING_LICENCE' }).success).toBe(true)
    expect(supersedeForm.safeParse({ ...base, outcome: 'REFUSED', reason: 'APPEARED_UNDERAGE' }).success).toBe(true)
    expect(supersedeForm.safeParse({ ...base, outcome: 'REFUSED' }).success).toBe(false)
  })
})

describe('the display wording names every value (0009: no member reads a bare code)', () => {
  test('every outcome, ID type and refusal reason says something', () => {
    expect(saysOutcome('ACCEPTED')).toContain('accepted')
    expect(saysOutcome('REFUSED')).toBe('Refused')
    for (const idType of ['PASSPORT', 'DRIVING_LICENCE', 'PASS_CARD', 'OTHER'] as const) {
      expect(saysIdType(idType).length).toBeGreaterThan(2)
    }
    for (const reason of ['NO_ID_SHOWN', 'ID_LOOKED_FALSE', 'APPEARED_UNDERAGE', 'OTHER'] as const) {
      expect(saysRefusalReason(reason).length).toBeGreaterThan(2)
    }
  })
})

describe('a constraint violation is a handled refusal (0047)', () => {
  test('a second correction on the same entry reads as a 409', () => {
    const refusal = ageCheckConstraintRefusal(new Error('UNIQUE constraint failed: age_checks.supersedes_id'))
    expect(refusal?.statusCode).toBe(409)
    expect(refusal?.statusMessage).toContain('correction')
  })

  test('the outcome-shape check reads as a 409', () => {
    expect(ageCheckConstraintRefusal(new Error('CHECK constraint failed: age_checks_outcome_shape'))?.statusCode).toBe(409)
  })

  test('a wrapped D1 message is matched too', () => {
    const wrapped = new Error('D1_ERROR: UNIQUE constraint failed: age_checks.supersedes_id: SQLITE_CONSTRAINT')
    expect(ageCheckConstraintRefusal(wrapped)?.statusCode).toBe(409)
  })

  test('anything unrecognised is not turned into a refusal', () => {
    expect(ageCheckConstraintRefusal(new Error('database is locked'))).toBeNull()
  })

  test('every refusal says something actionable, and none share a violation', () => {
    for (const refusal of AGE_CHECK_CONSTRAINT_REFUSALS) expect(refusal.says.length).toBeGreaterThan(10)
    const violated = AGE_CHECK_CONSTRAINT_REFUSALS.map(refusal => refusal.violated)
    expect(violated.length).toBe(new Set(violated).size)
  })
})
