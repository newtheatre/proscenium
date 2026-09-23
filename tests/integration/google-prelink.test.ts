import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { auditEntry } from '#shared/utils/audit'
import { consoleAccountConstraintRefusal, consoleAccountStatements, preLinkDetail, preLinkHolderStatement, preLinkStatement } from '#shared/utils/google-prelink'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { expectOneWinner, race } from '#tests/helpers/race'
import type { PreLinkHolder } from '#shared/utils/google-prelink'
import type { TestDatabase } from '#tests/helpers/database'

// A-104 criterion 6 and 0008. The pre-link write carries its own refusals as its predicate, and
// the trail entry rides `changes()`, so a refused or raced write leaves nothing behind (0003).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

const WORKSPACE = 'incoming@newtheatre.org.uk'

function seed(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified, password) VALUES (?, ?, ?, ?, ?)', 'ada', 'ada@example.test', 'Ada Admin', 1, 'hash'],
    ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'jo', 'jo.personal@example.test', 'Jo Incoming'],
    ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'sam', 'sam.personal@example.test', 'Sam Incoming'],
  ])
}

// What the route runs: the conditional write, then the entry only if it changed a row.
function attempt(database: TestDatabase, userId: string, email: string | null): { status: number } {
  const entry = auditEntry({
    actorId: 'ada',
    action: email === null ? 'account.google.unlinked' : 'account.google.prelinked',
    target: `user:${userId}`,
    detail: email === null ? undefined : preLinkDetail(false),
  })
  try {
    database.batch([
      boundStatement(database, preLinkStatement(userId, email)),
      boundStatement(database, sql`insert into audit_log (id, actor_id, action, target, detail)
        select ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${entry.detail === null ? null : JSON.stringify(entry.detail)}
        where changes() = 1`),
    ])
  }
  catch {
    return { status: 409 }
  }
  const [row] = rows<{ pending: string | null }>(database, 'SELECT pending_google_email AS pending FROM users WHERE id = ?', userId)
  return { status: row?.pending === email ? 200 : 409 }
}

function holder(database: TestDatabase, userId: string, email: string): PreLinkHolder | undefined {
  const [text, ...parameters] = boundStatement(database, preLinkHolderStatement(userId, email))
  return rows<PreLinkHolder>(database, text, ...parameters)[0]
}

function pendingOf(database: TestDatabase, userId: string): string | null {
  return rows<{ pending: string | null }>(database, 'SELECT pending_google_email AS pending FROM users WHERE id = ?', userId)[0]!.pending
}

describe('setting and clearing a pre-link', () => {
  test('sets the address, keeps the account\'s own, and records who did it with no address', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(attempt(database, 'jo', WORKSPACE).status).toBe(200)
      expect(pendingOf(database, 'jo')).toBe(WORKSPACE)
      expect(rows<{ email: string }>(database, `SELECT email FROM users WHERE id = 'jo'`)[0]!.email).toBe('jo.personal@example.test')

      const trail = rows<{ actor_id: string, action: string, detail: string }>(database, 'SELECT actor_id, action, detail FROM audit_log')
      expect(trail).toHaveLength(1)
      expect(trail[0]).toMatchObject({ actor_id: 'ada', action: 'account.google.prelinked' })
      expect(trail[0]!.detail).not.toContain('@')
    })
  })

  test('clearing removes it and is recorded; clearing nothing records nothing', async () => {
    await withDatabase((database) => {
      seed(database)
      attempt(database, 'jo', WORKSPACE)
      expect(attempt(database, 'jo', null).status).toBe(200)
      expect(pendingOf(database, 'jo')).toBeNull()
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'account.google.unlinked'`)).toHaveLength(1)

      attempt(database, 'jo', null)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'account.google.unlinked'`)).toHaveLength(1)
    })
  })

  test('the Google callback\'s own lookup finds it', async () => {
    await withDatabase((database) => {
      seed(database)
      attempt(database, 'jo', WORKSPACE)
      expect(rows(database, 'SELECT id FROM users WHERE pending_google_email = ?', WORKSPACE)).toEqual([{ id: 'jo' }])
    })
  })
})

describe('the statement refuses on its own, with no check run first', () => {
  test('another account\'s own address', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'ws', WORKSPACE, 'Workspace Somebody']])
      expect(attempt(database, 'jo', WORKSPACE).status).toBe(409)
      expect(pendingOf(database, 'jo')).toBeNull()
      expect(holder(database, 'jo', WORKSPACE)).toEqual({ name: 'Workspace Somebody', how: 'email' })
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(0)
    })
  })

  test('another account\'s pending link', async () => {
    await withDatabase((database) => {
      seed(database)
      attempt(database, 'sam', WORKSPACE)
      expect(attempt(database, 'jo', WORKSPACE).status).toBe(409)
      expect(pendingOf(database, 'jo')).toBeNull()
      expect(holder(database, 'jo', WORKSPACE)).toEqual({ name: 'Sam Incoming', how: 'pending' })
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(1)
    })
  })

  test('an account already linked to Google', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([[`UPDATE users SET google_sub = 'sub-1' WHERE id = 'jo'`]])
      expect(attempt(database, 'jo', WORKSPACE).status).toBe(409)
      expect(pendingOf(database, 'jo')).toBeNull()
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(0)
    })
  })

  test('an erased account, without tripping the tombstone guard', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([[`UPDATE users SET anonymised_at = 1, email = 'deleted-jo@anonymised.invalid', name = 'Deleted user' WHERE id = 'jo'`]])
      expect(attempt(database, 'jo', WORKSPACE).status).toBe(409)
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(0)
    })
  })

  test('its own address is not a collision with itself', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(holder(database, 'jo', 'jo.personal@example.test')).toBeUndefined()
    })
  })
})

describe('two administrators pre-linking one address to two accounts at once', () => {
  test('exactly one account holds it, with exactly one trail entry', async () => {
    await withDatabase(async (database) => {
      seed(database)
      const answers = await race(2, async index => attempt(database, index === 0 ? 'jo' : 'sam', WORKSPACE))
      expectOneWinner(answers)
      expect(rows(database, 'SELECT id FROM users WHERE pending_google_email = ?', WORKSPACE)).toHaveLength(1)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'account.google.prelinked'`)).toHaveLength(1)
    })
  })

  test('the unique index refuses a second holder even if a predicate were dropped', async () => {
    await withDatabase((database) => {
      seed(database)
      attempt(database, 'sam', WORKSPACE)
      expect(() => database.batch([['UPDATE users SET pending_google_email = ? WHERE id = ?', WORKSPACE, 'jo']])).toThrow()
    })
  })
})

// A-121 criterion 7: Add someone, with or without a Workspace address to pre-link.
function add(database: TestDatabase, index: number, email: string, googleEmail: string | null = null): { status: number } {
  const id = `added-${index}`
  try {
    database.batch(consoleAccountStatements({
      id,
      email,
      name: 'Added Person',
      googleEmail,
      created: auditEntry({ actorId: 'ada', action: 'account.created.console', target: `user:${id}` }),
      prelinked: auditEntry({ actorId: 'ada', action: 'account.google.prelinked', target: `user:${id}`, detail: preLinkDetail(false) }),
    }).map(statement => boundStatement(database, statement)))
  }
  catch (error) {
    return { status: consoleAccountConstraintRefusal(error)?.statusCode ?? 500 }
  }
  return { status: rows(database, 'SELECT id FROM users WHERE id = ?', id).length ? 200 : 409 }
}

describe('adding someone from the console', () => {
  test('with a Workspace address, the account and its pre-link are made together, each audited', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(add(database, 0, 'new.person@example.test', WORKSPACE).status).toBe(200)
      expect(rows(database, `SELECT email, pending_google_email AS pending FROM users WHERE id = 'added-0'`))
        .toEqual([{ email: 'new.person@example.test', pending: WORKSPACE }])
      expect(rows<{ action: string }>(database, 'SELECT action FROM audit_log ORDER BY rowid').map(row => row.action))
        .toEqual(['account.created.console', 'account.google.prelinked'])
    })
  })

  test('without one, only the account and its creation entry', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(add(database, 0, 'new.person@example.test').status).toBe(200)
      expect(pendingOf(database, 'added-0')).toBeNull()
      expect(rows<{ action: string }>(database, 'SELECT action FROM audit_log').map(row => row.action)).toEqual(['account.created.console'])
    })
  })

  test('an address some account is pre-linked to is refused as the new account\'s own, writing nothing', async () => {
    await withDatabase((database) => {
      seed(database)
      attempt(database, 'jo', WORKSPACE)
      expect(add(database, 0, WORKSPACE).status).toBe(409)
      expect(rows(database, `SELECT id FROM users WHERE id = 'added-0'`)).toHaveLength(0)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'account.created.console'`)).toHaveLength(0)
    })
  })

  test('a Workspace address that already leads to another account is refused, writing nothing', async () => {
    await withDatabase((database) => {
      seed(database)
      attempt(database, 'jo', WORKSPACE)
      expect(add(database, 0, 'new.person@example.test', WORKSPACE).status).toBe(409)
      database.batch([['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'ws', 'taken@newtheatre.org.uk', 'Workspace Somebody']])
      expect(add(database, 1, 'other.person@example.test', 'taken@newtheatre.org.uk').status).toBe(409)
      expect(rows(database, `SELECT id FROM users WHERE id LIKE 'added-%'`)).toHaveLength(0)
      expect(rows(database, `SELECT id FROM audit_log WHERE target LIKE 'user:added-%'`)).toHaveLength(0)
    })
  })

  test('an address that already has an account is the unique key\'s refusal', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(add(database, 0, 'jo.personal@example.test').status).toBe(409)
    })
  })

  test('a pre-link and an Add someone racing for one address leave it leading to one account', async () => {
    await withDatabase(async (database) => {
      seed(database)
      const answers = await race(2, async index => index === 0
        ? attempt(database, 'jo', WORKSPACE)
        : add(database, 1, 'new.person@example.test', WORKSPACE))
      expectOneWinner(answers)
      expect(rows(database, 'SELECT id FROM users WHERE pending_google_email = ?', WORKSPACE)).toHaveLength(1)
    })
  })
})
