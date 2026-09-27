import { describe, expect, test } from 'bun:test'
import { auditIfChanged, auditWhere } from '#server/utils/audit'
import { auditEntry } from '#shared/utils/audit'
import { erasureStatements } from '#shared/utils/erasure'
import { googleClaimStatement } from '#shared/utils/google-sign-in'
import { boundStatement, createTestDatabase, rows, sql } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Two races against an erasure (0011, 0003), on the real migrations and triggers. Each batch runs
// in one transaction, as D1 runs it; the loser is the batch that lands after the winner commits.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function batch(database: TestDatabase, statements: SQL[]): unknown[][] {
  return database.raw.transaction(() => statements.map((statement) => {
    const [text, ...parameters] = boundStatement(database, statement)
    return database.raw.prepare(text).all(...parameters as never[]) as unknown[]
  }))()
}

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', id, `${id}@example.invalid`, 'Imogen Hart']])
  return id
}

// As `eraseAccount` batches it: the audit row directly after the tombstone, on its `changes()`.
function erase(database: TestDatabase, userId: string, at: number): unknown[][] {
  return batch(database, [
    ...erasureStatements(userId, at),
    auditWhere(auditEntry({ actorId: userId, action: 'account.erased', target: `user:${userId}`, detail: { tables: 42 } }), sql`changes() = 1`),
  ])
}

const erasuresLogged = (database: TestDatabase): (string | null)[] =>
  rows<{ detail: string | null }>(database, 'SELECT detail FROM audit_log WHERE action = ?', 'account.erased').map(row => row.detail)

const detailOf = (database: TestDatabase, id: string): string | null =>
  rows<{ detail: string | null }>(database, 'SELECT detail FROM audit_log WHERE id = ?', id)[0]?.detail ?? null

// Two erasures of one account at once (the member and an officer, or the retention sweep): the one
// that lands second finds the tombstone and must not rewrite the trail the first one left.
describe('a second erasure racing the first', () => {
  test('leaves the first erasure\'s own audit row as it was written', async () => {
    await withDatabase((database) => {
      const who = person(database, 'u-raced')
      erase(database, who, 1_780_000_000)
      erase(database, who, 1_780_000_060)

      expect(erasuresLogged(database)).toEqual([JSON.stringify({ tables: 42 })])
    })
  })

  test('the first erasure still redacts what the trail held about the person before it', async () => {
    await withDatabase((database) => {
      const who = person(database, 'u-before')
      database.batch([['INSERT INTO audit_log (id, actor_id, action, target, detail) VALUES (?, ?, ?, ?, ?)',
        'e-earlier', 'officer', 'account.profile.updated', `user:${who}`, JSON.stringify({ fields: ['name'] })]])
      erase(database, who, 1_780_000_000)

      expect(detailOf(database, 'e-earlier')).toBe(JSON.stringify({ redacted: true }))
    })
  })
})

// A Google sign-in read the account as claimable, and an erasure or a disable landed before its
// claim wrote: the claim must not hand a Google identity back to that account (A-104, 0003).
describe('a Google claim racing an erasure or a disable', () => {
  // As `auditedWrite` batches it: the claim, then its audit row on the claim's `changes()`.
  const claim = (database: TestDatabase, userId: string): unknown[] => batch(database, [
    googleClaimStatement(userId, 'google-sub-1', 1_780_000_100),
    auditIfChanged(auditEntry({ actorId: userId, action: 'account.google.claimed', target: `user:${userId}` })),
  ])[0]!

  const claimsLogged = (database: TestDatabase): number =>
    rows<{ n: number }>(database, 'SELECT count(*) AS n FROM audit_log WHERE action = ?', 'account.google.claimed')[0]!.n

  const subOf = (database: TestDatabase, userId: string): string | null =>
    rows<{ sub: string | null }>(database, 'SELECT google_sub AS sub FROM users WHERE id = ?', userId)[0]!.sub

  test('erased first: the claim writes nothing, and the tombstone answers to no Google identity', async () => {
    await withDatabase((database) => {
      const who = person(database, 'u-erased')
      erase(database, who, 1_780_000_000)

      expect(claim(database, who)).toHaveLength(0)
      expect(subOf(database, who)).toBeNull()
      expect(claimsLogged(database)).toBe(0)
    })
  })

  test('disabled first: the claim writes nothing', async () => {
    await withDatabase((database) => {
      const who = person(database, 'u-disabled')
      database.batch([['UPDATE users SET disabled = 1 WHERE id = ?', who]])

      expect(claim(database, who)).toHaveLength(0)
      expect(subOf(database, who)).toBeNull()
      expect(claimsLogged(database)).toBe(0)
    })
  })

  test('an account neither erased nor disabled is claimed, once', async () => {
    await withDatabase((database) => {
      const who = person(database, 'u-current')

      expect(claim(database, who)).toHaveLength(1)
      expect(subOf(database, who)).toBe('google-sub-1')
      expect(claim(database, who)).toHaveLength(0)
      expect(claimsLogged(database)).toBe(1)
    })
  })

  test('claimed first: the erasure that follows takes the identity off the tombstone', async () => {
    await withDatabase((database) => {
      const who = person(database, 'u-claimed')
      claim(database, who)
      erase(database, who, 1_780_000_200)

      expect(subOf(database, who)).toBeNull()
    })
  })
})
