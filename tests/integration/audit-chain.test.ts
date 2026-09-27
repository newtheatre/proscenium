import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { auditIfChanged } from '#server/utils/audit'
import { auditEntry } from '#shared/utils/audit'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// 0049: `auditedWrite` batches one `auditIfChanged` per entry after the write. Each reads the
// `changes()` of the insert before it, so the entries land all together, or not at all.

function run(database: TestDatabase, statement: SQL): unknown[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as unknown[]
}

function namedSeason(database: TestDatabase, id: string, name: string): unknown[] {
  return run(database, sql`
    INSERT INTO seasons (id, name, starts_on, ends_on, archived)
    SELECT ${id}, ${name}, '2026-09-01', '2026-12-20', 0
    WHERE NOT EXISTS (SELECT 1 FROM seasons WHERE name = ${name} COLLATE NOCASE)
    RETURNING id
  `)
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

const trail = (database: TestDatabase): string[] =>
  rows<{ action: string }>(database, 'SELECT action FROM audit_log WHERE target LIKE ? ORDER BY action', 'season:%').map(row => row.action)

describe('entries chained after one conditional write (0049)', () => {
  test('a write that applied lands every entry after it', async () => {
    await withDatabase((database) => {
      expect(namedSeason(database, 's-1', 'Autumn')).toHaveLength(1)
      run(database, auditIfChanged(auditEntry({ actorId: null, action: 'season.created', target: 'season:s-1' })))
      run(database, auditIfChanged(auditEntry({ actorId: null, action: 'season.updated', target: 'season:s-1' })))
      expect(trail(database)).toEqual(['season.created', 'season.updated'])
    })
  })

  test('a write its predicate refused lands none of them', async () => {
    await withDatabase((database) => {
      namedSeason(database, 's-1', 'Autumn')
      expect(namedSeason(database, 's-2', 'AUTUMN')).toHaveLength(0)
      run(database, auditIfChanged(auditEntry({ actorId: null, action: 'season.created', target: 'season:s-2' })))
      run(database, auditIfChanged(auditEntry({ actorId: null, action: 'season.updated', target: 'season:s-2' })))
      expect(trail(database)).toEqual([])
    })
  })
})
