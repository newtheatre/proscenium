import { describe, expect, test } from 'bun:test'
import { declarationsVerifiersStatement, waitingDeclarationsStatement } from '#shared/utils/access-profiles-waiting'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// The daily notice that declarations wait goes to holders of access.verify, and only while a
// declaration is pending on a person who still exists (0156).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

const read = <T>(database: TestDatabase, statement: ReturnType<typeof waitingDeclarationsStatement>): T[] => {
  const [text, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, text, ...parameters)
}

const now = 1_790_000_000

describe('the waiting declarations notice (0156)', () => {
  test('the count is pending declarations on living accounts, and the oldest is when the first was saved', async () => {
    await withDatabase((database) => {
      database.batch([
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u1', 'one@example.invalid', 'One'],
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u2', 'two@example.invalid', 'Two'],
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u3', 'three@example.invalid', 'Three'],
        ['INSERT INTO users (id, email, name, verified, anonymised_at) VALUES (?, ?, ?, 1, 1)', 'gone', 'gone@example.invalid', 'Gone'],
        ['INSERT INTO access_profiles (user_id, status, updated_at) VALUES (?, ?, ?)', 'u1', 'PENDING', 1_780_000_500],
        ['INSERT INTO access_profiles (user_id, status, updated_at) VALUES (?, ?, ?)', 'u2', 'PENDING', 1_780_000_100],
        ['INSERT INTO access_profiles (user_id, status, updated_at) VALUES (?, ?, ?)', 'u3', 'VERIFIED', 1_780_000_000],
        ['INSERT INTO access_profiles (user_id, status, updated_at) VALUES (?, ?, ?)', 'gone', 'PENDING', 1_780_000_050],
      ])
      expect(read(database, waitingDeclarationsStatement())).toEqual([{ waiting: 2, oldest: 1_780_000_100 }])
    })
  })

  test('nothing pending reads as none, so the sweep sends nothing', async () => {
    await withDatabase((database) => {
      expect(read<{ waiting: number }>(database, waitingDeclarationsStatement())[0]!.waiting).toBe(0)
    })
  })

  test('the verifiers are live holders of access.verify on reachable accounts, each once', async () => {
    await withDatabase((database) => {
      database.batch([
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'secretary', 'secretary@example.invalid', 'Secretary'],
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'lapsed', 'lapsed@example.invalid', 'Lapsed'],
        ['INSERT INTO users (id, email, name, verified, disabled) VALUES (?, ?, ?, 1, 1)', 'disabled', 'disabled@example.invalid', 'Disabled'],
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'box-office', 'foh@example.invalid', 'Box office'],
        ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g1', 'secretary', 'SECRETARY', now + 86_400],
        ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g2', 'secretary', 'COMMITTEE', null],
        ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g3', 'lapsed', 'SECRETARY', now - 1],
        ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g4', 'disabled', 'SECRETARY', null],
        ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g5', 'box-office', 'FOH_MANAGER', null],
      ])
      expect(read<{ id: string }>(database, declarationsVerifiersStatement(now)).map(row => row.id)).toEqual(['secretary'])
    })
  })
})
