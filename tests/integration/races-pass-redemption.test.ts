import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { passAdmissionTicketInsert } from '#server/utils/pass-redemption'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import { expectOneWinner, race } from '#tests/helpers/race'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// D-125 criteria 2 and 3: once-per-performance and capacity are both asked on the ticket
// insert's own WHERE (`passAdmissionTicketInsert`), so a race against either leaves exactly one
// admission. Run directly against the database, the same reasoning tests/integration/races-shifts.test.ts gives.

function run(database: TestDatabase, statement: SQL): unknown[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as unknown[]
}

function person(database: TestDatabase, id: string): void {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
}

function passType(database: TestDatabase, id: string, showId: string, now: number): void {
  database.batch([
    ['INSERT INTO pass_types (id, slug, name, valid_from, valid_until, status) VALUES (?, ?, ?, ?, ?, ?)',
      id, id, `Pass type ${id}`, now - 1_000, now + 1_000, 'ON_SALE'],
    ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, 0)', `${id}-price`, id, 'Standard'],
    ['INSERT INTO pass_type_shows (id, pass_type_id, show_id) VALUES (?, ?, ?)', `${id}-show`, id, showId],
  ])
}

function pass(database: TestDatabase, id: string, passTypeId: string, userId: string): void {
  database.batch([['INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by) '
    + 'VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
  id, id.toUpperCase().slice(0, 6), passTypeId, `${passTypeId}-price`, userId, 'ACTIVE', userId]])
}

function ticketType(database: TestDatabase): void {
  database.batch([['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, 0, ?)',
    'tt-pass-admission', 'Pass admission', 'PASS_ADMISSION']])
}

// The ticket insert's own FK requires the reservation to already exist; `redeemPass()` writes it
// unconditionally, one statement ahead of the contended one this test races.
function reservation(database: TestDatabase, id: string, performanceId: string, userId: string): void {
  database.batch([['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
    id, id.toUpperCase(), performanceId, userId, 'PENDING', 'WEB']])
}

// Mirrors `redeemPass()`'s own admission insert: guarded on the ticket insert's `changes()`, the
// once-per-performance constraint a second racer's own ticket insert then sees.
function admit(database: TestDatabase, passId: string, performanceId: string, ticketId: string): void {
  run(database, sql`
    INSERT INTO pass_admissions (id, pass_id, performance_id, ticket_id)
    SELECT ${`admission-${ticketId}`}, ${passId}, ${performanceId}, ${ticketId}
    WHERE changes() = 1
  `)
}

describe('redeeming a pass: once-per-performance under a race (D-125 criterion 2)', () => {
  test('two racing redemptions of the same pass for the same performance leave exactly one admission', async () => {
    const database = await createTestDatabase()
    try {
      const tonight = tonightsPerformance(database, { venueCapacity: 100 })
      const now = Math.floor(Date.now() / 1000)
      person(database, 'holder')
      ticketType(database)
      passType(database, 'pt-race', tonight.showId, now)
      pass(database, 'pass-race', 'pt-race', 'holder')

      const answers = await race(2, async (index) => {
        const reservationId = `reservation-${index}`
        const ticketId = `ticket-${index}`
        reservation(database, reservationId, tonight.performanceId, 'holder')
        const written = run(database, passAdmissionTicketInsert(
          { passId: 'pass-race', performanceId: tonight.performanceId, showId: tonight.showId, capacity: 100 },
          reservationId, ticketId, now,
        ))
        admit(database, 'pass-race', tonight.performanceId, ticketId)
        return { status: written.length === 1 ? 200 : 409 }
      })

      expectOneWinner(answers)

      const tickets = rows<{ total: number }>(database,
        'SELECT count(*) AS total FROM tickets WHERE performance_id = ?', tonight.performanceId)
      expect(tickets[0]?.total).toBe(1)
    }
    finally {
      database.close()
    }
  })
})

describe('redeeming a pass: capacity still applies in full under a race (D-125 criterion 3)', () => {
  test('two different passes racing for the last seat leave exactly one ticket', async () => {
    const database = await createTestDatabase()
    try {
      const tonight = tonightsPerformance(database, { venueCapacity: 1 })
      const now = Math.floor(Date.now() / 1000)
      person(database, 'holder-one')
      person(database, 'holder-two')
      ticketType(database)
      passType(database, 'pt-cap', tonight.showId, now)
      pass(database, 'pass-one', 'pt-cap', 'holder-one')
      pass(database, 'pass-two', 'pt-cap', 'holder-two')

      const answers = await race(2, async (index) => {
        const passId = index === 0 ? 'pass-one' : 'pass-two'
        const holder = index === 0 ? 'holder-one' : 'holder-two'
        const reservationId = `reservation-cap-${index}`
        reservation(database, reservationId, tonight.performanceId, holder)
        const written = run(database, passAdmissionTicketInsert(
          { passId, performanceId: tonight.performanceId, showId: tonight.showId, capacity: 1 },
          reservationId, `ticket-cap-${index}`, now,
        ))
        return { status: written.length === 1 ? 200 : 409 }
      })

      expectOneWinner(answers)

      const tickets = rows<{ total: number }>(database,
        'SELECT count(*) AS total FROM tickets WHERE performance_id = ?', tonight.performanceId)
      expect(tickets[0]?.total).toBe(1)
    }
    finally {
      database.close()
    }
  })
})
