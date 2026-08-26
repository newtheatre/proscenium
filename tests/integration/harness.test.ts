import { describe, expect, test } from 'bun:test'
import { MAX_BOUND_PARAMETERS, createTestDatabase, rows } from '#tests/helpers/database'

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
})
