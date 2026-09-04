import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import {
  PASS_TYPE_REFERENCES,
  everIssuedColumn,
  everIssuedQuery,
  issuedReferences,
  liveCoverageQuery,
} from '#server/utils/pass-types'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { PassCoverageReference, PassTypeReference } from '#server/utils/pass-types'
import type { TestDatabase } from '#tests/helpers/database'

// D-123 on the real migrations. "Ever issued" and "live coverage" are questions about rows in
// other tables, proved here against a stand-in for D-124's `passes`, which does not exist yet.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function insert(database: TestDatabase, table: string, values: Record<string, unknown>): void {
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

function passType(database: TestDatabase, over: Record<string, unknown> = {}): string {
  const values = { id: 'pt-1', slug: 'season-pass', name: 'Season pass', valid_from: 1_000, valid_until: 2_000, ...over }
  insert(database, 'pass_types', values)
  return String(values.id)
}

function issued(database: TestDatabase, statement: ReturnType<typeof everIssuedQuery>): boolean {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<{ everIssued: number }>(database, query, ...parameters)[0]!.everIssued === 1
}

// What D-124 will add, stood up here so the predicates can be proved against rows that do not
// exist yet.
const FUTURE_PASSES: PassTypeReference = {
  table: 'future_passes',
  column: 'pass_type_id',
  issued: true,
  why: 'a stand-in for the passes table, for proving the predicate reads rows',
}

// A minimal stand-in for what D-124's real reference will look like: a correlated count, bound to
// the two ids it is asked about and nothing else.
const FUTURE_COVERAGE: PassCoverageReference = {
  table: 'future_passes',
  liveCount: (passTypeId, showId) =>
    sql`(SELECT count(*) FROM future_passes WHERE pass_type_id = ${passTypeId} AND show_id = ${showId} AND revoked = 0)`,
  why: 'a stand-in for counting held passes still live against one show',
}

function withFuturePasses(database: TestDatabase): void {
  database.raw.exec(`
    CREATE TABLE future_passes (
      id text PRIMARY KEY,
      pass_type_id text NOT NULL REFERENCES pass_types(id),
      show_id text NOT NULL REFERENCES shows(id),
      revoked integer NOT NULL DEFAULT 0
    )
  `)
}

describe('"has ever been issued" is a query over rows, never a flag (criterion 3)', () => {
  test('the table carries no column that could stand in for the predicate', async () => {
    await withDatabase((database) => {
      const columns = rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('pass_types')`)
        .map(column => column.name)
      expect(columns.filter(name => /issued|used|ever/.test(name)).filter(name => name !== 'max_issued')).toEqual([])
    })
  })

  // The one that fails when D-124 lands: a new table pointing at pass_types is an issuance or it
  // is not, and somebody has to say which.
  test('every table pointing at pass_types is classified in the registry', async () => {
    await withDatabase((database) => {
      const tables = rows<{ name: string }>(database, `SELECT name FROM sqlite_master WHERE type = 'table'`)
      const pointing: string[] = []
      for (const { name } of tables) {
        const keys = rows<{ table: string, from: string }>(database, `PRAGMA foreign_key_list('${name}')`)
        for (const key of keys) {
          if (key.table === 'pass_types') pointing.push(`${name}.${key.from}`)
        }
      }
      const declared = PASS_TYPE_REFERENCES.map(reference => `${reference.table}.${reference.column}`)
      expect(pointing.sort()).toEqual(declared.sort())
    })
  })

  test('configuration alone, prices and covered shows, is never an issuance', async () => {
    expect(issuedReferences()).toEqual([])
  })

  test('a pass with no issuance table still says never issued', async () => {
    await withDatabase((database) => {
      const id = passType(database)
      withFuturePasses(database)
      expect(issued(database, everIssuedQuery(id, [FUTURE_PASSES]))).toBe(false)
    })
  })

  // The proof the predicate is not decorative: one held pass flips it, with no write to
  // pass_types at all.
  test('one issued pass flips it, and nothing on the product itself changed', async () => {
    await withDatabase((database) => {
      const id = passType(database)
      withFuturePasses(database)
      insert(database, 'shows', { id: 's1', slug: 'the-seagull', title: 'The Seagull' })
      insert(database, 'future_passes', { id: 'pass-1', pass_type_id: id, show_id: 's1' })

      expect(issued(database, everIssuedQuery(id, [FUTURE_PASSES]))).toBe(true)
      expect(issued(database, everIssuedQuery('pt-other', [FUTURE_PASSES]))).toBe(false)
    })
  })

  test('it binds one parameter per issuance table however many passes there are', async () => {
    await withDatabase((database) => {
      const id = passType(database)
      withFuturePasses(database)
      insert(database, 'shows', { id: 's1', slug: 'the-seagull', title: 'The Seagull' })
      for (let index = 0; index < 200; index++) {
        insert(database, 'future_passes', { id: `pass-${index}`, pass_type_id: id, show_id: 's1' })
      }

      const [, ...parameters] = boundStatement(database, everIssuedQuery(id, [FUTURE_PASSES]))
      expect(parameters).toEqual([id])
    })
  })

  test('the listing answers the same question per row, binding nothing', async () => {
    await withDatabase((database) => {
      const id = passType(database)
      passType(database, { id: 'pt-2', slug: 'flexi-pass', name: 'Flexi pass' })
      withFuturePasses(database)
      insert(database, 'shows', { id: 's1', slug: 'the-seagull', title: 'The Seagull' })
      insert(database, 'future_passes', { id: 'pass-1', pass_type_id: id, show_id: 's1' })

      const [query, ...parameters] = boundStatement(database, everIssuedColumn('t', [FUTURE_PASSES]))
      expect(parameters).toEqual([])

      const listed = rows<{ id: string, everIssued: number }>(
        database,
        `SELECT t.id AS id, ${query} AS everIssued FROM pass_types t ORDER BY t.id`,
      )
      expect(listed).toEqual([{ id: 'pt-1', everIssued: 1 }, { id: 'pt-2', everIssued: 0 }])
    })
  })
})

describe('a live pass against a show is a count over rows (criterion 4)', () => {
  test('nothing live until D-124 exists', async () => {
    await withDatabase((database) => {
      const [query] = boundStatement(database, liveCoverageQuery('pt-1', 's1'))
      const [row] = rows<{ live: number }>(database, query)
      expect(row!.live).toBe(0)
    })
  })

  test('a revoked pass does not count as live', async () => {
    await withDatabase((database) => {
      const id = passType(database)
      withFuturePasses(database)
      insert(database, 'shows', { id: 's1', slug: 'the-seagull', title: 'The Seagull' })
      insert(database, 'future_passes', { id: 'pass-1', pass_type_id: id, show_id: 's1', revoked: 1 })

      const [query, ...parameters] = boundStatement(database, liveCoverageQuery(id, 's1', [FUTURE_COVERAGE]))
      const [row] = rows<{ live: number }>(database, query, ...parameters)
      expect(row!.live).toBe(0)
    })
  })

  test('a live pass against the show flips the count', async () => {
    await withDatabase((database) => {
      const id = passType(database)
      withFuturePasses(database)
      insert(database, 'shows', { id: 's1', slug: 'the-seagull', title: 'The Seagull' })
      insert(database, 'shows', { id: 's2', slug: 'uncle-vanya', title: 'Uncle Vanya' })
      insert(database, 'future_passes', { id: 'pass-1', pass_type_id: id, show_id: 's1' })

      const covering = boundStatement(database, liveCoverageQuery(id, 's1', [FUTURE_COVERAGE]))
      const [row] = rows<{ live: number }>(database, covering[0], ...covering.slice(1))
      expect(row!.live).toBe(1)

      const notCovering = boundStatement(database, liveCoverageQuery(id, 's2', [FUTURE_COVERAGE]))
      const [other] = rows<{ live: number }>(database, notCovering[0], ...notCovering.slice(1))
      expect(other!.live).toBe(0)
    })
  })
})

describe('a pass product with prices and covered shows (criterion 1)', () => {
  test('a valid window is required, and it may not run backwards', async () => {
    await withDatabase((database) => {
      expect(() => passType(database, { valid_from: 2_000, valid_until: 1_000 })).toThrow()
    })
  })

  test('the cap is a positive number or nothing at all', async () => {
    await withDatabase((database) => {
      expect(() => passType(database, { id: 'pt-cap', max_issued: 200 })).not.toThrow()
      expect(() => passType(database, { id: 'pt-zero', max_issued: 0 })).toThrow()
    })
  })

  test('price points and covered shows cascade when the product is deleted', async () => {
    await withDatabase((database) => {
      const id = passType(database)
      insert(database, 'shows', { id: 's1', slug: 'the-seagull', title: 'The Seagull' })
      insert(database, 'pass_type_prices', { id: 'price-1', pass_type_id: id, label: 'Standard', price: 4500 })
      insert(database, 'pass_type_shows', { id: 'cover-1', pass_type_id: id, show_id: 's1' })

      database.batch([['DELETE FROM pass_types WHERE id = ?', id]])

      expect(rows<{ n: number }>(database, 'SELECT count(*) n FROM pass_type_prices')[0]!.n).toBe(0)
      expect(rows<{ n: number }>(database, 'SELECT count(*) n FROM pass_type_shows')[0]!.n).toBe(0)
    })
  })

  // The show side restricts: a show a pass covers cannot be deleted out from under it.
  test('a covered show cannot be deleted while a pass points at it', async () => {
    await withDatabase((database) => {
      const id = passType(database)
      insert(database, 'shows', { id: 's1', slug: 'the-seagull', title: 'The Seagull' })
      insert(database, 'pass_type_shows', { id: 'cover-1', pass_type_id: id, show_id: 's1' })

      expect(() => database.batch([['DELETE FROM shows WHERE id = ?', 's1']])).toThrow()
    })
  })
})
