import { describe, expect, test } from 'bun:test'
import { auditEntry } from '#shared/utils/audit'
import { CHOOSE_INSTEAD, pendingGrantConstraintRefusal } from '#shared/utils/pending-grants'
import { recordByAddressStatements } from '#shared/utils/pending-records'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { race } from '#tests/helpers/race'
import type { RecordByAddress } from '#shared/utils/pending-records'
import type { TestDatabase } from '#tests/helpers/database'

// G-130 and 0091. A record made for an address nobody holds sits on a shadow account written in
// the same batch, so user_id stays NOT NULL and the table is never touched after the fact.

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
    ['INSERT INTO users (id, email, name, verified, password) VALUES (?, ?, ?, ?, ?)', 'tm', 'training@example.test', 'Tess Manager', 1, 'hash'],
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
    ['INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'TECH-111', 'TECH', 'MODULE', 'Working at height'],
  ])
}

type Kind = 'SIGNOFF' | 'EXTERNAL'

function statementsFor(index: number, email: string, source: Kind): RecordByAddress {
  const userId = `new-${index}`
  const external = source === 'EXTERNAL'
  return {
    userId,
    email,
    name: 'Fresh Fresher',
    actorId: 'tm',
    record: {
      id: `r-${index}`,
      moduleId: 'TECH-111',
      awardedOn: '2026-09-20',
      expiresOn: external ? '2029-09-20' : '2028-07-31',
      expiryOverridden: external,
      source,
      evidenceRef: external ? 'IPAF 3a, certificate 44821' : null,
    },
    entries: [
      auditEntry({ actorId: 'tm', action: 'account.created.console', target: `user:${userId}` }),
      auditEntry({
        actorId: 'tm',
        action: external ? 'record.external-certificate' : 'record.signed-off',
        target: `user:${userId}`,
        detail: { module: 'TECH-111', awardedOn: '2026-09-20', byAddress: true },
      }),
    ],
  }
}

function attempt(database: TestDatabase, index: number, email = 'fresher@example.test', source: Kind = 'SIGNOFF'): { status: number } {
  try {
    database.batch(recordByAddressStatements(statementsFor(index, email, source))
      .map(statement => boundStatement(database, statement)))
  }
  catch (error) {
    return { status: pendingGrantConstraintRefusal(error)?.statusCode ?? 500 }
  }
  // The batch's own predicate refused it, as the route reads back after committing.
  return { status: rows(database, 'SELECT id FROM users WHERE id = ?', `new-${index}`).length ? 200 : 409 }
}

describe('recording by address makes one shadow account holding the record (criterion 2)', () => {
  test('a sign-off lands on an account with no way in, keyed to it like any other', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(attempt(database, 0).status).toBe(200)

      const [account] = rows<Record<string, unknown>>(database, `SELECT * FROM users WHERE id = 'new-0'`)
      expect(account).toMatchObject({ email: 'fresher@example.test', name: 'Fresh Fresher', password: null, google_sub: null, last_login_at: null })
      const [record] = rows<Record<string, unknown>>(database, `SELECT * FROM training_records WHERE id = 'r-0'`)
      expect(record).toMatchObject({ user_id: 'new-0', module_id: 'TECH-111', source: 'SIGNOFF', granted_by: 'tm', expiry_overridden: 0, evidence_ref: null })
      expect(rows(database, `SELECT action FROM audit_log ORDER BY action`)).toEqual([
        { action: 'account.created.console' },
        { action: 'record.signed-off' },
      ])
    })
  })

  test('an external certificate lands with its evidence and its overridden expiry', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(attempt(database, 0, 'fresher@example.test', 'EXTERNAL').status).toBe(200)
      const [record] = rows<Record<string, unknown>>(database, `SELECT * FROM training_records WHERE id = 'r-0'`)
      expect(record).toMatchObject({ source: 'EXTERNAL', expires_on: '2029-09-20', expiry_overridden: 1, evidence_ref: 'IPAF 3a, certificate 44821' })
    })
  })

  test('an address that already has an account is refused, and nothing is written', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(attempt(database, 0, 'training@example.test').status).toBe(409)
      expect(pendingGrantConstraintRefusal(new Error('UNIQUE constraint failed: users.email'))?.statusMessage).toBe(CHOOSE_INSTEAD)
      expect(rows(database, 'SELECT id FROM training_records')).toHaveLength(0)
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(0)
    })
  })

  test('two people recording one address at once leave exactly one account and one record', async () => {
    await withDatabase(async (database) => {
      seed(database)
      const answers = await race(2, async index => attempt(database, index))
      expect(answers.map(answer => answer.status).sort()).toEqual([200, 409])
      expect(rows(database, `SELECT id FROM users WHERE email = 'fresher@example.test'`)).toHaveLength(1)
      expect(rows(database, 'SELECT id FROM training_records')).toHaveLength(1)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'account.created.console'`)).toHaveLength(1)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'record.signed-off'`)).toHaveLength(1)
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
      expect(attempt(database, 0, 'jo@newtheatre.org.uk').status).toBe(409)
      expect(rows(database, `SELECT id FROM users WHERE email = 'jo@newtheatre.org.uk'`)).toHaveLength(0)
      expect(rows(database, 'SELECT id FROM training_records')).toHaveLength(0)
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(0)
    })
  })

  test('racing records to a pre-linked address all lose, and nothing is left behind', async () => {
    await withDatabase(async (database) => {
      seed(database)
      preLink(database)
      const answers = await race(3, async index => attempt(database, index, 'jo@newtheatre.org.uk', 'EXTERNAL'))
      expect(answers.map(answer => answer.status)).toEqual([409, 409, 409])
      expect(rows(database, `SELECT id FROM users WHERE id LIKE 'new-%'`)).toHaveLength(0)
      expect(rows(database, 'SELECT id FROM training_records')).toHaveLength(0)
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(0)
    })
  })
})

describe('the trail carries identifiers only (criterion 6, 0011)', () => {
  test('no address and no name in any detail', async () => {
    await withDatabase((database) => {
      seed(database)
      attempt(database, 0)
      for (const { detail } of rows<{ detail: string | null }>(database, 'SELECT detail FROM audit_log')) {
        expect(detail ?? '').not.toContain('fresher')
        expect(detail ?? '').not.toContain('Fresh Fresher')
      }
    })
  })
})

describe('A-116\'s claim is what hands it over (criterion 5)', () => {
  test('setting a password keeps the record on the same account', async () => {
    await withDatabase((database) => {
      seed(database)
      attempt(database, 0)
      database.batch([[`UPDATE users SET password = 'hash', verified = 1 WHERE id = 'new-0'`]])
      expect(rows(database, `SELECT id FROM training_records WHERE user_id = 'new-0'`)).toHaveLength(1)
    })
  })

  test('a Workspace address can never be claimed with a password (0008)', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(attempt(database, 0, 'fresher@newtheatre.org.uk').status).toBe(200)
      expect(() => database.batch([[`UPDATE users SET password = 'hash' WHERE id = 'new-0'`]])).toThrow()
    })
  })
})
