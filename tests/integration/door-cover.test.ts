import { describe, expect, test } from 'bun:test'
import { doorCoverStatement } from '#server/utils/door-cover'
import { reportDoorCoversQuery } from '#server/utils/night-report'
import { doorCoverEntry, DOOR_COVER_ACTION } from '#shared/utils/night-authority'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import { race } from '#tests/helpers/race'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Door cover by tonight's duty manager, recorded once per duty manager, night and venue on the
// real migrations, and read back by the night report (0095, E-123, issue 1306).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statement: SQL): unknown[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as unknown[]
}

function person(database: TestDatabase, id: string, name = `Someone ${id}`): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)', id, name, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

const covers = (database: TestDatabase): { target: string }[] =>
  rows(database, 'SELECT target FROM audit_log WHERE action = ? ORDER BY target', DOOR_COVER_ACTION)

describe('cover is written once per duty manager, night and venue (0095)', () => {
  test('a second act on the same night and venue adds no row; another venue is its own', async () => {
    await withDatabase((database) => {
      const rowan = person(database, 'rowan')
      run(database, doorCoverStatement(doorCoverEntry(rowan, '2026-10-17', 'venue-a', ['p-1'])))
      run(database, doorCoverStatement(doorCoverEntry(rowan, '2026-10-17', 'venue-a', ['p-1'])))
      run(database, doorCoverStatement(doorCoverEntry(rowan, '2026-10-17', 'venue-b', ['p-2'])))
      expect(covers(database).map(row => row.target)).toEqual(['door-cover:2026-10-17:venue-a', 'door-cover:2026-10-17:venue-b'])
    })
  })

  // The predicate rides the insert, so two first acts racing write one row between them (0003).
  test('two first acts at once write one row', async () => {
    await withDatabase(async (database) => {
      const rowan = person(database, 'rowan')
      const written = await race(2, async () => run(database, doorCoverStatement(doorCoverEntry(rowan, '2026-10-17', 'venue-a', ['p-1']))))
      expect(written.map(one => one.length).sort()).toEqual([0, 1])
      expect(covers(database)).toHaveLength(1)
    })
  })
})

describe('the night report names who covered the door (E-123 criterion 1, 0095)', () => {
  test('the duty manager who covered this performance, and nobody from another night or venue', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const rowan = person(database, 'rowan', 'Rowan Ellis')
      const other = person(database, 'aoife', 'Aoife Byrne')
      run(database, doorCoverStatement(doorCoverEntry(rowan, tonight.night, tonight.venueId, [tonight.performanceId])))
      run(database, doorCoverStatement(doorCoverEntry(other, '2026-01-01', tonight.venueId, [tonight.performanceId])))
      run(database, doorCoverStatement(doorCoverEntry(other, tonight.night, 'venue-elsewhere', [tonight.performanceId])))

      const found = run(database, reportDoorCoversQuery(tonight.performanceId, tonight.venueId, tonight.night))
      expect(found).toEqual([{ officerName: 'Rowan Ellis' }])
    })
  })
})
