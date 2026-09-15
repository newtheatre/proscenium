import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import { currentShowNight } from '#shared/utils/show-night'
import type { TestDatabase } from '#tests/helpers/database'

// A comp request names the house it was asked at (F-126 criterion 4), so an approved comp reports
// against the performance it was served to rather than against the venue's whole night.

const NIGHT = currentShowNight()

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function person(database: TestDatabase, id = 'asker'): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

function ask(database: TestDatabase, id: string, venueId: string, performanceId: string | null): void {
  database.batch([[
    `INSERT INTO comp_requests (id, venue_id, night, performance_id, requested_by, reason, lines)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, venueId, NIGHT, performanceId, person(database), 'A cast thank you', '[]',
  ]])
}

interface CompRow { id: string, performance_id: string | null }

const asked = (database: TestDatabase, venueId: string): CompRow[] =>
  rows<CompRow>(database, 'SELECT id, performance_id FROM comp_requests WHERE venue_id = ? ORDER BY id', venueId)

describe('a comp request keys to a house, never to the venue\'s whole night (F-126 criterion 4)', () => {
  test('the column takes a performance, and a request that names one keeps it', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      ask(database, 'comp-matinee', tonight.venueId, tonight.performanceId)

      expect(asked(database, tonight.venueId)).toEqual([{ id: 'comp-matinee', performance_id: tonight.performanceId }])
    })
  })

  // A bar opening runs no house, so there is nothing to key to and the ask says so.
  test('a request on a night with nothing running names no house', async () => {
    await withDatabase(async (database) => {
      const venue = testVenue(database)
      ask(database, 'comp-hire', venue.id, null)

      expect(asked(database, venue.id)).toEqual([{ id: 'comp-hire', performance_id: null }])
    })
  })

  // The queue is the venue's whole night on purpose: an ask lapses in minutes, and one narrowed
  // to the house the reader has selected would let the other house's asks go undecided.
  test('both houses are in one queue, each ask carrying the house it names', async () => {
    await withDatabase(async (database) => {
      const matinee = tonightsPerformance(database, { suffix: 'matinee', curtainHoursAfterNightStart: 10.5 })
      const evening = tonightsPerformance(database, {
        suffix: 'evening',
        venueId: matinee.venueId,
        curtainHoursAfterNightStart: 15.5,
      })
      ask(database, 'comp-a', matinee.venueId, matinee.performanceId)
      ask(database, 'comp-b', matinee.venueId, evening.performanceId)
      ask(database, 'comp-c', matinee.venueId, null)

      const queued = rows<CompRow>(database, `
        SELECT id, performance_id FROM comp_requests
        WHERE venue_id = ? AND night = ? AND status = 'PENDING'
        ORDER BY id
      `, matinee.venueId, NIGHT)

      expect(queued).toEqual([
        { id: 'comp-a', performance_id: matinee.performanceId },
        { id: 'comp-b', performance_id: evening.performanceId },
        { id: 'comp-c', performance_id: null },
      ])
    })
  })

  // The column is nullable and unconstrained by design: a foreign key on a live table is a
  // rebuild, and the read path is what checks the reference (0010, 0063).
  test('the ask survives its performance being cancelled, which is what has to be read live', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      ask(database, 'comp-cancelled', tonight.venueId, tonight.performanceId)
      database.batch([['UPDATE performances SET status = ? WHERE id = ?', 'CANCELLED', tonight.performanceId]])

      expect(asked(database, tonight.venueId)[0]!.performance_id).toBe(tonight.performanceId)
    })
  })
})
