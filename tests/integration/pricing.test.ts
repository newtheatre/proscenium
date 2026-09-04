import { describe, expect, test } from 'bun:test'
import { performancePricesQuery, pricingDetail, showPricesQuery } from '#server/utils/pricing'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import { resolvePrice } from '#shared/utils/ticket-types'
import type { PricedTicketType } from '#server/utils/pricing'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// D-120 against the real override tables. What resolution means is in tests/unit/whats-on.test.ts;
// this is what each level returns and what the screen is therefore able to show.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function read<T>(database: TestDatabase, statement: SQL): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, query, ...parameters)
}

interface Row {
  ticketTypeId: string
  basePrice: number
  activeByDefault: number
  showPrice: number | null
  showActive: number | null
  performancePrice: number | null
  performanceActive: number | null
}

function addType(database: TestDatabase, id: string, name: string, price: number, over: Record<string, unknown> = {}): void {
  database.batch([[
    'INSERT INTO ticket_types (id, name, price, kind, archived, active_by_default) VALUES (?, ?, ?, ?, ?, ?)',
    id, name, price, 'SINGLE', over.archived ?? 0, over.activeByDefault ?? 1,
  ]])
}

describe('every level of the chain comes back, so a screen can say why (D-120 criterion 2)', () => {
  test('with no override anywhere, only the base price is set', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      addType(database, 'tt-1', 'Standard', 900)

      const [row] = read<Row>(database, performancePricesQuery(seeded.performanceId))
      expect(row?.basePrice).toBe(900)
      expect(row?.showPrice).toBeNull()
      expect(row?.performancePrice).toBeNull()
    })
  })

  test('a performance sees its own override and the show\'s beside it', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      addType(database, 'tt-1', 'Standard', 900)
      database.batch([
        ['INSERT INTO show_ticket_overrides (id, show_id, ticket_type_id, price) VALUES (?, ?, ?, ?)',
          'so-1', seeded.showId, 'tt-1', 700],
        ['INSERT INTO performance_ticket_overrides (id, performance_id, ticket_type_id, price) VALUES (?, ?, ?, ?)',
          'po-1', seeded.performanceId, 'tt-1', 500],
      ])

      const [row] = read<Row>(database, performancePricesQuery(seeded.performanceId))
      expect(row).toMatchObject({ basePrice: 900, showPrice: 700, performancePrice: 500 })
      expect(resolvePrice(
        { price: row!.basePrice, activeByDefault: true },
        { price: row!.showPrice, active: null },
        { price: row!.performancePrice, active: null },
      )).toEqual({ price: 500, source: 'PERFORMANCE', active: true })
    })
  })

  test('a show screen sees no performance level at all', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      addType(database, 'tt-1', 'Standard', 900)
      database.batch([['INSERT INTO performance_ticket_overrides (id, performance_id, ticket_type_id, price) VALUES (?, ?, ?, ?)',
        'po-1', seeded.performanceId, 'tt-1', 500]])

      const [row] = read<Row>(database, showPricesQuery(seeded.showId))
      expect(row?.performancePrice).toBeNull()
    })
  })

  test('one show\'s override never reaches another show', async () => {
    await withDatabase((database) => {
      const first = tonightsPerformance(database)
      const second = tonightsPerformance(database, { suffix: 'b' })
      addType(database, 'tt-1', 'Standard', 900)
      database.batch([['INSERT INTO show_ticket_overrides (id, show_id, ticket_type_id, price) VALUES (?, ?, ?, ?)',
        'so-1', first.showId, 'tt-1', 700]])

      expect(read<Row>(database, showPricesQuery(first.showId))[0]?.showPrice).toBe(700)
      expect(read<Row>(database, showPricesQuery(second.showId))[0]?.showPrice).toBeNull()
    })
  })

  // An explicit nought is a free ticket. Null means inherit, and the two must never collapse
  // into each other at any layer (D-120 criterion 1).
  test('an override of nought comes back as nought rather than as nothing', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      addType(database, 'tt-1', 'Standard', 900)
      database.batch([['INSERT INTO show_ticket_overrides (id, show_id, ticket_type_id, price) VALUES (?, ?, ?, ?)',
        'so-1', seeded.showId, 'tt-1', 0]])

      expect(read<Row>(database, showPricesQuery(seeded.showId))[0]?.showPrice).toBe(0)
    })
  })

  test('an archived type is hidden unless this level already prices it', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      addType(database, 'tt-live', 'Standard', 900)
      addType(database, 'tt-old', 'Withdrawn', 500, { archived: 1 })

      expect(read<Row>(database, showPricesQuery(seeded.showId)).map(one => one.ticketTypeId)).toEqual(['tt-live'])

      database.batch([['INSERT INTO show_ticket_overrides (id, show_id, ticket_type_id, price) VALUES (?, ?, ?, ?)',
        'so-1', seeded.showId, 'tt-old', 400]])

      expect(read<Row>(database, showPricesQuery(seeded.showId)).map(one => one.ticketTypeId).sort())
        .toEqual(['tt-live', 'tt-old'])
    })
  })

  test('neither query binds a parameter per ticket type', async () => {
    await withDatabase((database) => {
      for (const statement of [showPricesQuery('show-a'), performancePricesQuery('performance-a')]) {
        const [, ...parameters] = boundStatement(database, statement)
        expect(parameters.length).toBeLessThanOrEqual(2)
      }
    })
  })
})

// Criterion 5: an override change is audited with both figures. Prices are not personal data, so
// the trail carries them rather than only that something moved.
describe('what an override change records', () => {
  const priced = (over: Partial<PricedTicketType> = {}): PricedTicketType => ({
    ticketTypeId: 'tt-1',
    name: 'Standard',
    description: null,
    kind: 'SINGLE',
    accessKind: null,
    archived: false,
    basePrice: 900,
    activeByDefault: true,
    showPrice: null,
    showActive: null,
    performancePrice: null,
    performanceActive: null,
    price: 900,
    source: 'BASE',
    active: true,
    ...over,
  })

  test('a price that moved is recorded with both figures', () => {
    const detail = pricingDetail(
      [priced({ showPrice: 700 })],
      [{ ticketTypeId: 'tt-1', price: 500, active: null }],
      'showPrice',
      'showActive',
    )
    expect(detail).toEqual({ changed: [{ ticketType: 'Standard', price: [700, 500], active: [null, null] }] })
  })

  test('a price that did not move records nothing', () => {
    const detail = pricingDetail(
      [priced({ showPrice: 700 })],
      [{ ticketTypeId: 'tt-1', price: 700, active: null }],
      'showPrice',
      'showActive',
    )
    expect(detail).toEqual({ changed: [] })
  })

  test('clearing an override back to inherit is a change and is recorded', () => {
    const detail = pricingDetail([priced({ showPrice: 700 })], [], 'showPrice', 'showActive')
    expect(detail).toEqual({ changed: [{ ticketType: 'Standard', price: [700, null], active: [null, null] }] })
  })
})
