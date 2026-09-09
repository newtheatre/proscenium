import { describe, expect, test } from 'bun:test'
import {
  closeFollowUpStatement,
  openFollowUpsQuery,
  setSeverityConfigStatement,
  severityConfigQuery,
} from '#server/utils/incident-safety'
import { recordIncidentStatement } from '#server/utils/incidents'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// E-116's pure statement and query builders against the real migrations, including the four
// severities the migration itself seeds. `tests/unit/incident-safety.test.ts` pins validation.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statement: SQL): Record<string, unknown>[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows(database, query, ...parameters)
}

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

describe('every severity is seeded closed by the migration (criterion 1)', () => {
  test('all four severities exist, none requiring follow-up', async () => {
    await withDatabase((database) => {
      const found = run(database, severityConfigQuery())
      expect(found).toHaveLength(4)
      expect(found.every(row => row.requiresFollowUp === 0)).toBe(true)
      expect(found.map(row => row.severity).sort()).toEqual(['INCIDENT', 'NEAR_MISS', 'NOTE', 'SERIOUS'])
    })
  })

  test('opting one in is an UPDATE, never a create', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      expect(run(database, setSeverityConfigStatement('SERIOUS', true, officer))).toHaveLength(1)

      const found = run(database, severityConfigQuery())
      expect(found).toHaveLength(4)
      expect(found.find(row => row.severity === 'SERIOUS')?.requiresFollowUp).toBe(1)
    })
  })
})

describe('the open-items list (criterion 2)', () => {
  test('only a routed severity with no closure appears', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      run(database, setSeverityConfigStatement('SERIOUS', true, officer))

      run(database, recordIncidentStatement(officer, tonight.performanceId, 'SAFETY', 'SERIOUS', 'Routed', 1_700_000_000, 'in-serious').statement)
      run(database, recordIncidentStatement(officer, tonight.performanceId, 'SAFETY', 'NOTE', 'Not routed', 1_700_000_000, 'in-note').statement)

      const open = run(database, openFollowUpsQuery())
      expect(open.map(row => row.id)).toEqual(['in-serious'])
    })
  })

  test('a closed item drops off the list', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      run(database, setSeverityConfigStatement('SERIOUS', true, officer))
      run(database, recordIncidentStatement(officer, tonight.performanceId, 'SAFETY', 'SERIOUS', 'Routed', 1_700_000_000, 'in-1').statement)

      expect(run(database, openFollowUpsQuery())).toHaveLength(1)
      run(database, closeFollowUpStatement('in-1', 'Resolved and signed off', officer, 'fc-1'))
      expect(run(database, openFollowUpsQuery())).toHaveLength(0)
    })
  })
})

describe('closing a follow-up (criterion 3)', () => {
  test('a second closure on the same incident matches nothing', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      run(database, recordIncidentStatement(officer, tonight.performanceId, 'SAFETY', 'SERIOUS', 'Routed', 1_700_000_000, 'in-1').statement)

      expect(run(database, closeFollowUpStatement('in-1', 'First resolution', officer, 'fc-1'))).toHaveLength(1)
      expect(run(database, closeFollowUpStatement('in-1', 'Second resolution', officer, 'fc-2'))).toHaveLength(0)
    })
  })

  test('closing a missing incident matches nothing', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      expect(run(database, closeFollowUpStatement('no-such-incident', 'Resolved', officer, 'fc-1'))).toHaveLength(0)
    })
  })

  test('the closure is append-only', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      run(database, recordIncidentStatement(officer, tonight.performanceId, 'SAFETY', 'SERIOUS', 'Routed', 1_700_000_000, 'in-1').statement)
      run(database, closeFollowUpStatement('in-1', 'Resolved', officer, 'fc-1'))

      expect(() => database.batch([['UPDATE incident_followup_closures SET resolution_note = ? WHERE id = ?', 'Changed', 'fc-1']])).toThrow()
      expect(() => database.batch([['DELETE FROM incident_followup_closures WHERE id = ?', 'fc-1']])).toThrow()
    })
  })
})
