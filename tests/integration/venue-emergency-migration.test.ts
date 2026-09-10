import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { join } from 'node:path'

// Proves the copy against a scratch database seeded with the real old shape (0010), since
// `check migrations` cannot see a silently omitted or mis-copied column.

const MIGRATIONS_DIR = 'server/db/migrations/sqlite'
const REBUILD_TAG = '0073_the_venue_emergency_card_is_versioned_and_append_only'

interface JournalEntry { tag: string }

async function journalTags(): Promise<string[]> {
  const journal = await Bun.file(join(MIGRATIONS_DIR, 'meta', '_journal.json')).json() as { entries: JournalEntry[] }
  return journal.entries.map(entry => entry.tag)
}

function execMigration(raw: Database, sql: string): void {
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim()
    if (trimmed) raw.exec(trimmed)
  }
}

// Every migration up to, but not including, the rebuild: the shape a real seeded row must match.
async function scratchDatabaseBeforeRebuild(): Promise<Database> {
  const raw = new Database(':memory:')
  raw.exec('PRAGMA foreign_keys = ON;')
  const tags = await journalTags()
  const cutoff = tags.indexOf(REBUILD_TAG)
  if (cutoff === -1) throw new Error(`${REBUILD_TAG} is not in the journal; has it been renumbered?`)
  for (const tag of tags.slice(0, cutoff)) {
    execMigration(raw, await Bun.file(join(MIGRATIONS_DIR, `${tag}.sql`)).text())
  }
  return raw
}

async function rebuildMigrationSql(): Promise<string> {
  return Bun.file(join(MIGRATIONS_DIR, `${REBUILD_TAG}.sql`)).text()
}

function seedVenue(raw: Database, id: string): void {
  raw.exec(`INSERT INTO venues (id, name) VALUES ('${id}', 'Test venue')`)
}

function seedUser(raw: Database, id: string): void {
  raw.exec(`INSERT INTO users (id, name, email, verified) VALUES ('${id}', 'Someone', '${id}@e2e.newtheatre.org.uk', 1)`)
}

describe('the venue_emergency_info rebuild copies a real old-shape row (0010)', () => {
  test('every existing column survives, and the new id is generated, not the literal string "id"', async () => {
    const raw = await scratchDatabaseBeforeRebuild()
    try {
      seedVenue(raw, 'venue-1')
      seedUser(raw, 'user-1')
      raw.exec(`
        INSERT INTO venue_emergency_info (venue_id, assembly_point, exits, isolation_points, what3words, notes, updated_by, updated_at)
        VALUES ('venue-1', 'The car park behind the theatre', 'Stage door and the foyer', 'Lighting isolation is in the box', 'towns.match.press', 'Nearest defibrillator is in the foyer', 'user-1', 1700000000)
      `)

      execMigration(raw, await rebuildMigrationSql())

      const rows = raw.query('SELECT * FROM venue_emergency_info').all() as Record<string, unknown>[]
      expect(rows).toHaveLength(1)
      const row = rows[0]!
      expect(row).toMatchObject({
        venue_id: 'venue-1',
        assembly_point: 'The car park behind the theatre',
        exits: 'Stage door and the foyer',
        isolation_points: 'Lighting isolation is in the box',
        what3words: 'towns.match.press',
        notes: 'Nearest defibrillator is in the foyer',
        updated_by: 'user-1',
        updated_at: 1700000000,
      })
      // The bug this guards against: a bare `"id"` in the generated SELECT reads as the
      // literal string "id" under SQLite's double-quoted-identifier fallback, not an error.
      expect(row.id).not.toBe('id')
      expect(typeof row.id).toBe('string')
      expect((row.id as string).length).toBe(32)
    }
    finally {
      raw.close()
    }
  })

  test('a null updated_by aborts the migration loudly rather than writing a wrong value', async () => {
    const raw = await scratchDatabaseBeforeRebuild()
    try {
      seedVenue(raw, 'venue-1')
      raw.exec(`
        INSERT INTO venue_emergency_info (venue_id, assembly_point, exits, isolation_points, what3words, notes, updated_by, updated_at)
        VALUES ('venue-1', 'The car park', NULL, NULL, NULL, NULL, NULL, 1700000000)
      `)

      const sql = await rebuildMigrationSql()
      expect(() => execMigration(raw, sql)).toThrow()

      // Confirms an abort, not a partial apply: the old table (or a half-built new one) is what
      // is left, never a `venue_emergency_info` row with a silently substituted `updated_by`.
      const stillOld = raw.query(`SELECT venue_id FROM venue_emergency_info WHERE venue_id = 'venue-1'`).all()
      expect(stillOld).toHaveLength(1)
    }
    finally {
      raw.close()
    }
  })

  test('both foreign keys are re-emitted with restrict, not dropped by the rebuild', async () => {
    const raw = await scratchDatabaseBeforeRebuild()
    try {
      execMigration(raw, await rebuildMigrationSql())

      const foreignKeys = raw.query('PRAGMA foreign_key_list(venue_emergency_info)').all() as { table: string, from: string, on_delete: string }[]
      expect(foreignKeys).toHaveLength(2)
      expect(foreignKeys.find(fk => fk.from === 'venue_id')).toMatchObject({ table: 'venues', on_delete: 'RESTRICT' })
      expect(foreignKeys.find(fk => fk.from === 'updated_by')).toMatchObject({ table: 'users', on_delete: 'RESTRICT' })
    }
    finally {
      raw.close()
    }
  })
})
