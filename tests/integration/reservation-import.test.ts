import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { erasureStatements } from '#shared/utils/erasure'
import { STATUS_MAP, reconcile, transformReservations } from '#migration/reservations'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'

// Reservations as records, proved against a source shaped like the real old ticketing schema and
// the real migrations this repo builds. The rehearsal against a production dump is the other half.

// The tables the transform reads, and nothing else. Old ids are text throughout `proscenium`
// (`money.ts`'s `TicketRow`, `programme.ts`'s `OldPerformance`), not a number.
function oldEstate(): Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE reservations (
      id TEXT PRIMARY KEY, user_id TEXT, performance_id TEXT,
      status TEXT NOT NULL, source TEXT NOT NULL,
      customer_notes TEXT, staff_notes TEXT, cancelled_by TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE tickets (
      id TEXT PRIMARY KEY, reservation_id TEXT NOT NULL, ticket_type_id TEXT,
      price_paid INTEGER NOT NULL, refunded_at INTEGER, created_at INTEGER NOT NULL,
      price_confidence TEXT NOT NULL DEFAULT 'EXACT');
  `)
  return db
}

interface PlacedReservation { id: string, over?: Record<string, unknown> }

function placeReservation(db: Database, { id, over = {} }: PlacedReservation): void {
  const row = {
    user_id: 'old-user-1',
    performance_id: 'perf-1',
    status: 'COLLECTED',
    source: 'WEB',
    customer_notes: null,
    staff_notes: null,
    cancelled_by: null,
    created_at: 1_700_000_000,
    ...over,
  }
  db.query(`
    INSERT INTO reservations (id, user_id, performance_id, status, source, customer_notes, staff_notes, cancelled_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, row.user_id as string | null, row.performance_id as string | null, row.status as string,
    row.source as string, row.customer_notes, row.staff_notes, row.cancelled_by, row.created_at as number)
}

interface PlacedTicket { id: string, reservationId: string, over?: Record<string, unknown> }

function placeTicket(db: Database, { id, reservationId, over = {} }: PlacedTicket): void {
  const row = {
    ticket_type_id: 'tt-1',
    price_paid: 900,
    refunded_at: null,
    created_at: 1_700_000_000,
    price_confidence: 'EXACT',
    ...over,
  }
  db.query(`
    INSERT INTO tickets (id, reservation_id, ticket_type_id, price_paid, refunded_at, created_at, price_confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, reservationId, row.ticket_type_id as string | null, row.price_paid as number,
    row.refunded_at, row.created_at as number, row.price_confidence as string)
}

async function targetWithEstate(): Promise<{ target: TestDatabase, performanceId: string }> {
  const target = await createTestDatabase()
  ticketTypeFixture(target)
  const tonight = tonightsPerformance(target)
  target.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'new-user-1', 'a@example.invalid', 'A Member'],
    ['INSERT INTO users (id, email, name, verified, anonymised_at) VALUES (?, ?, ?, 1, ?)',
      'new-ghost', 'deleted-x@anonymised.invalid', 'Deleted user', 1_700_000_000],
  ])
  return { target, performanceId: tonight.performanceId }
}

function run(
  source: Database,
  target: TestDatabase,
  performanceId: string,
  accounts = new Map([['old-user-1', 'new-user-1']]),
  reservationIds = new Map<string, string>(),
  ticketTypes = new Map([['tt-1', 'tt-standard']]),
): ReturnType<typeof transformReservations> {
  return transformReservations({
    source,
    accounts,
    performances: new Map([['perf-1', performanceId]]),
    ticketTypes,
    reservationIds,
    ticketIds: new Map(),
    target: (target as unknown as { raw: Database }).raw,
  })
}

describe('the old ticket history imports keyed to the canonical account and performance', () => {
  test('a reservation and its ticket land with their original figures', async () => {
    const source = oldEstate()
    placeReservation(source, { id: 'r-1' })
    placeTicket(source, { id: 't-1', reservationId: 'r-1' })
    const { target, performanceId } = await targetWithEstate()

    try {
      const { summary } = run(source, target, performanceId)
      expect(summary.written).toBe(1)
      expect(summary.ticketsWritten).toBe(1)

      const [reservation] = rows<{ user_id: string, performance_id: string, status: string, source: string }>(
        target, 'SELECT user_id, performance_id, status, source FROM reservations')
      expect(reservation).toMatchObject({ user_id: 'new-user-1', performance_id: performanceId, status: 'COLLECTED', source: 'WEB' })

      const [ticket] = rows<{ price_paid: number, price_source: string }>(target, 'SELECT price_paid, price_source FROM tickets')
      expect(ticket).toMatchObject({ price_paid: 900, price_source: 'IMPORT' })
    }
    finally {
      target.close()
    }
  })

  test.each(Object.entries(STATUS_MAP))('%s imports as %s', async (oldStatus, newStatus) => {
    const source = oldEstate()
    placeReservation(source, { id: 'r-1', over: { status: oldStatus } })
    const { target, performanceId } = await targetWithEstate()

    try {
      run(source, target, performanceId)
      expect(rows<{ status: string }>(target, 'SELECT status FROM reservations')[0]?.status).toBe(newStatus)
    }
    finally {
      target.close()
    }
  })

  test('a reservation naming nobody imports with no user, not invented', async () => {
    const source = oldEstate()
    placeReservation(source, { id: 'r-1', over: { user_id: null } })
    const { target, performanceId } = await targetWithEstate()

    try {
      const { summary } = run(source, target, performanceId)
      expect(summary.written).toBe(1)
      expect(summary.anonymousAccount).toBe(0)
      expect(rows<{ user_id: string | null }>(target, 'SELECT user_id FROM reservations')[0]?.user_id).toBeNull()
    }
    finally {
      target.close()
    }
  })
})

describe('nothing is invented', () => {
  test('a reservation whose account never came across imports with no user, and says so', async () => {
    const source = oldEstate()
    placeReservation(source, { id: 'r-1', over: { user_id: 'old-user-missing' } })
    const { target, performanceId } = await targetWithEstate()

    try {
      const { summary, exceptions } = run(source, target, performanceId)
      expect(summary.written).toBe(1)
      expect(summary.anonymousAccount).toBe(1)
      expect(rows<{ user_id: string | null }>(target, 'SELECT user_id FROM reservations')[0]?.user_id).toBeNull()
      expect(exceptions.some(one => one.includes('no canonical id'))).toBe(true)
    }
    finally {
      target.close()
    }
  })

  test('a reservation with no mapped performance is skipped and named, never guessed', async () => {
    const source = oldEstate()
    placeReservation(source, { id: 'r-1', over: { performance_id: 'perf-999' } })
    const { target, performanceId } = await targetWithEstate()
    void performanceId

    try {
      const { summary, exceptions } = run(source, target, 'irrelevant', new Map([['old-user-1', 'new-user-1']]))
      expect(summary.written).toBe(0)
      expect(summary.skippedNoPerformance).toBe(1)
      expect(rows(target, 'SELECT id FROM reservations')).toHaveLength(0)
      expect(exceptions[0]).toContain('no performance')
    }
    finally {
      target.close()
    }
  })

  test('a ticket with no mapped type is skipped and named; its reservation still imports', async () => {
    const source = oldEstate()
    placeReservation(source, { id: 'r-1' })
    placeTicket(source, { id: 't-1', reservationId: 'r-1', over: { ticket_type_id: 'tt-999' } })
    const { target, performanceId } = await targetWithEstate()

    try {
      const { summary, exceptions } = run(source, target, performanceId)
      expect(summary.written).toBe(1)
      expect(summary.ticketsWritten).toBe(0)
      expect(summary.ticketsSkippedNoType).toBe(1)
      expect(exceptions.some(one => one.includes('no ticket type'))).toBe(true)
    }
    finally {
      target.close()
    }
  })

  test('a tombstone keeps its reservations and stays a tombstone', async () => {
    const source = oldEstate()
    placeReservation(source, { id: 'r-1', over: { user_id: 'old-ghost' } })
    const { target, performanceId } = await targetWithEstate()

    try {
      run(source, target, performanceId, new Map([['old-ghost', 'new-ghost']]))

      expect(rows<{ user_id: string }>(target, 'SELECT user_id FROM reservations')[0]?.user_id).toBe('new-ghost')
      const [ghost] = rows<{ name: string, anonymised_at: number }>(target, `SELECT name, anonymised_at FROM users WHERE id = 'new-ghost'`)
      expect(ghost?.name).toBe('Deleted user')
      expect(ghost?.anonymised_at).toBe(1_700_000_000)
    }
    finally {
      target.close()
    }
  })

  // 0059: erasure's own scrub of an existing reservation must survive a later re-import from a
  // source that has not heard about it, the same guard `bookings.ts` proved this shape needs.
  test('a reservation already scrubbed by erasure does not regain its original notes', async () => {
    const source = oldEstate()
    placeReservation(source, { id: 'r-1', over: { customer_notes: 'Wheelchair space, row A' } })
    const { target, performanceId } = await targetWithEstate()
    const reservationIds = new Map<string, string>()

    try {
      // First import, before the person was erased: the real notes land, same as any other.
      run(source, target, performanceId, undefined, reservationIds)
      expect(rows<{ customer_notes: string | null }>(target, 'SELECT customer_notes FROM reservations')[0]?.customer_notes)
        .toBe('Wheelchair space, row A')

      // Erased since: erasureStatements scrubs this exact reservation's notes.
      target.batch(erasureStatements('new-user-1', 1_780_000_000).map(statement => boundStatement(target, statement)))
      expect(rows<{ customer_notes: string | null }>(target, 'SELECT customer_notes FROM reservations')[0]?.customer_notes)
        .toBeNull()

      // The old estate never heard about the erasure: its export still has the real notes.
      run(source, target, performanceId, undefined, reservationIds)
      expect(rows(target, 'SELECT id FROM reservations')).toHaveLength(1)

      const after = rows<{ customer_notes: string | null }>(target, 'SELECT customer_notes FROM reservations')[0]!
      expect(after.customer_notes).toBeNull()
    }
    finally {
      target.close()
    }
  })
})

describe('it reconciles, and fails loudly', () => {
  test('a clean import reconciles', async () => {
    const source = oldEstate()
    placeReservation(source, { id: 'r-1' })
    placeTicket(source, { id: 't-1', reservationId: 'r-1' })
    const { target, performanceId } = await targetWithEstate()

    try {
      const { summary } = run(source, target, performanceId)
      const raw = (target as unknown as { raw: Database }).raw
      const check = reconcile(source, raw, summary)
      expect(check.problems).toEqual([])
      expect(check.ok).toBe(true)
    }
    finally {
      target.close()
    }
  })

  test('a price total that does not add up is a problem, not a rounding', async () => {
    const source = oldEstate()
    placeReservation(source, { id: 'r-1' })
    placeTicket(source, { id: 't-1', reservationId: 'r-1' })
    const { target, performanceId } = await targetWithEstate()

    try {
      const { summary } = run(source, target, performanceId)
      const raw = (target as unknown as { raw: Database }).raw
      const check = reconcile(source, raw, { ...summary, pricePaidPence: summary.pricePaidPence + 100 })
      expect(check.ok).toBe(false)
      expect(check.problems.some(one => one.includes('price paid differs'))).toBe(true)
    }
    finally {
      target.close()
    }
  })
})

describe('a rehearsal runs again without doubling the history', () => {
  test('the same export imported twice leaves one of each reservation, same reference', async () => {
    const source = oldEstate()
    placeReservation(source, { id: 'r-1' })
    const { target, performanceId } = await targetWithEstate()

    try {
      const reservationIds = new Map<string, string>()
      const accounts = new Map([['old-user-1', 'new-user-1']])
      const ticketTypes = new Map([['tt-1', 'tt-standard']])
      const raw = (target as unknown as { raw: Database }).raw
      const carried = { source, accounts, performances: new Map([['perf-1', performanceId]]), ticketTypes, ticketIds: new Map(), target: raw }

      transformReservations({ ...carried, reservationIds })
      const first = rows<{ id: string, reference: string }>(target, 'SELECT id, reference FROM reservations')

      transformReservations({ ...carried, reservationIds })
      const second = rows<{ id: string, reference: string }>(target, 'SELECT id, reference FROM reservations')

      expect(second).toHaveLength(1)
      expect(second).toEqual(first)
    }
    finally {
      target.close()
    }
  })
})
