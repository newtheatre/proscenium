import { describe, expect, test } from 'bun:test'
import { closeReadingStatement, closeSessionStatement } from '#server/utils/till'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// Decision 0097 on the real migrations: the till close records the night's reader total in its own
// batch, so the Treasurer resolves a difference rather than retyping the Z (I-104 criterion 2).

const NIGHT = '2026-09-04'

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function insert(database: TestDatabase, table: string, values: Record<string, unknown>): void {
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

function person(database: TestDatabase, suffix: string): string {
  const id = `u-${suffix}`
  insert(database, 'users', { id, email: `person-${suffix}@example.invalid`, name: `Person ${suffix}` })
  return id
}

function session(database: TestDatabase, id: string, opener: string): string {
  const venueId = `venue-${id}`
  insert(database, 'venues', { id: venueId, name: `The House ${id}` })
  insert(database, 'till_sessions', { id, venue_id: venueId, night: NIGHT, opened_by: opener, opened_at: 1000 })
  return id
}

// The route's own batch: the close, its audit row only if the close landed, then the reading.
function close(database: TestDatabase, sessionId: string, auditId: string, closedBy: string, readerPence: number, expectedPence: number, note: string | null = null): void {
  const closing = {
    id: sessionId, night: NIGHT, closedBy, expectedPence, actualZPence: readerPence, variancePence: readerPence - expectedPence, varianceNote: note,
  }
  database.batch([
    boundStatement(database, closeSessionStatement(closing)),
    [`INSERT INTO audit_log (id, actor_id, action, target, detail) SELECT ?, ?, 'bar.till.closed', ?, '{}' WHERE changes() = 1`, auditId, closedBy, `till:${sessionId}`],
    boundStatement(database, closeReadingStatement(closing, { id: `z-${auditId}`, auditId })),
  ])
}

interface Reading {
  id: string
  readerPence: number
  expectedPence: number
  variancePence: number
  enteredBy: string
  note: string | null
  supersedesId: string | null
  tillSessionId: string | null
}

const readings = (database: TestDatabase): Reading[] => rows<Reading>(database, `
  SELECT id, reader_pence AS readerPence, expected_pence AS expectedPence, variance_pence AS variancePence,
         entered_by AS enteredBy, note, supersedes_id AS supersedesId, till_session_id AS tillSessionId
  FROM z_readings ORDER BY rowid
`)

describe('the till close records the night\'s reading (I-104 criterion 2, F-118, 0097)', () => {
  test('the first close of the night records its reader figure, expected figure, note and closer', async () => {
    await withDatabase((database) => {
      const closer = person(database, 'closer')
      session(database, 't-1', closer)

      close(database, 't-1', 'a1', closer, 4690, 4600, 'A tip keyed as a sale')

      expect(readings(database)).toEqual([{
        id: 'z-a1', readerPence: 4690, expectedPence: 4600, variancePence: 90, enteredBy: closer,
        note: 'A tip keyed as a sale', supersedesId: null, tillSessionId: 't-1',
      }])
    })
  })

  test('a close that lost to another records no reading of its own', async () => {
    await withDatabase((database) => {
      const closer = person(database, 'closer')
      session(database, 't-1', closer)

      close(database, 't-1', 'a1', closer, 1000, 1000)
      close(database, 't-1', 'a2', closer, 1200, 1000, 'Typed twice')

      expect(readings(database).map(reading => reading.id)).toEqual(['z-a1'])
    })
  })

  // One reader serves every bar, so a later close reads a fuller total than an earlier one.
  test('a second bar closing the same night supersedes the first close\'s reading', async () => {
    await withDatabase((database) => {
      const closer = person(database, 'closer')
      session(database, 't-1', closer)
      session(database, 't-2', closer)

      close(database, 't-1', 'a1', closer, 1000, 1000)
      close(database, 't-2', 'a2', closer, 2500, 2500)

      expect(readings(database).map(({ id, supersedesId, tillSessionId }) => ({ id, supersedesId, tillSessionId }))).toEqual([
        { id: 'z-a1', supersedesId: null, tillSessionId: 't-1' },
        { id: 'z-a2', supersedesId: 'z-a1', tillSessionId: 't-2' },
      ])
    })
  })

  // Correction and write-off stay with finance.write: a close never supersedes the Treasurer.
  test('a reading the Treasurer recorded stands, and a later close records none', async () => {
    await withDatabase((database) => {
      const closer = person(database, 'closer')
      const treasurer = person(database, 'treasurer')
      session(database, 't-1', closer)
      session(database, 't-2', closer)

      close(database, 't-1', 'a1', closer, 1000, 900, 'Float counted in')
      insert(database, 'z_readings', {
        id: 'z-treasurer', night: NIGHT, reader_pence: 1000, expected_pence: 1000, variance_pence: 0, entered_by: treasurer, supersedes_id: 'z-a1',
      })
      close(database, 't-2', 'a2', closer, 2500, 2500)

      expect(readings(database).map(reading => reading.id)).toEqual(['z-a1', 'z-treasurer'])
    })
  })

  test('a night the Treasurer read before any till closed keeps that reading', async () => {
    await withDatabase((database) => {
      const closer = person(database, 'closer')
      const treasurer = person(database, 'treasurer')
      session(database, 't-1', closer)
      insert(database, 'z_readings', {
        id: 'z-treasurer', night: NIGHT, reader_pence: 800, expected_pence: 800, variance_pence: 0, entered_by: treasurer,
      })

      close(database, 't-1', 'a1', closer, 1000, 1000)

      expect(readings(database).map(reading => reading.id)).toEqual(['z-treasurer'])
    })
  })
})
