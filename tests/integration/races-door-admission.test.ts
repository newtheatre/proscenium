import { describe, expect, test } from 'bun:test'
import { admitAtDoorStatement } from '#server/utils/door'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import { expectOneWinner, race } from '#tests/helpers/race'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// D-126 criteria 2 and 4: the check-in guard rides the UPDATE's own WHERE, so two racing scans
// of a pass already redeemed for tonight admit it exactly once.

function run(database: TestDatabase, statement: SQL): unknown[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as unknown[]
}

function reservation(database: TestDatabase, id: string, performanceId: string): void {
  database.batch([['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
    id, id.toUpperCase(), performanceId, 'PENDING', 'WEB']])
}

describe('admitting a pass already redeemed for tonight: a race admits it exactly once (D-126 criterion 2)', () => {
  test('two simultaneous scans of one reservation leave it admitted once', async () => {
    const database = await createTestDatabase()
    try {
      const tonight = tonightsPerformance(database)
      reservation(database, 'r-already-redeemed', tonight.performanceId)

      const answers = await race(2, async () => {
        const written = run(database, admitAtDoorStatement('r-already-redeemed'))
        return { status: written.length === 1 ? 200 : 409 }
      })

      expectOneWinner(answers)

      const row = rows<{ status: string }>(database, 'SELECT status FROM reservations WHERE id = ?', 'r-already-redeemed')[0]
      expect(row?.status).toBe('DOOR')
    }
    finally {
      database.close()
    }
  })
})
