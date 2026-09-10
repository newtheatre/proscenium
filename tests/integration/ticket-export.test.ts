import { describe, expect, test } from 'bun:test'
import { ticketExportQuery } from '#server/utils/ticket-export'
import type { TicketExportFilter, TicketExportRow } from '#server/utils/ticket-export'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'

// D-129's query against the real migrations: the four filters, the cap, and the column
// allow-list. The route's permission gate, the refusal and the CSV itself are in the e2e suite.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, filter: TicketExportFilter, limit?: number): TicketExportRow[] {
  const [query, ...parameters] = boundStatement(database, ticketExportQuery(filter, limit))
  return rows<TicketExportRow>(database, query, ...parameters)
}

// One seat, on one reservation. `reference` is explicit and required, never derived, so a test
// reading its own expectation back never has to compute the derivation to check it.
function seedTicket(database: TestDatabase, options: {
  id: string
  reference: string
  performanceId: string
  ticketTypeId?: string
  source?: string
  status?: string
  pricePaid?: number
  refundedAt?: number | null
  staffNotes?: string | null
  customerNotes?: string | null
}): void {
  database.batch([
    [`INSERT INTO reservations (id, reference, performance_id, status, source, staff_notes, customer_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    `r-${options.id}`, options.reference, options.performanceId,
    options.status ?? 'COLLECTED', options.source ?? 'WEB',
    options.staffNotes ?? null, options.customerNotes ?? null],
    [`INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source, refunded_at)
      VALUES (?, ?, ?, ?, ?, 'BASE', ?)`,
    options.id, `r-${options.id}`, options.performanceId, options.ticketTypeId ?? 'tt-standard',
    options.pricePaid ?? 900, options.refundedAt ?? null],
  ])
}

describe('filters narrow the export (criterion 1)', () => {
  test('a show filter reaches only tickets against that show\'s performances', async () => {
    await withDatabase(async (database) => {
      ticketTypeFixture(database)
      const a = tonightsPerformance(database, { suffix: 'a' })
      const b = tonightsPerformance(database, { suffix: 'b' })
      seedTicket(database, { id: 't-a', reference: 'SHOWAA', performanceId: a.performanceId })
      seedTicket(database, { id: 't-b', reference: 'SHOWBB', performanceId: b.performanceId })

      const found = run(database, { showId: a.showId })
      expect(found.map(row => row.reference)).toEqual(['SHOWAA'])
    })
  })

  test('a performance filter reaches only that performance\'s own tickets', async () => {
    await withDatabase(async (database) => {
      ticketTypeFixture(database)
      const a = tonightsPerformance(database, { suffix: 'a' })
      const b = tonightsPerformance(database, { suffix: 'b' })
      seedTicket(database, { id: 't-a', reference: 'SHOWAA', performanceId: a.performanceId })
      seedTicket(database, { id: 't-b', reference: 'SHOWBB', performanceId: b.performanceId })

      const found = run(database, { performanceId: b.performanceId })
      expect(found.map(row => row.reference)).toEqual(['SHOWBB'])
    })
  })

  test('a source filter reaches only reservations from that source', async () => {
    await withDatabase(async (database) => {
      ticketTypeFixture(database)
      const seeded = tonightsPerformance(database)
      seedTicket(database, { id: 't-web', reference: 'FROMWEB', performanceId: seeded.performanceId, source: 'WEB' })
      seedTicket(database, { id: 't-desk', reference: 'FROMDSK', performanceId: seeded.performanceId, source: 'DESK' })

      const found = run(database, { source: 'DESK' })
      expect(found.map(row => row.reference)).toEqual(['FROMDSK'])
    })
  })

  test('a date range reaches only performances starting inside it', async () => {
    await withDatabase(async (database) => {
      ticketTypeFixture(database)
      const seeded = tonightsPerformance(database)
      seedTicket(database, { id: 't-in', reference: 'INRANGE', performanceId: seeded.performanceId })

      const inside = run(database, { fromAt: seeded.startsAt - 3600, toAt: seeded.startsAt + 3600 })
      expect(inside.map(row => row.reference)).toEqual(['INRANGE'])

      const outside = run(database, { fromAt: seeded.startsAt + 3600, toAt: seeded.startsAt + 7200 })
      expect(outside).toEqual([])
    })
  })

  test('filters combine as AND, not OR', async () => {
    await withDatabase(async (database) => {
      ticketTypeFixture(database)
      const a = tonightsPerformance(database, { suffix: 'a' })
      seedTicket(database, { id: 't-web', reference: 'FROMWEB', performanceId: a.performanceId, source: 'WEB' })
      seedTicket(database, { id: 't-desk', reference: 'FROMDSK', performanceId: a.performanceId, source: 'DESK' })

      const found = run(database, { showId: a.showId, source: 'DESK' })
      expect(found.map(row => row.reference)).toEqual(['FROMDSK'])
    })
  })
})

describe('the row cap is enforced in SQL, at the boundary (criterion 1)', () => {
  test('exactly the cap worth of rows returns exactly the cap, not the cap plus one', async () => {
    await withDatabase(async (database) => {
      ticketTypeFixture(database)
      const seeded = tonightsPerformance(database)
      for (let index = 0; index < 3; index++) {
        seedTicket(database, { id: `t-${index}`, reference: `REF00${index}`, performanceId: seeded.performanceId })
      }

      const found = run(database, {}, 3)
      expect(found).toHaveLength(3)
    })
  })

  test('one more than the cap fetches the cap plus one, which is how the route tells overflow apart from exactly-full', async () => {
    await withDatabase(async (database) => {
      ticketTypeFixture(database)
      const seeded = tonightsPerformance(database)
      for (let index = 0; index < 4; index++) {
        seedTicket(database, { id: `t-${index}`, reference: `REF00${index}`, performanceId: seeded.performanceId })
      }

      const found = run(database, {}, 3)
      expect(found).toHaveLength(4)
    })
  })
})

describe('the column list is the allow-list itself, nothing more (criterion 3)', () => {
  test('a row carries exactly the exported columns, whatever else the tables hold', async () => {
    await withDatabase(async (database) => {
      ticketTypeFixture(database)
      const seeded = tonightsPerformance(database)
      seedTicket(database, {
        id: 't-1',
        reference: 'NOTESXX',
        performanceId: seeded.performanceId,
        staffNotes: 'Known troublemaker, watch the bar tab',
        customerNotes: 'Wheelchair space needed',
      })

      const [row] = run(database, {})
      expect(Object.keys(row!).sort()).toEqual(
        ['pricePaid', 'reference', 'refundedAt', 'showTitle', 'source', 'startsAt', 'status', 'typeName'].sort(),
      )
    })
  })

  test('neither staff notes nor customer notes appear anywhere in the row\'s own values', async () => {
    await withDatabase(async (database) => {
      ticketTypeFixture(database)
      const seeded = tonightsPerformance(database)
      seedTicket(database, {
        id: 't-1',
        reference: 'NOTESXX',
        performanceId: seeded.performanceId,
        staffNotes: 'Known troublemaker, watch the bar tab',
        customerNotes: 'Wheelchair space needed',
      })

      const [row] = run(database, {})
      const values = Object.values(row!).join(' | ')
      expect(values).not.toContain('troublemaker')
      expect(values).not.toContain('Wheelchair')
    })
  })

  test('a refunded ticket carries its refund, and an unrefunded one carries null', async () => {
    await withDatabase(async (database) => {
      ticketTypeFixture(database)
      const seeded = tonightsPerformance(database)
      seedTicket(database, { id: 't-refunded', reference: 'REFUNDD', performanceId: seeded.performanceId, refundedAt: 1_700_000_000 })
      seedTicket(database, { id: 't-kept', reference: 'KEPTXX', performanceId: seeded.performanceId })

      const found = run(database, {})
      expect(found.find(row => row.reference === 'REFUNDD')!.refundedAt).toBe(1_700_000_000)
      expect(found.find(row => row.reference === 'KEPTXX')!.refundedAt).toBeNull()
    })
  })
})
