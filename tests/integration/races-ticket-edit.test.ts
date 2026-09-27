import { describe, expect, test } from 'bun:test'
import { ticketInsertQueries } from '#server/utils/capacity'
import { editTicketsStatements } from '#server/utils/reservations'
import { auditEntry } from '#shared/utils/audit'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TicketTypeCount } from '#shared/utils/reservations'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// D-110 criterion 2 under contention: a self-service edit applies only to the lines it read, so a
// double-submitted or stale edit changes nothing and logs nothing (K-105, 0003, 0049).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

// One transaction, in order, as D1 runs a batch, so each statement sees the one before it.
function batch(database: TestDatabase, statements: SQL[]): unknown[][] {
  return database.raw.transaction(() => statements.map((statement) => {
    const [text, ...parameters] = boundStatement(database, statement)
    return database.raw.prepare(text).all(...parameters as never[]) as unknown[]
  }))()
}

function booking(database: TestDatabase, lines: { ticketTypeId: string, quantity: number }[]): string {
  ticketTypeFixture(database)
  database.batch([['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-concession', 'Concession', 700, 'SINGLE']])
  const { performanceId } = tonightsPerformance(database)
  database.batch([['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)', 'r1', 'R00001', performanceId, 'PENDING', 'WEB']])
  const tickets = lines.flatMap(line => Array.from({ length: line.quantity }, (_, index) => ({
    id: `${line.ticketTypeId}-${index}`, reservationId: 'r1', performanceId, ticketTypeId: line.ticketTypeId, pricePaid: 900, priceSource: 'BASE' as const,
  })))
  batch(database, ticketInsertQueries(tickets, null))
  return performanceId
}

// What a request read, and what it asks for from that read: the route's own shape.
function edit(database: TestDatabase, performanceId: string, asRead: TicketTypeCount[], change: { removals: TicketTypeCount[], additions?: string[], desiredTotal: number }): boolean {
  const [audited] = batch(database, editTicketsStatements({
    reservationId: 'r1',
    performanceId,
    capacity: null,
    linesAsRead: asRead,
    additions: (change.additions ?? []).map(id => ({ id, reservationId: 'r1', performanceId, ticketTypeId: 'tt-concession', pricePaid: 700, priceSource: 'BASE' as const })),
    removals: change.removals,
    desiredTotal: change.desiredTotal,
    actorId: null,
  }, auditEntry({ actorId: null, action: 'reservation.tickets-changed', target: 'reservation:r1' })))
  return (audited ?? []).length > 0
}

const heldLines = (database: TestDatabase): { ticketTypeId: string, n: number }[] =>
  rows(database, 'SELECT ticket_type_id AS ticketTypeId, count(*) AS n FROM tickets WHERE reservation_id = ? GROUP BY ticket_type_id ORDER BY ticket_type_id', 'r1')
const logged = (database: TestDatabase): number =>
  rows<{ n: number }>(database, `SELECT count(*) AS n FROM audit_log WHERE action = 'reservation.tickets-changed'`)[0]!.n

describe('a self-service ticket edit applies to the lines it read, once (D-110 criterion 2, K-105)', () => {
  test('a double-submitted removal removes one ticket, not two, and logs once', async () => {
    await withDatabase((database) => {
      const performanceId = booking(database, [{ ticketTypeId: 'tt-standard', quantity: 3 }])
      const asRead = [{ ticketTypeId: 'tt-standard', quantity: 3 }]
      const removeOne = { removals: [{ ticketTypeId: 'tt-standard', quantity: 1 }], desiredTotal: 2 }

      expect(edit(database, performanceId, asRead, removeOne)).toBe(true)
      expect(edit(database, performanceId, asRead, removeOne)).toBe(false)
      expect(heldLines(database)).toEqual([{ ticketTypeId: 'tt-standard', n: 2 }])
      expect(logged(database)).toBe(1)
    })
  })

  // The same total either way, so neither capacity nor a count of tickets can tell the two apart.
  test('a double-submitted swap swaps once', async () => {
    await withDatabase((database) => {
      const performanceId = booking(database, [{ ticketTypeId: 'tt-standard', quantity: 2 }])
      const asRead = [{ ticketTypeId: 'tt-standard', quantity: 2 }]

      expect(edit(database, performanceId, asRead, { removals: [{ ticketTypeId: 'tt-standard', quantity: 1 }], additions: ['c-1'], desiredTotal: 2 })).toBe(true)
      expect(edit(database, performanceId, asRead, { removals: [{ ticketTypeId: 'tt-standard', quantity: 1 }], additions: ['c-2'], desiredTotal: 2 })).toBe(false)
      expect(heldLines(database)).toEqual([{ ticketTypeId: 'tt-concession', n: 1 }, { ticketTypeId: 'tt-standard', n: 1 }])
      expect(logged(database)).toBe(1)
    })
  })

  // Each line after the first sees the lines the first one moved, so a line keys to the edit's
  // own audit row rather than to the read: one request removing two types removes both.
  test('one edit removing two types removes both, though the first removal moves what was read', async () => {
    await withDatabase((database) => {
      const performanceId = booking(database, [{ ticketTypeId: 'tt-concession', quantity: 2 }, { ticketTypeId: 'tt-standard', quantity: 2 }])
      const asRead = [{ ticketTypeId: 'tt-concession', quantity: 2 }, { ticketTypeId: 'tt-standard', quantity: 2 }]

      expect(edit(database, performanceId, asRead, {
        removals: [{ ticketTypeId: 'tt-concession', quantity: 1 }, { ticketTypeId: 'tt-standard', quantity: 1 }],
        desiredTotal: 2,
      })).toBe(true)
      expect(heldLines(database)).toEqual([{ ticketTypeId: 'tt-concession', n: 1 }, { ticketTypeId: 'tt-standard', n: 1 }])
    })
  })

  test('a read naming a type the booking no longer holds, or missing one it now holds, is stale', async () => {
    await withDatabase((database) => {
      const performanceId = booking(database, [{ ticketTypeId: 'tt-standard', quantity: 2 }])
      const removeOne = { removals: [{ ticketTypeId: 'tt-standard', quantity: 1 }], desiredTotal: 1 }

      expect(edit(database, performanceId, [{ ticketTypeId: 'tt-standard', quantity: 2 }, { ticketTypeId: 'tt-concession', quantity: 1 }], removeOne)).toBe(false)
      expect(edit(database, performanceId, [], removeOne)).toBe(false)
      expect(heldLines(database)).toEqual([{ ticketTypeId: 'tt-standard', n: 2 }])
      expect(logged(database)).toBe(0)
    })
  })
})
