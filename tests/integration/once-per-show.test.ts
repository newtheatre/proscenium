import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { passAdmissionTicketInsert } from '#server/utils/capacity'
import { otherNightOfShowQuery, passAdmissionAllows, redeemablePassQuery } from '#server/utils/pass-redemption'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'

// D-141 on the real migrations (0262): a once-per-show pass admits to one night of each show,
// and a cancelled booking frees another night while its own performance stays spent.

const NOW = Math.floor(Date.now() / 1000)

interface Run { showId: string, first: string, second: string }

async function withDatabase(rule: string, fn: (database: TestDatabase, run: Run) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    const tonight = tonightsPerformance(database, { venueCapacity: 120 })
    const second = 'performance-second'
    database.batch([
      [`INSERT INTO performances (id, show_id, venue_id, starts_at, doors_at, duration_minutes, status)
        SELECT ?, show_id, venue_id, starts_at + 86400, doors_at + 86400, duration_minutes, status FROM performances WHERE id = ?`, second, tonight.performanceId],
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-holder', 'holder@example.invalid', 'Holder'],
      ['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-pass', 'Pass admission', 0, 'PASS_ADMISSION'],
      ['INSERT INTO pass_types (id, slug, name, valid_from, valid_until, status, admission_rule) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'pt-1', 'season', 'Season pass', 0, 4_102_444_800, 'ON_SALE', rule],
      ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, ?)', 'price-1', 'pt-1', 'Standard', 4500],
      ['INSERT INTO pass_type_shows (id, pass_type_id, show_id) VALUES (?, ?, ?)', 'cover-1', 'pt-1', tonight.showId],
      ['INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        'pass-1', 'PASS23', 'pt-1', 'price-1', 'u-holder', 4500, 'ACTIVE', 'u-holder'],
    ])
    await fn(database, { showId: tonight.showId, first: tonight.performanceId, second })
  }
  finally {
    database.close()
  }
}

// `redeemPass`'s own reservation, seat and admission, one night at a time.
function book(database: TestDatabase, run: Run, performanceId: string, id: string): boolean {
  database.batch([['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
    id, id.toUpperCase().slice(0, 6), performanceId, 'u-holder', 'PENDING', 'WEB']])
  const [query, ...parameters] = boundStatement(database, passAdmissionTicketInsert(
    { id: `${id}-t`, reservationId: id, performanceId, ticketTypeId: 'tt-pass', pricePaid: 0, priceSource: 'BASE' },
    passAdmissionAllows('pass-1', performanceId, run.showId, NOW),
    120,
  ))
  const written = database.raw.prepare(query).all(...parameters as never[])
  if (written.length === 0) return false
  database.batch([['INSERT INTO pass_admissions (id, pass_id, performance_id, ticket_id) VALUES (?, ?, ?, ?)', `${id}-a`, 'pass-1', performanceId, `${id}-t`]])
  return true
}

describe('a once-per-show pass admits to one night of each show (D-141 criterion 2)', () => {
  test('a second night of the same show is refused, naming the night already booked', async () => {
    await withDatabase('PER_SHOW', (database, run) => {
      expect(book(database, run, run.first, 'res-1')).toBe(true)
      expect(book(database, run, run.second, 'res-2')).toBe(false)
      const [other] = rows<{ reference: string }>(database, ...boundStatement(database, sql`SELECT * FROM ${otherNightOfShowQuery('pass-1', run.second, run.showId)}`))
      expect(other?.reference).toBe('RES-1')
    })
  })

  test('the booking page does not offer the pass for another night of a show it is booked for', async () => {
    await withDatabase('PER_SHOW', (database, run) => {
      book(database, run, run.first, 'res-1')
      expect(rows(database, ...boundStatement(database, redeemablePassQuery('u-holder', run.second, run.showId, NOW)))).toEqual([])
    })
  })

  test('a pass admitting to every performance still books every night (criterion 1)', async () => {
    await withDatabase('PER_PERFORMANCE', (database, run) => {
      expect(book(database, run, run.first, 'res-1')).toBe(true)
      expect(book(database, run, run.second, 'res-2')).toBe(true)
    })
  })
})

describe('cancelling frees the show (D-141 criterion 3)', () => {
  test('a cancelled or lapsed booking lets another night be booked', async () => {
    for (const status of ['CANCELLED', 'EXPIRED']) {
      await withDatabase('PER_SHOW', (database, run) => {
        book(database, run, run.first, 'res-1')
        database.batch([['UPDATE reservations SET status = ? WHERE id = ?', status, 'res-1']])
        expect(book(database, run, run.second, 'res-2')).toBe(true)
      })
    }
  })

  test('the cancelled night itself stays spent', async () => {
    await withDatabase('PER_SHOW', (database, run) => {
      book(database, run, run.first, 'res-1')
      database.batch([['UPDATE reservations SET status = ? WHERE id = ?', 'CANCELLED', 'res-1']])
      expect(book(database, run, run.first, 'res-3')).toBe(false)
    })
  })
})
