import { describe, expect, test } from 'bun:test'
import { claimShiftStatement } from '#server/utils/rota'
import { boundStatement, createTestDatabase, rows, sql } from '#tests/helpers/database'
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

// Every claimant here holds the gating module, so the race is only ever over the slot itself.
const GATE = { moduleId: 'SFTY-001', today: '2026-10-12' }

function person(database: TestDatabase, id: string): void {
  database.batch([
    ['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)', id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`],
    ['INSERT OR IGNORE INTO departments (code, name) VALUES (?, ?)', 'SFTY', 'Safety'],
    ['INSERT OR IGNORE INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'SFTY-001', 'SFTY', 'MODULE', 'Front of house'],
    [`INSERT INTO training_records (id, user_id, module_id, awarded_on, source) VALUES (?, ?, 'SFTY-001', '2025-08-21', 'SIGNOFF')`, `tr-${id}`, id],
  ])
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
        const claimed = run(database, claimShiftStatement('shift-open', claimant, 'CONFIRMED', GATE))
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
          const claimed = run(database, claimShiftStatement(shiftId, claimant, 'CONFIRMED', GATE))
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

  // Issue 1302's gap at the claim: the route checks training, then writes. Whichever lands first,
  // the claim's outcome follows the record as it stands at the claim's own write (E-104 criterion 1).
  test('a claim racing its own record\'s revocation lands only if it wrote first (#1302)', async () => {
    const database = await createTestDatabase()
    try {
      const tonight = tonightsPerformance(database)
      person(database, 'one')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)',
        'shift-open', tonight.performanceId, 'DOOR', 'OPEN']])

      const order: string[] = []
      const [, claimed] = await race(2, async (index) => {
        if (index === 0) {
          run(database, sql`UPDATE training_records SET revoked_at = unixepoch() WHERE id = 'tr-one'`)
          order.push('revoked')
          return 0
        }
        const written = run(database, claimShiftStatement('shift-open', 'one', 'CONFIRMED', GATE)).length
        order.push('claimed')
        return written
      })

      expect(claimed).toBe(order[0] === 'claimed' ? 1 : 0)
    }
    finally {
      database.close()
    }
  })

  test('a record revoked between the live check and the write refuses the claim (#1302)', async () => {
    const database = await createTestDatabase()
    try {
      const tonight = tonightsPerformance(database)
      person(database, 'one')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)',
        'shift-open', tonight.performanceId, 'DOOR', 'OPEN']])
      database.batch([['UPDATE training_records SET revoked_at = unixepoch() WHERE id = ?', 'tr-one']])

      expect(run(database, claimShiftStatement('shift-open', 'one', 'CONFIRMED', GATE))).toHaveLength(0)
      expect(rows<{ status: string }>(database, 'SELECT status FROM shifts WHERE id = ?', 'shift-open')[0]!.status).toBe('OPEN')
    }
    finally {
      database.close()
    }
  })
})
