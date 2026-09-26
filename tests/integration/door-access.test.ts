import { describe, expect, test } from 'bun:test'
import { doorAccessHolderQuery } from '#server/utils/door-access'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'

// Issue 1307, D-128 criterion 4: the door's verdict carries the agreed access wording for a
// booking that holds an access or companion ticket, and for nothing else.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    ticketTypeFixture(database)
    database.batch([
      ['INSERT INTO ticket_types (id, name, price, kind, access_kind) VALUES (?, ?, ?, ?, ?)', 'tt-access', 'Access', 900, 'SINGLE', 'ACCESS'],
      ['INSERT INTO ticket_types (id, name, price, kind, access_kind) VALUES (?, ?, ?, ?, ?)', 'tt-companion', 'Companion', 0, 'SINGLE', 'COMPANION'],
    ])
    await fn(database)
  }
  finally {
    database.close()
  }
}

function holder(database: TestDatabase, reservationId: string): string | undefined {
  const [query, ...parameters] = boundStatement(database, doorAccessHolderQuery(reservationId))
  return rows<{ userId: string }>(database, query, ...parameters)[0]?.userId
}

function booking(database: TestDatabase, id: string, performanceId: string, tickets: { type: string, refundedAt?: number }[]): void {
  database.batch([
    ['INSERT INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)', `u-${id}`, `Holder ${id}`, `${id}@e2e.newtheatre.org.uk`],
    ['INSERT INTO reservations (id, reference, performance_id, status, source, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      id, id.toUpperCase().slice(0, 6), performanceId, 'COLLECTED', 'WEB', `u-${id}`],
  ])
  tickets.forEach((ticket, index) => {
    database.batch([['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source, refunded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      `${id}-t${index}`, id, performanceId, ticket.type, 0, 'BASE', ticket.refundedAt ?? null]])
  })
}

describe('whose access wording the door reads (D-128 criterion 4)', () => {
  test('a booking holding an access ticket names its booker', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      booking(database, 'access', tonight.performanceId, [{ type: 'tt-access' }, { type: 'tt-companion' }])
      expect(holder(database, 'access')).toBe('u-access')
    })
  })

  test('a companion ticket alone is enough', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      booking(database, 'compan', tonight.performanceId, [{ type: 'tt-standard' }, { type: 'tt-companion' }])
      expect(holder(database, 'compan')).toBe('u-compan')
    })
  })

  test('an ordinary booking names nobody, so no wording is ever read for it', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      booking(database, 'plain1', tonight.performanceId, [{ type: 'tt-standard' }, { type: 'tt-standard' }])
      expect(holder(database, 'plain1')).toBeUndefined()
    })
  })

  test('a refunded access ticket no longer carries the wording', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      booking(database, 'refund', tonight.performanceId, [{ type: 'tt-standard' }, { type: 'tt-access', refundedAt: 1_000 }])
      expect(holder(database, 'refund')).toBeUndefined()
    })
  })
})
