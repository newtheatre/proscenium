import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { auditIfChanged } from '#server/utils/audit'
import { heldPricePointsRemovedQuery, newPassTypeChildren, priceUpsertStatements, updatePassTypeStatement } from '#server/utils/pass-types'
import { auditEntry } from '#shared/utils/audit'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// 0049 on the real migrations: a pass type's price points and shows follow only a write that
// applied, because each is gated on that write's own audit row, batched straight after it.

function run(database: TestDatabase, statement: SQL): unknown[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as unknown[]
}

async function withDatabase(fn: (database: TestDatabase) => void): Promise<void> {
  const database = await createTestDatabase()
  try {
    fn(database)
  }
  finally {
    database.close()
  }
}

function seed(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO pass_types (id, slug, name, valid_from, valid_until) VALUES (?, ?, ?, ?, ?)', 'pt-a', 'season', 'Season', 1_000, 2_000],
    ['INSERT INTO pass_types (id, slug, name, valid_from, valid_until) VALUES (?, ?, ?, ?, ?)', 'pt-b', 'flexi', 'Flexi', 1_000, 2_000],
    ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, ?)', 'price-b', 'pt-b', 'Standard', 3000],
    ['INSERT INTO shows (id, slug, title, status) VALUES (?, ?, ?, ?)', 'show-1', 'the-seagull', 'The Seagull', 'DRAFT'],
  ])
}

// The route's edit, its entry, then the price points: one batch, in this order.
function edit(database: TestDatabase, slug: string, prices: { label: string, price: number }[]): unknown[] {
  const entry = auditEntry({ actorId: null, action: 'pass-type.updated', target: 'pass-type:pt-b' })
  const written = run(database, updatePassTypeStatement('pt-b', {
    slug, name: 'Flexi', description: null, status: 'ON_SALE', validFrom: 1_000, validUntil: 2_000,
    salesOpenAt: null, salesCloseAt: null, maxIssued: null, prices,
  }))
  run(database, auditIfChanged(entry))
  for (const statement of priceUpsertStatements('pt-b', prices, entry)) run(database, statement)
  return written
}

const rename = (database: TestDatabase, slug: string): unknown[] => edit(database, slug, [{ label: 'Changed', price: 100 }])

const labels = (database: TestDatabase, passTypeId: string): string[] =>
  rows<{ label: string }>(database, 'SELECT label FROM pass_type_prices WHERE pass_type_id = ? ORDER BY label', passTypeId).map(row => row.label)

describe('a pass type\'s price points move only with the write they belong to (0049)', () => {
  test('a rename refused onto a held address keeps the old price points and adds none', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(rename(database, 'season')).toHaveLength(0)
      expect(labels(database, 'pt-b')).toEqual(['Standard'])
    })
  })

  test('an edit that applied replaces them in the same batch', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(rename(database, 'flexi-plus')).toHaveLength(1)
      expect(labels(database, 'pt-b')).toEqual(['Changed'])
    })
  })

  test('a create refused on its address leaves no price points or shows behind', async () => {
    await withDatabase((database) => {
      seed(database)
      const entry = auditEntry({ actorId: null, action: 'pass-type.created', target: 'pass-type:pt-c' })
      run(database, sql`
        INSERT INTO pass_types (id, slug, name, valid_from, valid_until, status)
        SELECT 'pt-c', 'season', 'Another season', 1000, 2000, 'DRAFT'
        WHERE NOT EXISTS (SELECT 1 FROM pass_types WHERE slug = 'season')
        RETURNING id
      `)
      run(database, auditIfChanged(entry))
      for (const statement of newPassTypeChildren('pt-c', [{ label: 'Standard', price: 4500 }], ['show-1'], entry)) run(database, statement)

      expect(labels(database, 'pt-c')).toEqual([])
      expect(rows(database, 'SELECT id FROM pass_type_shows WHERE pass_type_id = ?', 'pt-c')).toEqual([])
    })
  })

  test('a create that applied carries its price points and shows', async () => {
    await withDatabase((database) => {
      seed(database)
      const entry = auditEntry({ actorId: null, action: 'pass-type.created', target: 'pass-type:pt-c' })
      run(database, sql`
        INSERT INTO pass_types (id, slug, name, valid_from, valid_until, status)
        SELECT 'pt-c', 'autumn', 'Autumn', 1000, 2000, 'DRAFT'
        WHERE NOT EXISTS (SELECT 1 FROM pass_types WHERE slug = 'autumn')
        RETURNING id
      `)
      run(database, auditIfChanged(entry))
      for (const statement of newPassTypeChildren('pt-c', [{ label: 'Standard', price: 4500 }], ['show-1'], entry)) run(database, statement)

      expect(labels(database, 'pt-c')).toEqual(['Standard'])
      expect(rows(database, 'SELECT show_id AS showId FROM pass_type_shows WHERE pass_type_id = ?', 'pt-c')).toEqual([{ showId: 'show-1' }])
    })
  })
})

// An issued pass holds its price point (RESTRICT, D-124), so price points are kept by label and
// changed in place: an edit only refuses when it would remove one a pass holds.
describe('a pass type with passes issued is still edited, price points kept by label', () => {
  function issued(database: TestDatabase): void {
    seed(database)
    database.batch([
      ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-1', 'holder@example.invalid', 'A Holder (test)'],
      ['INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid) VALUES (?, ?, ?, ?, ?, ?)',
        'pass-1', 'PASS01', 'pt-b', 'price-b', 'u-1', 3000],
    ])
  }

  const points = (database: TestDatabase): { id: string, label: string, price: number }[] =>
    rows(database, 'SELECT id, label, price FROM pass_type_prices WHERE pass_type_id = ? ORDER BY label', 'pt-b')

  test('a rename with the same price points applies, and the issued pass keeps its price point', async () => {
    await withDatabase((database) => {
      issued(database)
      expect(edit(database, 'flexi-renamed', [{ label: 'Standard', price: 3000 }])).toHaveLength(1)
      expect(points(database)).toEqual([{ id: 'price-b', label: 'Standard', price: 3000 }])
    })
  })

  test('a held price point changes its price in place, and the pass keeps what it paid', async () => {
    await withDatabase((database) => {
      issued(database)
      expect(edit(database, 'flexi', [{ label: 'Standard', price: 3500 }, { label: 'Concession', price: 2000 }])).toHaveLength(1)
      expect(points(database).map(point => [point.id === 'price-b', point.label, point.price]))
        .toEqual([[false, 'Concession', 2000], [true, 'Standard', 3500]])
      expect(rows(database, 'SELECT price_paid AS paid FROM passes WHERE id = ?', 'pass-1')).toEqual([{ paid: 3000 }])
    })
  })

  test('removing a price point a pass holds is refused, writing nothing, and the refusal can name it', async () => {
    await withDatabase((database) => {
      issued(database)
      expect(edit(database, 'flexi', [{ label: 'Deluxe', price: 5000 }])).toHaveLength(0)
      expect(points(database)).toEqual([{ id: 'price-b', label: 'Standard', price: 3000 }])
      expect(rows(database, 'SELECT id FROM audit_log WHERE action = ?', 'pass-type.updated')).toEqual([])
      expect(run(database, heldPricePointsRemovedQuery('pt-b', ['Deluxe']))).toEqual([{ label: 'Standard' }])
    })
  })

  test('removing a price point nobody holds applies', async () => {
    await withDatabase((database) => {
      issued(database)
      database.batch([['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, ?)', 'price-c', 'pt-b', 'Concession', 2000]])
      expect(edit(database, 'flexi', [{ label: 'Standard', price: 3000 }])).toHaveLength(1)
      expect(points(database)).toEqual([{ id: 'price-b', label: 'Standard', price: 3000 }])
    })
  })
})
