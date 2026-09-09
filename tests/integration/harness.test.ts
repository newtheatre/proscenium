import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { MAX_BOUND_PARAMETERS, applyMigration, applyMigrations, createTestDatabase, rows } from '#tests/helpers/database'

describe('the integration harness', () => {
  test('applies the compiled migrations and gives a usable database', async () => {
    const database = await createTestDatabase()
    try {
      database.raw.exec('CREATE TABLE probe (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
      database.batch([['INSERT INTO probe (name) VALUES (?)', 'curtain up']])
      expect(rows<{ name: string }>(database, 'SELECT name FROM probe')).toEqual([{ name: 'curtain up' }])
    }
    finally { database.close() }
  })

  test('foreign keys are enforced, as they are in production', async () => {
    const database = await createTestDatabase()
    try {
      database.raw.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY)')
      database.raw.exec('CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id))')
      expect(() => database.batch([['INSERT INTO child (parent_id) VALUES (?)', 999]])).toThrow()
    }
    finally { database.close() }
  })

  // Atomicity is batch only (0001, 0003), so a failing statement must leave nothing behind.
  test('a batch is all or nothing', async () => {
    const database = await createTestDatabase()
    try {
      database.raw.exec('CREATE TABLE ledger (id INTEGER PRIMARY KEY, pence INTEGER NOT NULL)')
      expect(() => database.batch([
        ['INSERT INTO ledger (pence) VALUES (?)', 500],
        ['INSERT INTO ledger (pence) VALUES (?)', null],
      ])).toThrow()
      expect(rows(database, 'SELECT * FROM ledger')).toEqual([])
    }
    finally { database.close() }
  })

  // SQLite would accept this and D1 would not, so the harness refuses it here (0003).
  test('a statement over the chunk limit is refused', async () => {
    const database = await createTestDatabase()
    try {
      database.raw.exec('CREATE TABLE wide (id INTEGER PRIMARY KEY)')
      const parameters = Array.from({ length: MAX_BOUND_PARAMETERS + 1 }, (_, i) => i)
      const placeholders = parameters.map(() => '?').join(',')
      expect(() => database.batch([[`SELECT 1 WHERE 1 IN (${placeholders})`, ...parameters]]))
        .toThrow(/over the 90 chunk limit/)
    }
    finally { database.close() }
  })

  // What a test proving a specific rebuild's own copy needs: the schema as it stood right
  // before that migration, then that migration alone, so a seeded old-shape row is real (0052).
  test('applyMigrations can stop before a tag, and applyMigration finishes just that one', async () => {
    const raw = new Database(':memory:')
    raw.exec('PRAGMA foreign_keys = ON;')
    try {
      const applied = await applyMigrations(raw, '0001_audit_log_append_only')
      expect(applied).not.toContain('0001_audit_log_append_only')

      raw.exec(`INSERT INTO audit_log (id, action) VALUES ('a1', 'test.action')`)
      expect(() => raw.exec(`UPDATE audit_log SET action = 'test.other' WHERE id = 'a1'`)).not.toThrow()

      await applyMigration(raw, '0001_audit_log_append_only')
      expect(() => raw.exec(`UPDATE audit_log SET action = 'test.again' WHERE id = 'a1'`)).toThrow()
    }
    finally { raw.close() }
  })
})
