import { afterEach, expect, test } from 'bun:test'
import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { createTestDatabase, rows } from '#tests/helpers/database'
import { bindD1 } from '#tests/helpers/d1'
import type { TestDatabase } from '#tests/helpers/database'

// @nuxthub/db keeps the first binding it sees; a suite after a stand-in (scripts/seed/money.ts)
// must still reach its own database, whatever order the runner picks.

let database: TestDatabase | undefined

afterEach(() => {
  database?.close()
})

test('a binding made after a stand-in still runs a batch on the test database', async () => {
  const globals = globalThis as { __env__?: Record<string, unknown> }
  globals.__env__ = { ...globals.__env__, DB: globals.__env__?.DB ?? {} }
  expect(typeof db.select).toBe('function')
  database = await createTestDatabase()
  bindD1(database)
  await db.batch([db.run(sql`INSERT INTO users (id, email, name, verified) VALUES ('d1-binding', 'd1-binding@e2e.newtheatre.org.uk', 'A member', 1)`)])
  expect(rows(database, 'SELECT id FROM users WHERE id = ?', 'd1-binding')).toHaveLength(1)
})
