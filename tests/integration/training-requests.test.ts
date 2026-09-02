import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// G-104 criterion 1 says a database constraint, not an application read, so this is where it is
// proved: the partial unique index is the whole of the rule.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function seed(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u1', 'one@example.invalid', 'A Member'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u2', 'two@example.invalid', 'Another'],
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
    ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
      'TECH-1', 'TECH', 'MODULE', 'Working at height', 'ACTIVE'],
    ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
      'TECH-2', 'TECH', 'MODULE', 'Rigging', 'ACTIVE'],
  ])
}

function ask(database: TestDatabase, columns: Record<string, unknown> = {}): void {
  const values: Record<string, unknown> = {
    id: `q-${Math.random().toString(36).slice(2, 10)}`,
    user_id: 'u1',
    module_id: 'TECH-1',
    ...columns,
  }
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO module_requests (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

describe('one open ask per person per module (G-104 criterion 1)', () => {
  test('a second open ask for the same module is refused by the database', async () => {
    await withDatabase((database) => {
      seed(database)
      ask(database)
      expect(() => ask(database)).toThrow()
      expect(rows(database, 'SELECT id FROM module_requests')).toHaveLength(1)
    })
  })

  test('two people may each ask for the same module', async () => {
    await withDatabase((database) => {
      seed(database)
      ask(database)
      ask(database, { user_id: 'u2' })
      expect(rows(database, 'SELECT id FROM module_requests')).toHaveLength(2)
    })
  })

  test('one person may ask for two modules', async () => {
    await withDatabase((database) => {
      seed(database)
      ask(database)
      ask(database, { module_id: 'TECH-2' })
      expect(rows(database, 'SELECT id FROM module_requests')).toHaveLength(2)
    })
  })

  // The index is partial on OPEN, which is what makes withdrawing free the re-ask: an answered or
  // withdrawn row leaves the index rather than blocking the next one.
  test('withdrawing frees the re-ask, and so does being answered', async () => {
    await withDatabase((database) => {
      seed(database)
      ask(database, { id: 'q-first' })
      database.batch([[`UPDATE module_requests SET status = 'WITHDRAWN' WHERE id = 'q-first'`]])
      ask(database, { id: 'q-second' })

      database.batch([[`UPDATE module_requests SET status = 'DECLINED', reason = 'Not this term' WHERE id = 'q-second'`]])
      ask(database, { id: 'q-third' })

      expect(rows(database, 'SELECT id FROM module_requests')).toHaveLength(3)
      expect(rows(database, `SELECT id FROM module_requests WHERE status = 'OPEN'`)).toHaveLength(1)
    })
  })

  test('an answered ask does not block a second answered one either', async () => {
    await withDatabase((database) => {
      seed(database)
      ask(database, { status: 'DECLINED', reason: 'Not this term' })
      ask(database, { status: 'DECLINED', reason: 'Still not this term' })
      expect(rows(database, 'SELECT id FROM module_requests')).toHaveLength(2)
    })
  })

  test('a status outside the four is refused', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => ask(database, { status: 'PENDING' })).toThrow()
    })
  })
})

describe('what a request is attached to (G-104)', () => {
  test('a request dies with the person, because it is a thing they said', async () => {
    await withDatabase((database) => {
      seed(database)
      ask(database)
      database.batch([['DELETE FROM users WHERE id = ?', 'u1']])
      expect(rows(database, 'SELECT id FROM module_requests')).toHaveLength(0)
    })
  })

  test('a request dies with the module, because the demand was for that module', async () => {
    await withDatabase((database) => {
      seed(database)
      ask(database)
      database.batch([['DELETE FROM modules WHERE id = ?', 'TECH-1']])
      expect(rows(database, 'SELECT id FROM module_requests')).toHaveLength(0)
    })
  })
})
