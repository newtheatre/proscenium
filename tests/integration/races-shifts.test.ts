import { describe, expect, test } from 'bun:test'
import { claimShiftStatement } from '#server/utils/rota'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import { expectOneWinner, race } from '#tests/helpers/race'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// K-105 criterion 2: at most one confirmed duty manager per performance, and no shift claimable
// by two people, both held by unique constraints or atomic claim predicates.

// A `Promise.all` of HTTP requests does not reliably prove a SQL-level race in this harness, so
// these run directly against the database; `tests/e2e/rota-claim.test.ts` is supplementary.

function run(database: TestDatabase, statement: SQL): unknown[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as unknown[]
}

function person(database: TestDatabase, id: string): void {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
}

describe('contended invariants (K-105)', () => {
  // E-104 criterion 5's named case. The predicate rides the UPDATE, so the second attempt
  // matches nothing rather than racing a read (0003, 0006).
  test('a shift is claimable by exactly one person', async () => {
    const database = await createTestDatabase()
    try {
      const tonight = tonightsPerformance(database)
      person(database, 'one')
      person(database, 'two')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)',
        'shift-open', tonight.performanceId, 'DOOR', 'OPEN']])

      const answers = await race(2, async (index) => {
        const claimant = index === 0 ? 'one' : 'two'
        const claimed = run(database, claimShiftStatement('shift-open', claimant, 'CONFIRMED'))
        return { status: claimed.length === 1 ? 200 : 409 }
      })

      expectOneWinner(answers)

      const shift = rows<{ user_id: string, status: string }>(database,
        'SELECT user_id, status FROM shifts WHERE id = ?', 'shift-open')[0]!
      expect(['one', 'two']).toContain(shift.user_id)
      expect(shift.status).toBe('CONFIRMED')
    }
    finally {
      database.close()
    }
  })

  // E-106 criterion 1, proved through the claim path: two open duty-manager slots on one
  // performance (a template never stamps this, but the constraint does not trust it) confirm one.
  test('at most one confirmed duty manager per performance', async () => {
    const database = await createTestDatabase()
    try {
      const tonight = tonightsPerformance(database)
      person(database, 'one')
      person(database, 'two')
      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)',
          'shift-a', tonight.performanceId, 'DUTY_MANAGER', 'OPEN'],
        ['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 2, ?)',
          'shift-b', tonight.performanceId, 'DUTY_MANAGER', 'OPEN'],
      ])

      const attempts: [string, string][] = [['shift-a', 'one'], ['shift-b', 'two']]
      const answers = await race(2, async (index) => {
        const [shiftId, claimant] = attempts[index]!
        try {
          const claimed = run(database, claimShiftStatement(shiftId, claimant, 'CONFIRMED'))
          return { status: claimed.length === 1 ? 200 : 409 }
        }
        catch {
          // The partial unique index refuses the second confirmation at the write, whichever
          // row it arrives through (E-106 criterion 1).
          return { status: 409 }
        }
      })

      expectOneWinner(answers)

      const confirmed = rows<{ id: string }>(database,
        `SELECT id FROM shifts WHERE performance_id = ? AND role = 'DUTY_MANAGER' AND status = 'CONFIRMED'`,
        tonight.performanceId)
      expect(confirmed).toHaveLength(1)
    }
    finally {
      database.close()
    }
  })
})
