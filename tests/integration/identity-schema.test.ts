import { describe, expect, test } from 'bun:test'
import { auditEntry } from '#shared/utils/audit'
import { createTestDatabase, rows } from '#tests/helpers/database'
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

function insertUser(database: TestDatabase, email: string, extra: Record<string, unknown> = {}): void {
  const columns = ['id', 'email', 'name', ...Object.keys(extra)]
  const values = [`u-${Math.random().toString(36).slice(2)}`, email, 'A Member', ...Object.values(extra)]
  database.batch([[
    `INSERT INTO users (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    ...values,
  ]])
}

describe('users (0008, docs/data-model.md)', () => {
  test('an email is unique', async () => {
    await withDatabase((database) => {
      insertUser(database, 'one@example.invalid')
      expect(() => insertUser(database, 'one@example.invalid')).toThrow()
    })
  })

  test('an email must already be lowercased', async () => {
    await withDatabase((database) => {
      expect(() => insertUser(database, 'Shouty@Example.Invalid')).toThrow()
    })
  })

  // The rule 0008 exists for: a Workspace address is Google-only and may never hold a
  // password, including by import.
  test('a Workspace address may never hold a password', async () => {
    await withDatabase((database) => {
      expect(() => insertUser(database, 'officer@newtheatre.org.uk', { password: 'scrypt$...' })).toThrow()
    })
  })

  test('a Workspace address without a password is fine', async () => {
    await withDatabase((database) => {
      expect(() => insertUser(database, 'officer@newtheatre.org.uk')).not.toThrow()
    })
  })

  test('a non-Workspace address may hold a password', async () => {
    await withDatabase((database) => {
      expect(() => insertUser(database, 'member@example.invalid', { password: 'scrypt$...' })).not.toThrow()
    })
  })

  test('a google_sub is unique', async () => {
    await withDatabase((database) => {
      insertUser(database, 'a@example.invalid', { google_sub: 'sub-1' })
      expect(() => insertUser(database, 'b@example.invalid', { google_sub: 'sub-1' })).toThrow()
    })
  })

  test('a new account is unverified, enabled and at session epoch zero', async () => {
    await withDatabase((database) => {
      insertUser(database, 'fresh@example.invalid')
      const [user] = rows<{ verified: number, disabled: number, session_epoch: number }>(
        database, 'SELECT verified, disabled, session_epoch FROM users',
      )
      expect(user).toMatchObject({ verified: 0, disabled: 0, session_epoch: 0 })
    })
  })
})

describe('memberships and roles', () => {
  test('one membership row per user per year', async () => {
    await withDatabase((database) => {
      insertUser(database, 'member@example.invalid')
      const [{ id }] = rows<{ id: string }>(database, 'SELECT id FROM users')
      const insert = (): void => database.batch([[
        'INSERT INTO memberships (id, user_id, year, source) VALUES (?, ?, ?, ?)',
        `m-${Math.random()}`, id, 2026, 'MANUAL',
      ]])
      insert()
      expect(insert).toThrow()
    })
  })

  test('a membership source is MANUAL or ROSTER, never a purchase', async () => {
    await withDatabase((database) => {
      insertUser(database, 'member@example.invalid')
      const [{ id }] = rows<{ id: string }>(database, 'SELECT id FROM users')
      expect(() => database.batch([[
        'INSERT INTO memberships (id, user_id, year, source) VALUES (?, ?, ?, ?)',
        'm-1', id, 2026, 'PURCHASE',
      ]])).toThrow()
    })
  })

  test('one grant per user per role', async () => {
    await withDatabase((database) => {
      insertUser(database, 'officer@example.invalid')
      const [{ id }] = rows<{ id: string }>(database, 'SELECT id FROM users')
      const insert = (): void => database.batch([[
        'INSERT INTO role_grants (id, user_id, role) VALUES (?, ?, ?)',
        `g-${Math.random()}`, id, 'ADMINISTRATOR',
      ]])
      insert()
      expect(insert).toThrow()
    })
  })

  test('deleting a user takes their grants and memberships with them', async () => {
    await withDatabase((database) => {
      insertUser(database, 'leaver@example.invalid')
      const [{ id }] = rows<{ id: string }>(database, 'SELECT id FROM users')
      database.batch([
        ['INSERT INTO role_grants (id, user_id, role) VALUES (?, ?, ?)', 'g-1', id, 'ADMINISTRATOR'],
        ['INSERT INTO memberships (id, user_id, year, source) VALUES (?, ?, ?, ?)', 'm-1', id, 2026, 'MANUAL'],
      ])
      database.batch([['DELETE FROM users WHERE id = ?', id]])
      expect(rows(database, 'SELECT * FROM role_grants')).toEqual([])
      expect(rows(database, 'SELECT * FROM memberships')).toEqual([])
    })
  })
})

describe('auth tokens and access profiles', () => {
  test('a token kind is one of the four', async () => {
    await withDatabase((database) => {
      insertUser(database, 'member@example.invalid')
      const [{ id }] = rows<{ id: string }>(database, 'SELECT id FROM users')
      expect(() => database.batch([[
        'INSERT INTO auth_tokens (id, user_id, kind, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)',
        't-1', id, 'SOMETHING_ELSE', 'hash', 1,
      ]])).toThrow()
    })
  })

  // access_profiles waits for D-127, which owns the encryption at rest and the consent path.
  // Its nine flags are settled: the Nimbus Access Card categories (docs/data-model.md).
  test.todo('companions are capped at two (D-127)', () => {})
})

describe('the audit writer against the real table (0010, 0011)', () => {
  test('an entry built by the writer inserts and reads back', async () => {
    await withDatabase((database) => {
      const entry = auditEntry({ actorId: 'u-1', action: 'role.granted', target: 'user:u-2', detail: { role: 'ADMINISTRATOR' } })
      database.batch([[
        'INSERT INTO audit_log (id, actor_id, action, target, detail) VALUES (?, ?, ?, ?, ?)',
        entry.id, entry.actorId, entry.action, entry.target, JSON.stringify(entry.detail),
      ]])
      const [stored] = rows<{ action: string, detail: string }>(database, 'SELECT action, detail FROM audit_log')
      expect(stored!.action).toBe('role.granted')
      expect(JSON.parse(stored!.detail)).toEqual({ role: 'ADMINISTRATOR' })
    })
  })

  // The entry rides the same batch as the change it records, so a rolled-back change cannot
  // leave an audit entry claiming it happened (0001, 0003).
  test('an audit entry does not survive a failed batch', async () => {
    await withDatabase((database) => {
      const entry = auditEntry({ actorId: 'u-1', action: 'account.disabled', target: 'user:u-2' })
      expect(() => database.batch([
        ['INSERT INTO audit_log (id, actor_id, action, target) VALUES (?, ?, ?, ?)', entry.id, entry.actorId, entry.action, entry.target],
        ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-2', 'BROKEN@Example.Invalid', 'A Member'],
      ])).toThrow()
      expect(rows(database, 'SELECT * FROM audit_log')).toEqual([])
    })
  })
})

// Append-only is trigger-enforced, not a convention (0010).
describe('the audit log is append-only (0010)', () => {
  function seedEntry(database: TestDatabase): void {
    database.batch([[
      'INSERT INTO audit_log (id, action, target, detail) VALUES (?, ?, ?, ?)',
      'a-1', 'role.granted', 'user:u-1', '{"role":"ADMINISTRATOR"}',
    ]])
  }

  test('an entry can be written', async () => {
    await withDatabase((database) => {
      seedEntry(database)
      expect(rows(database, 'SELECT * FROM audit_log')).toHaveLength(1)
    })
  })

  test('no field but detail may be rewritten', async () => {
    await withDatabase((database) => {
      seedEntry(database)
      for (const [column, value] of [['action', 'role.revoked'], ['target', 'user:u-2'], ['actor_id', 'u-9'], ['created_at', 0]] as const) {
        expect(() => database.batch([[`UPDATE audit_log SET ${column} = ? WHERE id = ?`, value, 'a-1']]))
          .toThrow(/append-only/i)
      }
    })
  })

  // Erasure redacts an entry that has picked up identifying values (0011). Nothing else about
  // the entry may move, so the record of what happened survives the redaction.
  test('detail may be redacted, and the rest of the entry survives it', async () => {
    await withDatabase((database) => {
      seedEntry(database)
      database.batch([['UPDATE audit_log SET detail = ? WHERE id = ?', '{"redacted":true}', 'a-1']])
      const [entry] = rows<{ action: string, target: string, detail: string }>(
        database, 'SELECT action, target, detail FROM audit_log',
      )
      expect(entry).toEqual({ action: 'role.granted', target: 'user:u-1', detail: '{"redacted":true}' })
    })
  })

  test('an entry cannot be deleted', async () => {
    await withDatabase((database) => {
      seedEntry(database)
      expect(() => database.batch([['DELETE FROM audit_log WHERE id = ?', 'a-1']]))
        .toThrow(/append-only/i)
    })
  })
})
