import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { erasureStatements } from '#shared/utils/erasure'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function addPerson(database: TestDatabase, id: string, email: string): void {
  database.batch([['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', id, email, 'A Member (test)']])
}

function addMembership(database: TestDatabase, id: string, userId: string, startsOn: string, expiresOn: string): void {
  database.batch([[
    'INSERT INTO memberships (id, user_id, starts_on, expires_on, source) VALUES (?, ?, ?, ?, ?)',
    id, userId, startsOn, expiresOn, 'MANUAL',
  ]])
}

describe('the membership table holds a term (0031)', () => {
  test('a term that ends before it starts is refused by the schema', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1', 'member@example.invalid')
      expect(() => addMembership(database, 'm-1', 'u-1', '2027-09-14', '2026-09-13')).toThrow()
    })
  })

  test('a source the schema does not know is refused', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1', 'member@example.invalid')
      expect(() => database.batch([[
        'INSERT INTO memberships (id, user_id, starts_on, expires_on, source) VALUES (?, ?, ?, ?, ?)',
        'm-1', 'u-1', '2026-09-14', '2027-09-13', 'PURCHASE',
      ]])).toThrow()
    })
  })

  // History is never deleted, so a second term sits beside the first (criterion 6).
  test('a renewal is another row rather than a rewrite', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1', 'member@example.invalid')
      addMembership(database, 'm-1', 'u-1', '2023-09-14', '2024-09-13')
      addMembership(database, 'm-2', 'u-1', '2024-09-01', '2027-08-31')
      expect(rows(database, 'SELECT id FROM memberships WHERE user_id = ?', 'u-1')).toHaveLength(2)
    })
  })
})

describe('the student number is on the account (0031)', () => {
  test('two accounts cannot hold the same number', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1', 'one@example.invalid')
      addPerson(database, 'u-2', 'two@example.invalid')
      database.batch([['UPDATE users SET student_id = ? WHERE id = ?', '20123456', 'u-1']])
      expect(() => database.batch([['UPDATE users SET student_id = ? WHERE id = ?', '20123456', 'u-2']])).toThrow()
    })
  })

  test('erasure takes it, and the guard refuses to put one back', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1', 'member@example.invalid')
      database.batch([['UPDATE users SET student_id = ? WHERE id = ?', '20123456', 'u-1']])

      database.batch(erasureStatements('u-1', 1780000001).map(statement => boundStatement(database, statement)))
      expect(rows<{ studentId: string | null }>(database, 'SELECT student_id AS studentId FROM users WHERE id = ?', 'u-1')[0]!.studentId)
        .toBeNull()

      expect(() => database.batch([['UPDATE users SET student_id = ? WHERE id = ?', '20123456', 'u-1']])).toThrow()
    })
  })

  test('an erasure keeps the term and takes only the evidence', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1', 'member@example.invalid')
      addMembership(database, 'm-1', 'u-1', '2026-09-14', '2027-09-13')
      database.batch([['UPDATE memberships SET evidence = ? WHERE id = ?', 'SU receipt for a named person', 'm-1']])

      database.batch(erasureStatements('u-1', 1780000001).map(statement => boundStatement(database, statement)))

      const [held] = rows<{ starts: string, evidence: string | null }>(
        database, 'SELECT starts_on AS starts, evidence FROM memberships WHERE id = ?', 'm-1')
      expect(held!.starts).toBe('2026-09-14')
      expect(held!.evidence).toBeNull()
    })
  })
})

// The one thing a hand-reviewed rebuild is for: 0010 rebuilds memberships, and a column missing
// from its copying INSERT would take the rows with it.
describe('the rebuild carries every row it found (0010)', () => {
  test('rows written under the old shape survive the migration that changes it', async () => {
    const raw = new Database(':memory:')
    raw.exec('PRAGMA foreign_keys = ON;')
    const dir = 'server/db/migrations/sqlite'

    async function apply(tag: string): Promise<void> {
      for (const statement of (await Bun.file(join(dir, `${tag}.sql`)).text()).split('--> statement-breakpoint')) {
        const trimmed = statement.trim()
        if (trimmed) raw.exec(trimmed)
      }
    }

    const journal = await Bun.file(join(dir, 'meta', '_journal.json')).json() as { entries: { tag: string }[] }
    const tags = journal.entries.map(entry => entry.tag)

    try {
      // Everything up to and including the migration that adds the new columns.
      for (const tag of tags.slice(0, tags.findIndex(tag => tag.startsWith('0010_')))) await apply(tag)

      raw.query('INSERT INTO users (id, email, name) VALUES (?, ?, ?)').run('u-1', 'member@example.invalid', 'A Member (test)')
      raw.query(`
        INSERT INTO memberships (id, user_id, year, starts_on, expires_on, source, evidence, confirmed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('m-1', 'u-1', 2026, '2026-09-14', '2027-09-13', 'MANUAL', 'SU-1234', 1780000000)

      await apply(tags.find(tag => tag.startsWith('0010_'))!)

      const held = raw.query('SELECT * FROM memberships WHERE id = ?').get('m-1') as Record<string, unknown>
      expect(held).toMatchObject({
        id: 'm-1',
        user_id: 'u-1',
        starts_on: '2026-09-14',
        expires_on: '2027-09-13',
        source: 'MANUAL',
        evidence: 'SU-1234',
        confirmed_at: 1780000000,
      })
      // The column the rebuild exists to remove is the only thing that went.
      expect(Object.keys(held)).not.toContain('year')
    }
    finally {
      raw.close()
    }
  })
})
