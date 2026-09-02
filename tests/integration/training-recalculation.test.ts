import { describe, expect, test } from 'bun:test'
import { auditEntry } from '#shared/utils/audit'
import {
  previewStatement,
  recalculationStatements,
  restatableCount,
} from '#shared/utils/recalculation'
import { expiryFor } from '#shared/utils/training'
import type { AcademicYear, ExpiryPolicy } from '#shared/utils/training'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// G-124 against the real migrations. The statements are the ones the routes run, so a test proves
// the SQL rather than a rehearsal of it, parameter counts included (0003).

const YEAR: AcademicYear = { boundary: '09-30', carryOverDays: 60 }
const MONTHS: ExpiryPolicy = { expiryMode: 'MONTHS', expiryMonths: 12 }
const ACADEMIC: ExpiryPolicy = { expiryMode: 'ACADEMIC_YEAR', expiryMonths: null }
const NEVER: ExpiryPolicy = { expiryMode: 'NONE', expiryMonths: null }

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function seed(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u1', 'one@example.invalid', 'Ada'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u2', 'two@example.invalid', 'Bea'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'admin', 'admin@example.invalid', 'An Officer'],
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
    ['INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'TECH-111', 'TECH', 'MODULE', 'Working at height'],
    ['INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'TECH-222', 'TECH', 'MODULE', 'Rigging'],
  ])
}

let awards = 0

function award(database: TestDatabase, columns: Record<string, unknown> = {}): string {
  const id = `tr-${++awards}`
  const values: Record<string, unknown> = {
    id,
    user_id: 'u1',
    module_id: 'TECH-111',
    awarded_on: '2026-09-14',
    source: 'SIGNOFF',
    created_at: awards,
    ...columns,
  }
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO training_records (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
  return id
}

const count = (database: TestDatabase, policy: ExpiryPolicy, moduleId = 'TECH-111'): number =>
  rows<{ n: number }>(database, ...boundStatement(database, restatableCount(moduleId, policy, YEAR)))[0]!.n

function run(
  database: TestDatabase,
  policy: ExpiryPolicy,
  expectedCount: number,
  moduleId = 'TECH-111',
): string {
  const entry = auditEntry({
    actorId: 'admin',
    action: 'record.expiry.recalculated',
    target: `module:${moduleId}`,
    detail: { module: moduleId, restated: expectedCount },
  })
  database.batch(recalculationStatements({ moduleId, policy, year: YEAR, expectedCount, entry })
    .map(statement => boundStatement(database, statement)))
  return entry.id
}

const expiryOf = (database: TestDatabase, id: string): string | null =>
  rows<{ expires: string | null }>(database, 'SELECT expires_on expires FROM training_records WHERE id = ?', id)[0]!.expires

const entriesFor = (database: TestDatabase, id: string): number =>
  rows(database, 'SELECT id FROM audit_log WHERE id = ?', id).length

// Criterion 1's other half: the arithmetic the tool restates to is the arithmetic an award stamps.
describe('the SQL expiry agrees with the one that stamped the record (G-123, G-124 criterion 1)', () => {
  const days = [
    '2026-01-01', '2026-01-29', '2026-01-30', '2026-01-31', '2026-02-28',
    '2026-03-31', '2026-05-31', '2026-08-01', '2026-09-29', '2026-09-30',
    '2026-10-01', '2026-12-31', '2027-02-28', '2028-02-29', '2028-08-31',
  ]

  for (const policy of [
    { expiryMode: 'MONTHS', expiryMonths: 1 },
    { expiryMode: 'MONTHS', expiryMonths: 6 },
    { expiryMode: 'MONTHS', expiryMonths: 12 },
    { expiryMode: 'MONTHS', expiryMonths: 120 },
    ACADEMIC,
  ] as ExpiryPolicy[]) {
    const says = policy.expiryMode === 'MONTHS' ? `${policy.expiryMonths} months` : 'the academic year'

    test(`${says} lands on the same day in SQL as in TypeScript`, async () => {
      await withDatabase((database) => {
        seed(database)
        // One person each, or every award but the newest would be superseded by the next.
        for (const [index, day] of days.entries()) {
          database.batch([[
            'INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)',
            `d-${index}`, `d-${index}@example.invalid`, `Person ${index}`,
          ]])
          award(database, { id: `day-${index}`, user_id: `d-${index}`, awarded_on: day, expires_on: null })
        }

        // Everything is restated in one run, because nothing currently carries an expiry at all.
        expect(count(database, policy)).toBe(days.length)
        run(database, policy, days.length)

        for (const [index, day] of days.entries()) {
          expect(`${day}: ${expiryOf(database, `day-${index}`)}`)
            .toBe(`${day}: ${expiryFor(policy, day, YEAR)}`)
        }
      })
    })
  }

  test('a policy of never clears the stamped date rather than leaving it', async () => {
    await withDatabase((database) => {
      seed(database)
      const id = award(database, { expires_on: '2027-09-14' })
      expect(count(database, NEVER)).toBe(1)
      run(database, NEVER, 1)
      expect(expiryOf(database, id)).toBeNull()
    })
  })

  test('a record already on the policy is not affected, so a second run restates nothing', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, { expires_on: null })
      expect(count(database, MONTHS)).toBe(1)
      run(database, MONTHS, 1)
      expect(count(database, MONTHS)).toBe(0)
    })
  })
})

describe('what a run always skips (criterion 4)', () => {
  test('an overridden record is never counted and never restated', async () => {
    await withDatabase((database) => {
      seed(database)
      const overridden = award(database, { expires_on: '2030-01-01', expiry_overridden: 1 })
      const plain = award(database, { user_id: 'u2', expires_on: null })

      expect(count(database, MONTHS)).toBe(1)
      run(database, MONTHS, 1)
      expect(expiryOf(database, overridden)).toBe('2030-01-01')
      expect(expiryOf(database, plain)).toBe('2027-09-14')
    })
  })

  test('a revoked record is never counted and never restated', async () => {
    await withDatabase((database) => {
      seed(database)
      const revoked = award(database, { expires_on: '2030-01-01' })
      database.batch([[
        `UPDATE training_records SET revoked_at = 1789000000, revoked_by = 'admin', revoke_reason = 'Withdrawn' WHERE id = ?`,
        revoked,
      ]])
      award(database, { user_id: 'u2', expires_on: null })

      expect(count(database, MONTHS)).toBe(1)
      run(database, MONTHS, 1)
      expect(expiryOf(database, revoked)).toBe('2030-01-01')
    })
  })

  test('a superseded record is never counted and never restated', async () => {
    await withDatabase((database) => {
      seed(database)
      const older = award(database, { awarded_on: '2025-09-14', expires_on: '2030-01-01' })
      const newer = award(database, { awarded_on: '2026-09-14', expires_on: null })

      expect(count(database, MONTHS)).toBe(1)
      run(database, MONTHS, 1)
      expect(expiryOf(database, older)).toBe('2030-01-01')
      expect(expiryOf(database, newer)).toBe('2027-09-14')
    })
  })

  // Supersession breaks on createdAt, because an award date is a day and not an instant.
  test('two awards on one day leave only the later-written one restatable', async () => {
    await withDatabase((database) => {
      seed(database)
      const first = award(database, { expires_on: '2030-01-01', created_at: 10 })
      const second = award(database, { expires_on: '2030-01-01', created_at: 20 })

      expect(count(database, MONTHS)).toBe(1)
      run(database, MONTHS, 1)
      expect(expiryOf(database, first)).toBe('2030-01-01')
      expect(expiryOf(database, second)).toBe('2027-09-14')
    })
  })

  // A revoked newer award supersedes nothing: it stopped counting the moment it was revoked.
  test('a record whose only successor was revoked is restatable again', async () => {
    await withDatabase((database) => {
      seed(database)
      const older = award(database, { awarded_on: '2025-09-14', expires_on: null })
      const newer = award(database, { awarded_on: '2026-09-14', expires_on: null })
      database.batch([[
        `UPDATE training_records SET revoked_at = 1789000000, revoked_by = 'admin', revoke_reason = 'In error' WHERE id = ?`,
        newer,
      ]])

      expect(count(database, MONTHS)).toBe(1)
      run(database, MONTHS, 1)
      expect(expiryOf(database, older)).toBe('2026-09-14')
    })
  })

  test('another module is out of scope entirely', async () => {
    await withDatabase((database) => {
      seed(database)
      const other = award(database, { module_id: 'TECH-222', expires_on: null })
      award(database, { expires_on: null })

      expect(count(database, MONTHS)).toBe(1)
      run(database, MONTHS, 1)
      expect(expiryOf(database, other)).toBeNull()
    })
  })
})

describe('the count is recomputed at write time (criterion 3)', () => {
  test('an echoed count that matches restates every affected row and writes one entry', async () => {
    await withDatabase((database) => {
      seed(database)
      const a = award(database, { expires_on: null })
      const b = award(database, { user_id: 'u2', expires_on: null })

      const id = run(database, MONTHS, 2)
      expect(entriesFor(database, id)).toBe(1)
      expect(expiryOf(database, a)).toBe('2027-09-14')
      expect(expiryOf(database, b)).toBe('2027-09-14')
    })
  })

  test('an echoed count that is too low writes nothing at all', async () => {
    await withDatabase((database) => {
      seed(database)
      const a = award(database, { expires_on: null })
      const b = award(database, { user_id: 'u2', expires_on: null })

      const id = run(database, MONTHS, 1)
      expect(entriesFor(database, id)).toBe(0)
      expect(expiryOf(database, a)).toBeNull()
      expect(expiryOf(database, b)).toBeNull()
    })
  })

  test('an echoed count that is too high writes nothing at all', async () => {
    await withDatabase((database) => {
      seed(database)
      const only = award(database, { expires_on: null })

      const id = run(database, MONTHS, 5)
      expect(entriesFor(database, id)).toBe(0)
      expect(expiryOf(database, only)).toBeNull()
    })
  })

  test('the entry and the restated dates are one batch, so neither survives without the other (criterion 5)', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, { expires_on: null })
      const id = run(database, MONTHS, 1)

      const restated = rows(database, `SELECT id FROM training_records WHERE expires_on = '2027-09-14'`)
      expect(restated).toHaveLength(1)
      expect(entriesFor(database, id)).toBe(1)

      const [entry] = rows<{ action: string, target: string }>(
        database,
        'SELECT action, target FROM audit_log WHERE id = ?',
        id,
      )
      expect(entry).toMatchObject({ action: 'record.expiry.recalculated', target: 'module:TECH-111' })
    })
  })
})

describe('nothing binds a parameter per row (0003)', () => {
  // The harness refuses a statement over the 90-parameter chunk, which is what D1 would do in
  // production and what an id list built from a preview would produce here.
  test('a run over four hundred records binds the same parameters as a run over one', async () => {
    await withDatabase((database) => {
      seed(database)
      const wanted = 400
      for (let index = 0; index < wanted; index++) {
        database.batch([[
          `INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)`,
          `many-${index}`, `many-${index}@example.invalid`, `Person ${index}`,
        ]])
        award(database, { user_id: `many-${index}`, expires_on: null })
      }

      expect(count(database, MONTHS)).toBe(wanted)

      const entry = auditEntry({
        actorId: 'admin',
        action: 'record.expiry.recalculated',
        target: 'module:TECH-111',
        detail: { module: 'TECH-111', restated: wanted },
      })
      const statements = recalculationStatements({
        moduleId: 'TECH-111',
        policy: MONTHS,
        year: YEAR,
        expectedCount: wanted,
        entry,
      }).map(statement => boundStatement(database, statement))

      for (const [, ...parameters] of statements) expect(parameters.length).toBeLessThanOrEqual(20)
      database.batch(statements)

      expect(count(database, MONTHS)).toBe(0)
      expect(entriesFor(database, entry.id)).toBe(1)
    })
  })

  test('the preview binds the same parameters however many rows it returns', async () => {
    await withDatabase((database) => {
      seed(database)
      for (let index = 0; index < 200; index++) {
        database.batch([[
          `INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)`,
          `p-${index}`, `p-${index}@example.invalid`, `Person ${index}`,
        ]])
        award(database, { user_id: `p-${index}`, expires_on: null })
      }

      const [statement, ...parameters] = boundStatement(
        database,
        previewStatement('TECH-111', MONTHS, YEAR, 200, 0),
      )
      expect(parameters.length).toBeLessThanOrEqual(20)

      const previewed = rows<{ id: string, name: string, expiresOn: string | null, becomes: string }>(
        database,
        statement,
        ...parameters,
      )
      expect(previewed).toHaveLength(200)
      expect(previewed[0]).toMatchObject({ expiresOn: null, becomes: '2027-09-14' })
    })
  })
})
