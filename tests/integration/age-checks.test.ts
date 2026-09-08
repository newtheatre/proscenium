import { describe, expect, test } from 'bun:test'
import { ageCheckConstraintRefusal } from '#shared/utils/age-checks'
import { recordAgeCheck, supersedeAgeCheck } from '#server/utils/age-checks'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { AgeCheckInput } from '#shared/utils/age-checks'
import type { SQL } from 'drizzle-orm'

// E-118 against the real migrations. `tests/unit/age-checks.test.ts` pins the pure validation.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statement: SQL): { id: string }[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<{ id: string }>(database, query, ...parameters)
}

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

const accepted: AgeCheckInput = {
  performanceId: null,
  outcome: 'ACCEPTED',
  idType: 'PASSPORT',
  reason: null,
  description: 'Tall man, grey coat',
  product: 'Strongbow',
  notes: null,
}

const refused: AgeCheckInput = {
  performanceId: null,
  outcome: 'REFUSED',
  idType: null,
  reason: 'NO_ID_SHOWN',
  description: 'Short woman, red jacket',
  product: 'Strongbow',
  notes: null,
}

function refusalFor(write: () => void): { statusCode: number, statusMessage: string } | null {
  try {
    write()
    return null
  }
  catch (error) {
    const refusal = ageCheckConstraintRefusal(error)
    if (!refusal) throw error
    return refusal
  }
}

describe('logging a fresh entry (E-118 criterion 1)', () => {
  test('an accepted check writes the ID type and no reason', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const write = recordAgeCheck(officer, accepted, 'ac-1')

      expect(run(database, write.statement)).toHaveLength(1)
      const [row] = rows<{ outcome: string, id_type: string | null, reason: string | null }>(
        database, 'SELECT outcome, id_type, reason FROM age_checks WHERE id = ?', 'ac-1')
      expect(row).toMatchObject({ outcome: 'ACCEPTED', id_type: 'PASSPORT', reason: null })
    })
  })

  test('a refused check writes the reason and no ID type', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const write = recordAgeCheck(officer, refused, 'ac-1')

      expect(run(database, write.statement)).toHaveLength(1)
      const [row] = rows<{ outcome: string, id_type: string | null, reason: string | null }>(
        database, 'SELECT outcome, id_type, reason FROM age_checks WHERE id = ?', 'ac-1')
      expect(row).toMatchObject({ outcome: 'REFUSED', id_type: null, reason: 'NO_ID_SHOWN' })
    })
  })

  test('a check may name tonight\'s performance, or none at all (bar checks outside a show)', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      const write = recordAgeCheck(officer, { ...accepted, performanceId: tonight.performanceId }, 'ac-1')

      expect(run(database, write.statement)).toHaveLength(1)
    })
  })

  test('writing to a table with an unfilled outcome shape fails at the database, not the app', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      const refusal = refusalFor(() => database.batch([[
        `INSERT INTO age_checks (id, checked_by, outcome, description) VALUES (?, ?, 'ACCEPTED', 'Tall man')`,
        'ac-bad', officer,
      ]]))
      expect(refusal?.statusCode).toBe(409)
    })
  })
})

describe('the register is append-only (criterion 3)', () => {
  test('an update is refused at the database', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      run(database, recordAgeCheck(officer, accepted, 'ac-1').statement)

      expect(() => database.batch([['UPDATE age_checks SET description = ? WHERE id = ?', 'Changed', 'ac-1']])).toThrow()
    })
  })

  test('a delete is refused at the database', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      run(database, recordAgeCheck(officer, accepted, 'ac-1').statement)

      expect(() => database.batch([['DELETE FROM age_checks WHERE id = ?', 'ac-1']])).toThrow()
    })
  })
})

describe('a correction supersedes rather than edits (criterion 3, 0049)', () => {
  test('a correction writes a new row naming what it supersedes', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      run(database, recordAgeCheck(officer, accepted, 'ac-1').statement)

      const correction = supersedeAgeCheck(officer, 'ac-1', refused, 'ac-2')
      expect(run(database, correction.statement)).toHaveLength(1)

      const original = rows<{ description: string }>(database, 'SELECT description FROM age_checks WHERE id = ?', 'ac-1')
      expect(original).toHaveLength(1)
      const [row] = rows<{ supersedes_id: string | null }>(database, 'SELECT supersedes_id FROM age_checks WHERE id = ?', 'ac-2')
      expect(row?.supersedes_id).toBe('ac-1')
    })
  })

  test('a second correction on the same entry matches nothing (0049: decided from RETURNING)', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      run(database, recordAgeCheck(officer, accepted, 'ac-1').statement)
      run(database, supersedeAgeCheck(officer, 'ac-1', refused, 'ac-2').statement)

      const second = supersedeAgeCheck(officer, 'ac-1', accepted, 'ac-3')
      expect(run(database, second.statement)).toHaveLength(0)
      expect(rows(database, 'SELECT id FROM age_checks WHERE id = ?', 'ac-3')).toHaveLength(0)
    })
  })

  test('correcting a correction is allowed: the chain has more than one link', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      run(database, recordAgeCheck(officer, accepted, 'ac-1').statement)
      run(database, supersedeAgeCheck(officer, 'ac-1', refused, 'ac-2').statement)

      expect(run(database, supersedeAgeCheck(officer, 'ac-2', accepted, 'ac-3').statement)).toHaveLength(1)
    })
  })

  test('correcting an entry that does not exist matches nothing', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      expect(run(database, supersedeAgeCheck(officer, 'no-such-entry', refused, 'ac-1').statement)).toHaveLength(0)
    })
  })

  test('the second-line unique index refuses a correction written outside the guarded statement', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      run(database, recordAgeCheck(officer, accepted, 'ac-1').statement)
      database.batch([[
        `INSERT INTO age_checks (id, checked_by, outcome, reason, description, supersedes_id)
         VALUES (?, ?, 'REFUSED', 'NO_ID_SHOWN', 'First correction', ?)`,
        'ac-2', officer, 'ac-1',
      ]])

      const refusal = refusalFor(() => database.batch([[
        `INSERT INTO age_checks (id, checked_by, outcome, reason, description, supersedes_id)
         VALUES (?, ?, 'REFUSED', 'NO_ID_SHOWN', 'Second correction', ?)`,
        'ac-3', officer, 'ac-1',
      ]]))
      expect(refusal?.statusCode).toBe(409)
    })
  })

  test('an entry cannot correct itself', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      const refusal = refusalFor(() => database.batch([[
        `INSERT INTO age_checks (id, checked_by, outcome, id_type, description, supersedes_id)
         VALUES (?, ?, 'ACCEPTED', 'PASSPORT', 'Tall man', ?)`,
        'ac-1', officer, 'ac-1',
      ]]))
      expect(refusal?.statusCode).toBe(409)
    })
  })
})
