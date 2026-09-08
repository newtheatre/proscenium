import { describe, expect, test } from 'bun:test'
import {
  INCIDENT_CONSTRAINT_REFUSALS,
  incidentConstraintRefusal,
  incidentForm,
  nearMissForm,
  saysCategory,
  saysSeverity,
  supersedeIncidentForm,
} from '#shared/utils/incidents'

// E-115 and E-117's pure vocabulary and validation. What the database holds is proved against the
// real migrations in `tests/integration/incidents.test.ts`.

const base = { performanceId: 'performance-1', category: 'SAFETY' as const, severity: 'INCIDENT' as const, body: 'A trip hazard on the stairs was flagged and taped off.' }

describe('an entry names a category, a severity and an account (criterion 1)', () => {
  test('a full entry parses', () => {
    expect(incidentForm.safeParse(base).success).toBe(true)
  })

  test('an empty body is refused', () => {
    expect(incidentForm.safeParse({ ...base, body: '' }).success).toBe(false)
  })

  test('an unknown category is refused', () => {
    expect(incidentForm.safeParse({ ...base, category: 'WEATHER' }).success).toBe(false)
  })

  test('happenedAt is optional and defaults to null', () => {
    const parsed = incidentForm.parse(base)
    expect(parsed.happenedAt).toBeNull()
  })

  test('a body past the limit is refused', () => {
    expect(incidentForm.safeParse({ ...base, body: 'x'.repeat(2001) }).success).toBe(false)
  })
})

describe('a correction carries the same shape, without a performance', () => {
  test('a correction parses without performanceId', () => {
    const { performanceId: _performanceId, ...correction } = base
    expect(supersedeIncidentForm.safeParse(correction).success).toBe(true)
  })
})

describe('a near miss is one tap and one sentence, no severity triage (E-117 criterion 1)', () => {
  test('a category and a short sentence is enough', () => {
    expect(nearMissForm.safeParse({ performanceId: 'performance-1', category: 'SAFETY', body: 'Nearly missed a step in the dark.' }).success).toBe(true)
  })

  test('the near-miss body is capped shorter than a full incident', () => {
    expect(nearMissForm.safeParse({ performanceId: 'performance-1', category: 'SAFETY', body: 'x'.repeat(281) }).success).toBe(false)
    expect(incidentForm.safeParse({ ...base, body: 'x'.repeat(281) }).success).toBe(true)
  })

  test('a near miss carries no severity field: the route fixes it', () => {
    expect(Object.keys(nearMissForm.shape)).not.toContain('severity')
  })
})

describe('the display wording names every value (0009: no member reads a bare code)', () => {
  test('every category and severity says something', () => {
    for (const category of ['MEDICAL', 'BEHAVIOUR', 'SAFETY', 'SECURITY', 'PROPERTY', 'OTHER'] as const) {
      expect(saysCategory(category).length).toBeGreaterThan(2)
    }
    for (const severity of ['NOTE', 'NEAR_MISS', 'INCIDENT', 'SERIOUS'] as const) {
      expect(saysSeverity(severity).length).toBeGreaterThan(2)
    }
  })
})

describe('a constraint violation is a handled refusal (0047)', () => {
  test('a second correction on the same entry reads as a 409', () => {
    const refusal = incidentConstraintRefusal(new Error('UNIQUE constraint failed: incidents.supersedes_id'))
    expect(refusal?.statusCode).toBe(409)
    expect(refusal?.statusMessage).toContain('correction')
  })

  test('self-supersede reads as a 409', () => {
    expect(incidentConstraintRefusal(new Error('CHECK constraint failed: incidents_no_self_supersede'))?.statusCode).toBe(409)
  })

  test('a wrapped D1 message is matched too', () => {
    const wrapped = new Error('D1_ERROR: UNIQUE constraint failed: incidents.supersedes_id: SQLITE_CONSTRAINT')
    expect(incidentConstraintRefusal(wrapped)?.statusCode).toBe(409)
  })

  test('anything unrecognised is not turned into a refusal', () => {
    expect(incidentConstraintRefusal(new Error('database is locked'))).toBeNull()
  })

  test('every refusal says something actionable, and none share a violation', () => {
    for (const refusal of INCIDENT_CONSTRAINT_REFUSALS) expect(refusal.says.length).toBeGreaterThan(10)
    const violated = INCIDENT_CONSTRAINT_REFUSALS.map(refusal => refusal.violated)
    expect(violated.length).toBe(new Set(violated).size)
  })
})
