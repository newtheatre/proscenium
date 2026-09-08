import { describe, expect, test } from 'bun:test'
import { incidentConstraintRefusal } from '#shared/utils/incidents'
import { recordIncidentStatement, supersedeIncidentStatement } from '#server/utils/incidents'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// E-115 and E-117 against the real migrations. `tests/unit/incidents.test.ts` pins the pure
// validation.

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

function refusalFor(write: () => void): { statusCode: number, statusMessage: string } | null {
  try {
    write()
    return null
  }
  catch (error) {
    const refusal = incidentConstraintRefusal(error)
    if (!refusal) throw error
    return refusal
  }
}

const HAPPENED_AT = 1_700_000_000

describe('logging a fresh entry (E-115 criterion 1)', () => {
  test('an entry writes its category, severity and body', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      const write = recordIncidentStatement(officer, tonight.performanceId, 'SAFETY', 'INCIDENT', 'A trip hazard was taped off.', HAPPENED_AT, 'in-1')

      expect(run(database, write.statement)).toHaveLength(1)
      const [row] = rows<{ category: string, severity: string, body: string, reported_by: string }>(
        database, 'SELECT category, severity, body, reported_by FROM incidents WHERE id = ?', 'in-1')
      expect(row).toMatchObject({ category: 'SAFETY', severity: 'INCIDENT', body: 'A trip hazard was taped off.', reported_by: officer })
    })
  })

  test('a near miss is the same table with severity fixed (E-117 criterion 3)', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      const write = recordIncidentStatement(officer, tonight.performanceId, 'SAFETY', 'NEAR_MISS', 'Nearly missed a step.', HAPPENED_AT, 'in-1')

      expect(run(database, write.statement)).toHaveLength(1)
      const [row] = rows<{ severity: string }>(database, 'SELECT severity FROM incidents WHERE id = ?', 'in-1')
      expect(row?.severity).toBe('NEAR_MISS')
    })
  })

  test('an unknown category is refused at the database: zod keeps the app from ever sending one', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      expect(() => database.batch([[
        `INSERT INTO incidents (id, performance_id, reported_by, category, severity, body, happened_at) VALUES (?, ?, ?, 'WEATHER', 'NOTE', 'Body', ?)`,
        'in-bad', tonight.performanceId, officer, HAPPENED_AT,
      ]])).toThrow()
    })
  })
})

describe('the log is append-only (criterion 3)', () => {
  test('an update is refused at the database', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      run(database, recordIncidentStatement(officer, tonight.performanceId, 'SAFETY', 'INCIDENT', 'Body', HAPPENED_AT, 'in-1').statement)

      expect(() => database.batch([['UPDATE incidents SET body = ? WHERE id = ?', 'Changed', 'in-1']])).toThrow()
    })
  })

  test('a delete is refused at the database', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      run(database, recordIncidentStatement(officer, tonight.performanceId, 'SAFETY', 'INCIDENT', 'Body', HAPPENED_AT, 'in-1').statement)

      expect(() => database.batch([['DELETE FROM incidents WHERE id = ?', 'in-1']])).toThrow()
    })
  })
})

describe('a correction supersedes rather than edits (criterion 3, 0049)', () => {
  test('a correction writes a new row naming what it supersedes', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      run(database, recordIncidentStatement(officer, tonight.performanceId, 'SAFETY', 'INCIDENT', 'Body', HAPPENED_AT, 'in-1').statement)

      const correction = supersedeIncidentStatement(officer, 'in-1', tonight.performanceId, 'SAFETY', 'SERIOUS', 'Corrected body', HAPPENED_AT, 'in-2')
      expect(run(database, correction.statement)).toHaveLength(1)

      const original = rows<{ body: string }>(database, 'SELECT body FROM incidents WHERE id = ?', 'in-1')
      expect(original).toHaveLength(1)
      expect(original[0]?.body).toBe('Body')
      const [row] = rows<{ supersedes_id: string | null }>(database, 'SELECT supersedes_id FROM incidents WHERE id = ?', 'in-2')
      expect(row?.supersedes_id).toBe('in-1')
    })
  })

  test('a second correction on the same entry matches nothing (0049: decided from RETURNING)', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      run(database, recordIncidentStatement(officer, tonight.performanceId, 'SAFETY', 'INCIDENT', 'Body', HAPPENED_AT, 'in-1').statement)
      run(database, supersedeIncidentStatement(officer, 'in-1', tonight.performanceId, 'SAFETY', 'SERIOUS', 'Corrected', HAPPENED_AT, 'in-2').statement)

      const second = supersedeIncidentStatement(officer, 'in-1', tonight.performanceId, 'SAFETY', 'NOTE', 'Second correction', HAPPENED_AT, 'in-3')
      expect(run(database, second.statement)).toHaveLength(0)
      expect(rows(database, 'SELECT id FROM incidents WHERE id = ?', 'in-3')).toHaveLength(0)
    })
  })

  test('correcting a correction is allowed: the chain has more than one link', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      run(database, recordIncidentStatement(officer, tonight.performanceId, 'SAFETY', 'INCIDENT', 'Body', HAPPENED_AT, 'in-1').statement)
      run(database, supersedeIncidentStatement(officer, 'in-1', tonight.performanceId, 'SAFETY', 'SERIOUS', 'Corrected', HAPPENED_AT, 'in-2').statement)

      expect(run(database, supersedeIncidentStatement(officer, 'in-2', tonight.performanceId, 'SAFETY', 'NOTE', 'Third', HAPPENED_AT, 'in-3').statement)).toHaveLength(1)
    })
  })

  test('correcting an entry that does not exist matches nothing', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      expect(run(database, supersedeIncidentStatement(officer, 'no-such-entry', tonight.performanceId, 'SAFETY', 'NOTE', 'Body', HAPPENED_AT, 'in-1').statement)).toHaveLength(0)
    })
  })

  test('the second-line unique index refuses a correction written outside the guarded statement', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      run(database, recordIncidentStatement(officer, tonight.performanceId, 'SAFETY', 'INCIDENT', 'Body', HAPPENED_AT, 'in-1').statement)
      database.batch([[
        `INSERT INTO incidents (id, performance_id, reported_by, category, severity, body, happened_at, supersedes_id)
         VALUES (?, ?, ?, 'SAFETY', 'NOTE', 'First correction', ?, ?)`,
        'in-2', tonight.performanceId, officer, HAPPENED_AT, 'in-1',
      ]])

      const refusal = refusalFor(() => database.batch([[
        `INSERT INTO incidents (id, performance_id, reported_by, category, severity, body, happened_at, supersedes_id)
         VALUES (?, ?, ?, 'SAFETY', 'NOTE', 'Second correction', ?, ?)`,
        'in-3', tonight.performanceId, officer, HAPPENED_AT, 'in-1',
      ]]))
      expect(refusal?.statusCode).toBe(409)
    })
  })

  test('an entry cannot correct itself', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      const refusal = refusalFor(() => database.batch([[
        `INSERT INTO incidents (id, performance_id, reported_by, category, severity, body, happened_at, supersedes_id)
         VALUES (?, ?, ?, 'SAFETY', 'NOTE', 'Body', ?, ?)`,
        'in-1', tonight.performanceId, officer, HAPPENED_AT, 'in-1',
      ]]))
      expect(refusal?.statusCode).toBe(409)
    })
  })
})
