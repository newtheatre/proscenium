import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { auditIfChanged } from '#server/utils/audit'
import { newPassTypeChildren, replacePricesStatements } from '#server/utils/pass-types'
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

// The route's rename, its entry, then the price replace: one batch, in this order.
function rename(database: TestDatabase, slug: string): unknown[] {
  const entry = auditEntry({ actorId: null, action: 'pass-type.updated', target: 'pass-type:pt-b' })
  const written = run(database, sql`
    UPDATE pass_types SET slug = ${slug}
    WHERE id = 'pt-b' AND NOT EXISTS (SELECT 1 FROM pass_types WHERE slug = ${slug} AND id <> 'pt-b')
    RETURNING id
  `)
  run(database, auditIfChanged(entry))
  for (const statement of replacePricesStatements('pt-b', [{ label: 'Changed', price: 100 }], entry)) run(database, statement)
  return written
}

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
