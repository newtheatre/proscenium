import { describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { applyTag, databaseBefore, execMigration, migrationSql } from '#tests/helpers/migrations'

// Proves the copy against a scratch database seeded with the real old shape (0010), since
// `check migrations` cannot see a silently omitted or mis-copied column.

const REBUILD_TAG = '0073_the_venue_emergency_card_is_versioned_and_append_only'

function seedVenue(raw: Database, id: string): void {
  raw.exec(`INSERT INTO venues (id, name) VALUES ('${id}', 'Test venue')`)
}

function seedUser(raw: Database, id: string): void {
  raw.exec(`INSERT INTO users (id, name, email, verified) VALUES ('${id}', 'Someone', '${id}@e2e.newtheatre.org.uk', 1)`)
}

describe('the venue_emergency_info rebuild copies a real old-shape row (0010)', () => {
  test('every existing column survives, and the new id is generated, not the literal string "id"', async () => {
    const raw = await databaseBefore(REBUILD_TAG)
    try {
      seedVenue(raw, 'venue-1')
      seedUser(raw, 'user-1')
      raw.exec(`
        INSERT INTO venue_emergency_info (venue_id, assembly_point, exits, isolation_points, what3words, notes, updated_by, updated_at)
        VALUES ('venue-1', 'The car park behind the theatre', 'Stage door and the foyer', 'Lighting isolation is in the box', 'towns.match.press', 'Nearest defibrillator is in the foyer', 'user-1', 1700000000)
      `)

      await applyTag(raw, REBUILD_TAG)

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
    const raw = await databaseBefore(REBUILD_TAG)
    try {
      seedVenue(raw, 'venue-1')
      raw.exec(`
        INSERT INTO venue_emergency_info (venue_id, assembly_point, exits, isolation_points, what3words, notes, updated_by, updated_at)
        VALUES ('venue-1', 'The car park', NULL, NULL, NULL, NULL, NULL, 1700000000)
      `)

      const sql = await migrationSql(REBUILD_TAG)
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
    const raw = await databaseBefore(REBUILD_TAG)
    try {
      await applyTag(raw, REBUILD_TAG)

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
