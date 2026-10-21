import { describe, expect, test } from 'bun:test'
import { passOffersQuery } from '#server/utils/passes'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'

// D-133 criterion 1 on the real migrations: what the booking page offers, and what it never does.

const NOW = 1_500

interface Offered {
  id: string
  coveredShows: number
  requested: number
}

interface PassTypeOptions {
  slug?: string
  status?: string
  validUntil?: number
  salesOpenAt?: number | null
  salesCloseAt?: number | null
  maxIssued?: number | null
  covers?: boolean
}

async function withDatabase(fn: (database: TestDatabase, showId: string) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    const tonight = tonightsPerformance(database)
    database.batch([
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-1', 'one@example.invalid', 'One'],
      ['INSERT INTO shows (id, slug, title, status) VALUES (?, ?, ?, ?)', 'show-other', 'another-show', 'Another Show', 'PUBLISHED'],
    ])
    await fn(database, tonight.showId)
  }
  finally {
    database.close()
  }
}

function passType(database: TestDatabase, id: string, showId: string, options: PassTypeOptions = {}): void {
  database.batch([
    ['INSERT INTO pass_types (id, slug, name, status, valid_from, valid_until, sales_open_at, sales_close_at, max_issued) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, options.slug ?? id, `Pass ${id}`, options.status ?? 'ON_SALE', 1_000, options.validUntil ?? 2_000,
      options.salesOpenAt ?? null, options.salesCloseAt ?? null, options.maxIssued ?? null],
    ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, ?)', `${id}-price`, id, 'Standard', 4500],
    ...(options.covers === false
      ? []
      : [['INSERT INTO pass_type_shows (id, pass_type_id, show_id) VALUES (?, ?, ?)', `${id}-cover`, id, showId] as [string, ...unknown[]]]),
  ])
}

function offered(database: TestDatabase, showId: string, userId: string | null): Offered[] {
  return rows<Offered>(database, ...boundStatement(database, passOffersQuery(showId, userId, NOW)))
}

describe('a pass is offered while booking only when it could be sold today (D-133 criterion 1)', () => {
  test('one on sale and covering the show is offered, with every show it covers counted', async () => {
    await withDatabase((database, showId) => {
      passType(database, 'pt-1', showId)
      database.batch([['INSERT INTO pass_type_shows (id, pass_type_id, show_id) VALUES (?, ?, ?)', 'pt-1-cover-2', 'pt-1', 'show-other']])
      const offers = offered(database, showId, null)
      expect(offers.map(one => one.id)).toEqual(['pt-1'])
      expect(offers[0]!.coveredShows).toBe(2)
    })
  })

  test('one that does not cover the show is not offered', async () => {
    await withDatabase((database, showId) => {
      passType(database, 'pt-1', showId, { covers: false })
      expect(offered(database, showId, null)).toEqual([])
    })
  })

  test('a draft, a closed, an expired or a reserved pass is not offered', async () => {
    await withDatabase((database, showId) => {
      passType(database, 'pt-draft', showId, { status: 'DRAFT' })
      passType(database, 'pt-closed', showId, { status: 'CLOSED' })
      passType(database, 'pt-expired', showId, { validUntil: NOW - 1 })
      passType(database, 'pt-fellowship', showId, { slug: 'fellowship' })
      expect(offered(database, showId, null)).toEqual([])
    })
  })

  test('outside its sales window it is not offered', async () => {
    await withDatabase((database, showId) => {
      passType(database, 'pt-early', showId, { salesOpenAt: NOW + 1 })
      passType(database, 'pt-late', showId, { salesCloseAt: NOW })
      expect(offered(database, showId, null)).toEqual([])
    })
  })

  test('at its cap it is not offered', async () => {
    await withDatabase((database, showId) => {
      passType(database, 'pt-1', showId, { maxIssued: 1 })
      database.batch([
        ['INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          'pass-1', 'ABC234', 'pt-1', 'pt-1-price', 'u-1', 4500, 'ACTIVE', 'u-1'],
      ])
      expect(offered(database, showId, null)).toEqual([])
    })
  })
})

describe('what a signed-in booker is offered depends on what they already have (D-133 criterion 2)', () => {
  test('a pass they already hold is not offered again', async () => {
    await withDatabase((database, showId) => {
      passType(database, 'pt-1', showId)
      database.batch([
        ['INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          'pass-1', 'ABC234', 'pt-1', 'pt-1-price', 'u-1', 4500, 'ACTIVE', 'u-1'],
      ])
      expect(offered(database, showId, 'u-1')).toEqual([])
      expect(offered(database, showId, null).map(one => one.id)).toEqual(['pt-1'])
    })
  })

  test('a pass they have asked for is offered marked as asked', async () => {
    await withDatabase((database, showId) => {
      passType(database, 'pt-1', showId)
      database.batch([['INSERT INTO pass_requests (id, pass_type_id, user_id) VALUES (?, ?, ?)', 'r-1', 'pt-1', 'u-1']])
      expect(offered(database, showId, 'u-1')[0]!.requested).toBe(1)
      expect(offered(database, showId, null)[0]!.requested).toBe(0)
    })
  })
})
