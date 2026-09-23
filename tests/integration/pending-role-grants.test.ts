import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { auditEntry } from '#shared/utils/audit'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { CHOOSE_INSTEAD, PRE_LINKED, pendingGrantConstraintRefusal, pendingGrantDetail, pendingGrantStatements } from '#shared/utils/pending-grants'
import { rolesList } from '#shared/utils/roles-list'
import { grantsClause, holderCountsStatement, pendingClause, permanentClause, usableHolderWhere } from '#server/utils/roles-register'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { race } from '#tests/helpers/race'
import type { TestDatabase } from '#tests/helpers/database'

// A-132 and 0088. A role granted by address sits on a shadow account and is pending until A-116's
// own claim gives that account a way in; pending is a predicate read now, never a flag.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

const NOW = Math.floor(Date.now() / 1000)
const YEAR = 365 * 24 * 60 * 60

function seed(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified, password) VALUES (?, ?, ?, ?, ?)', 'ada', 'ada@example.test', 'Ada Admin', 1, 'hash'],
    ['INSERT INTO role_grants (id, user_id, role, expires_at, granted_by) VALUES (?, ?, ?, ?, ?)', 'g-ada', 'ada', 'ADMIN', null, 'ada'],
  ])
}

function attemptGrant(database: TestDatabase, index: number, email = 'incoming@example.test', role = 'BAR_MANAGER', expiresAt: number | null = NOW + YEAR): { status: number } {
  const userId = `pending-${index}`
  try {
    database.batch(pendingGrantStatements({
      userId,
      grantId: `g-pending-${index}`,
      email,
      name: 'Incoming Officer',
      role,
      expiresAt,
      note: 'Elected at the AGM',
      actorId: 'ada',
      entries: {
        created: auditEntry({ actorId: 'ada', action: 'account.created.console', target: `user:${userId}` }),
        granted: auditEntry({ actorId: 'ada', action: 'role.granted', target: `user:${userId}`, detail: pendingGrantDetail(role, expiresAt, true) }),
      },
    }).map(statement => boundStatement(database, statement)))
  }
  catch (error) {
    return { status: pendingGrantConstraintRefusal(error)?.statusCode ?? 500 }
  }
  // The batch's own predicate refused it, as the route reads back after committing.
  return { status: rows(database, 'SELECT id FROM users WHERE id = ?', userId).length ? 200 : 409 }
}

const listSchema = filterQuerySchema(rolesList)

function registerIds(database: TestDatabase, raw: Record<string, string> = {}): string[] {
  const parsed = listSchema.parse(raw)
  const clause = grantsClause({ ...parsed, includeLapsed: false }, NOW)
  const [text, ...parameters] = boundStatement(database, sql`SELECT role_grants.id AS id FROM role_grants
    JOIN users ON users.id = role_grants.user_id WHERE ${clause.where}`)
  return rows<{ id: string }>(database, text, ...parameters).map(row => row.id).sort()
}

function pendingIds(database: TestDatabase): string[] {
  const [text, ...parameters] = boundStatement(database, sql`SELECT role_grants.id AS id FROM role_grants
    JOIN users ON users.id = role_grants.user_id WHERE ${pendingClause()}`)
  return rows<{ id: string }>(database, text, ...parameters).map(row => row.id).sort()
}

function permanentIds(database: TestDatabase): string[] {
  const [text, ...parameters] = boundStatement(database, sql`SELECT role_grants.id AS id FROM role_grants
    JOIN users ON users.id = role_grants.user_id WHERE ${permanentClause()}`)
  return rows<{ id: string }>(database, text, ...parameters).map(row => row.id).sort()
}

function counts(database: TestDatabase): Record<string, number> {
  const [text, ...parameters] = boundStatement(database, holderCountsStatement(NOW))
  return Object.fromEntries(rows<{ role: string, holders: number }>(database, text, ...parameters)
    .map(row => [row.role, Number(row.holders)]))
}

function usableAdmins(database: TestDatabase): string[] {
  const [text, ...parameters] = boundStatement(database, sql`SELECT role_grants.user_id AS id FROM role_grants
    JOIN users ON users.id = role_grants.user_id WHERE ${usableHolderWhere('ADMIN', NOW)}`)
  return rows<{ id: string }>(database, text, ...parameters).map(row => row.id).sort()
}

describe('granting by address makes one shadow account holding the grant (criteria 1 and 2)', () => {
  test('the account has no way in, and the grant carries its expiry and note', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(attemptGrant(database, 0).status).toBe(200)

      const [account] = rows<Record<string, unknown>>(database, `SELECT * FROM users WHERE id = 'pending-0'`)
      expect(account).toMatchObject({ email: 'incoming@example.test', password: null, google_sub: null, last_login_at: null })
      const [grant] = rows<Record<string, unknown>>(database, `SELECT * FROM role_grants WHERE user_id = 'pending-0'`)
      expect(grant).toMatchObject({ role: 'BAR_MANAGER', expires_at: NOW + YEAR, granted_by: 'ada', note: 'Elected at the AGM' })
    })
  })

  test('an address that already has an account is refused, and nothing is written', async () => {
    await withDatabase((database) => {
      seed(database)
      const answer = attemptGrant(database, 0, 'ada@example.test')
      expect(answer.status).toBe(409)
      expect(pendingGrantConstraintRefusal(new Error('UNIQUE constraint failed: users.email'))?.statusMessage).toBe(CHOOSE_INSTEAD)
      expect(rows(database, `SELECT id FROM role_grants WHERE user_id = 'pending-0'`)).toHaveLength(0)
      expect(rows(database, `SELECT id FROM audit_log`)).toHaveLength(0)
    })
  })

  test('two administrators granting one address at once leave exactly one account and one grant', async () => {
    await withDatabase(async (database) => {
      seed(database)
      const answers = await race(2, async index => attemptGrant(database, index))
      expect(answers.map(answer => answer.status).sort()).toEqual([200, 409])

      expect(rows(database, `SELECT id FROM users WHERE email = 'incoming@example.test'`)).toHaveLength(1)
      expect(rows(database, `SELECT id FROM role_grants WHERE role = 'BAR_MANAGER'`)).toHaveLength(1)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'role.granted'`)).toHaveLength(1)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'account.created.console'`)).toHaveLength(1)
    })
  })
})

describe('an address pre-linked to an imported account is that account\'s (criterion 1, A-104)', () => {
  function preLink(database: TestDatabase): void {
    database.batch([[
      'INSERT INTO users (id, email, name, pending_google_email) VALUES (?, ?, ?, ?)',
      'jo',
      'jo.personal@example.test',
      'Jo Imported',
      'jo@newtheatre.org.uk',
    ]])
  }

  test('the batch writes nothing for it, even when no check ran first', async () => {
    await withDatabase((database) => {
      seed(database)
      preLink(database)
      expect(attemptGrant(database, 0, 'jo@newtheatre.org.uk').status).toBe(409)
      expect(rows(database, `SELECT id FROM users WHERE email = 'jo@newtheatre.org.uk'`)).toHaveLength(0)
      expect(rows(database, `SELECT id FROM role_grants WHERE user_id = 'pending-0'`)).toHaveLength(0)
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(0)
      expect(PRE_LINKED).toMatch(/search/)
    })
  })

  test('racing grants to a pre-linked address all lose, and nothing is left behind', async () => {
    await withDatabase(async (database) => {
      seed(database)
      preLink(database)
      const answers = await race(3, async index => attemptGrant(database, index, 'jo@newtheatre.org.uk'))
      expect(answers.map(answer => answer.status)).toEqual([409, 409, 409])
      expect(rows(database, `SELECT id FROM users WHERE id LIKE 'pending-%'`)).toHaveLength(0)
      expect(rows(database, `SELECT id FROM role_grants WHERE user_id LIKE 'pending-%'`)).toHaveLength(0)
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(0)
    })
  })
})

describe('the trail says pending and never who (criterion 6, 0011)', () => {
  test('no address and no name in the detail', async () => {
    await withDatabase((database) => {
      seed(database)
      attemptGrant(database, 0)
      const [granted] = rows<{ detail: string }>(database, `SELECT detail FROM audit_log WHERE action = 'role.granted'`)
      expect(JSON.parse(granted!.detail)).toEqual({ role: 'BAR_MANAGER', expiresAt: NOW + YEAR, permanent: false, noted: true, pending: true })
      expect(granted!.detail).not.toContain('incoming')
      expect(granted!.detail).not.toContain('Incoming Officer')
    })
  })
})

describe('pending is not holding (criterion 3)', () => {
  test('listed apart, and out of the holders and the live count', async () => {
    await withDatabase((database) => {
      seed(database)
      attemptGrant(database, 0)
      expect(registerIds(database)).toEqual(['g-ada'])
      expect(registerIds(database, { role: 'is:BAR_MANAGER' })).toEqual([])
      expect(pendingIds(database)).toEqual(['g-pending-0'])
      expect(counts(database).BAR_MANAGER).toBeUndefined()
    })
  })

  test('a pending IT Manager does not satisfy the last-IT-Manager guard', async () => {
    await withDatabase((database) => {
      seed(database)
      attemptGrant(database, 0, 'next-it@example.test', 'ADMIN')
      expect(usableAdmins(database)).toEqual(['ada'])
    })
  })

  test('a permanent grant made by address is pending, not in the permanent report (A-131 criterion 6)', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(attemptGrant(database, 0, 'incoming@example.test', 'BAR_MANAGER', null).status).toBe(200)
      expect(pendingIds(database)).toEqual(['g-pending-0'])
      expect(permanentIds(database)).toEqual(['g-ada'])

      database.batch([[`UPDATE users SET last_login_at = ${NOW} WHERE id = 'pending-0'`]])
      expect(pendingIds(database)).toEqual([])
      expect(permanentIds(database)).toEqual(['g-ada', 'g-pending-0'])
    })
  })
})

describe('A-116\'s claim is what makes it held (criterion 1)', () => {
  const claims: [string, string][] = [
    ['setting a password through the claim link', `UPDATE users SET password = 'hash' WHERE id = 'pending-0'`],
    ['a Google sign-in claiming by address', `UPDATE users SET google_sub = 'sub-1', verified = 1 WHERE id = 'pending-0'`],
    ['a first sign-in by magic link', `UPDATE users SET last_login_at = ${NOW} WHERE id = 'pending-0'`],
  ]

  for (const [how, claim] of claims) {
    test(`held from ${how}, with nothing else written`, async () => {
      await withDatabase((database) => {
        seed(database)
        attemptGrant(database, 0)
        database.batch([[claim]])
        expect(pendingIds(database)).toEqual([])
        expect(registerIds(database, { role: 'is:BAR_MANAGER' })).toEqual(['g-pending-0'])
        expect(counts(database).BAR_MANAGER).toBe(1)
      })
    })
  }

  test('a Workspace address can never be claimed with a password (criterion 5, 0008)', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(attemptGrant(database, 0, 'incoming@newtheatre.org.uk').status).toBe(200)
      expect(() => database.batch([[`UPDATE users SET password = 'hash' WHERE id = 'pending-0'`]])).toThrow()
      expect(pendingIds(database)).toEqual(['g-pending-0'])
    })
  })
})

describe('revoking a pending grant (criterion 4)', () => {
  test('is the ordinary delete, and leaves nothing pending', async () => {
    await withDatabase((database) => {
      seed(database)
      attemptGrant(database, 0)
      database.batch([[`DELETE FROM role_grants WHERE user_id = 'pending-0' AND role = 'BAR_MANAGER'`]])
      expect(pendingIds(database)).toEqual([])
    })
  })
})
