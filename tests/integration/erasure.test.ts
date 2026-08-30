import { describe, expect, test } from 'bun:test'
import { EXPORTED_TABLES, PERSONAL_TABLES } from '#shared/utils/personal-data'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// Named regression cases (K-121). Erasure is anonymisation in one transaction (0011). These run
// the real migrations, so the triggers are the ones production has rather than a description.

const NAME = 'Imogen Hart'
const EMAIL = 'imogen.hart@example.invalid'
const REDACTED = JSON.stringify({ redacted: true })

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

// A fixture with a row in every table the registry knows, so completeness has something to find.
function seedPerson(database: TestDatabase, id = 'u-erase'): string {
  const now = Math.floor(Date.now() / 1000)
  database.batch([
    ['INSERT INTO users (id, email, name, pronouns, password, verified) VALUES (?, ?, ?, ?, ?, 1)',
      id, EMAIL, NAME, 'she/her', 'scrypt$fake'],
    ['INSERT INTO emergency_contacts (user_id, name, phone, relation, updated_at) VALUES (?, ?, ?, ?, ?)',
      id, 'Her Mother', '07700 900000', 'mother', now],
    ['INSERT INTO memberships (id, user_id, starts_on, expires_on, source, evidence, granted_by) VALUES (?, ?, \'2026-09-14\', \'2027-09-13\', ?, ?, ?)',
      `m-${id}`, id, 'MANUAL', `paid in person, ${NAME}`, id],
    ['INSERT INTO role_grants (id, user_id, role, granted_at, note) VALUES (?, ?, ?, ?, ?)',
      `g-${id}`, id, 'BOX_OFFICE', now, `${NAME} asked for this`],
    ['INSERT INTO totp_secrets (user_id, secret, created_at) VALUES (?, ?, ?)', id, 'SECRETSECRET', now],
    ['INSERT INTO recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)', `r-${id}`, id, 'abcdef'],
    ['INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, created_at) VALUES (?, ?, ?, ?, 0, ?)',
      `p-${id}`, id, `cred-${id}`, 'key', now],
    ['INSERT INTO auth_tokens (id, user_id, kind, token_hash, email, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      `t-${id}`, id, 'EMAIL_VERIFY', `hash-${id}`, EMAIL, now + 3600],
    ['INSERT INTO mfa_attempts (id, user_id, expires_at) VALUES (?, ?, ?)', `a-${id}`, id, now + 300],
    ['INSERT INTO notification_preferences (user_id, topic, email, push) VALUES (?, ?, 1, 0)', id, 'BOOKINGS'],
    ['INSERT INTO notification_log (id, user_id, type, channel, subject, status) VALUES (?, ?, ?, ?, ?, ?)',
      `n-${id}`, id, 'account.verify', 'EMAIL', `${NAME}, confirm your address`, 'SENT'],
    ['INSERT INTO inbox_items (id, user_id, type, title, body) VALUES (?, ?, ?, ?, ?)',
      `i-${id}`, id, 'note', `A message for ${NAME}`, `about ${EMAIL}`],
    // An entry that picked up an identifying value despite the write-time guard: the case the
    // redaction exists for (0011, "aim is not guarantee").
    ['INSERT INTO audit_log (id, actor_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      `al-${id}`, id, 'account.registered', `user:${id}`, JSON.stringify({ who: NAME, address: EMAIL }), now],
  ])
  return id
}

// The erasure statements, run the way production runs them: one batch, all or nothing.
async function erase(database: TestDatabase, id: string): Promise<void> {
  const { erasureStatements } = await import('#shared/utils/erasure')
  const now = Math.floor(Date.now() / 1000)
  database.batch(erasureStatements(id, now).map(statement => boundStatement(database, statement)))
}

// Everything the export would hand over, which is what completeness is measured against.
function exported(database: TestDatabase, id: string): string {
  const collected: Record<string, unknown[]> = {}
  for (const entry of EXPORTED_TABLES) {
    collected[entry.section!] = rows(database, `
      SELECT ${entry.columns!.join(', ')} FROM ${entry.name} WHERE ${entry.column} = ?
    `, id)
  }
  return JSON.stringify(collected)
}

describe('erasure (K-109, 0011)', () => {
  test('erasure completeness: no personal value survives anywhere the export reaches', async () => {
    await withDatabase(async (database) => {
      const id = seedPerson(database)
      expect(exported(database, id)).toContain(NAME)

      await erase(database, id)

      const bundle = exported(database, id)
      expect(bundle).not.toContain(NAME)
      expect(bundle).not.toContain(EMAIL)
      expect(bundle).not.toContain('she/her')
      expect(bundle).not.toContain('Her Mother')
      expect(bundle).not.toContain('07700 900000')

      // Nothing outside the export either: the whole database is checked, not just the bundle.
      for (const entry of PERSONAL_TABLES) {
        const all = JSON.stringify(rows(database, `SELECT * FROM ${entry.name}`))
        expect(`${entry.name}: ${all.includes(NAME) || all.includes(EMAIL)}`).toBe(`${entry.name}: false`)
      }
    })
  })

  test('an anonymised row is never written back over', async () => {
    await withDatabase(async (database) => {
      const id = seedPerson(database)
      await erase(database, id)

      // The guard is the database's, so it holds for a handler nobody has written yet.
      expect(() => database.batch([['UPDATE users SET name = ? WHERE id = ?', NAME, id]])).toThrow()
      expect(() => database.batch([['UPDATE users SET email = ? WHERE id = ?', EMAIL, id]])).toThrow()
      expect(() => database.batch([['UPDATE users SET password = ? WHERE id = ?', 'scrypt$new', id]])).toThrow()
      expect(() => database.batch([['UPDATE users SET anonymised_at = NULL WHERE id = ?', id]])).toThrow()

      // Disabling one is meaningless but harmless, so the guard does not stand in its way.
      expect(() => database.batch([['UPDATE users SET disabled = 1 WHERE id = ?', id]])).not.toThrow()
    })
  })

  test('booking and sales statistics survive an erasure', async () => {
    await withDatabase(async (database) => {
      const id = seedPerson(database)
      await erase(database, id)

      // Bookings and sales have no tables yet. What exists of the same kind is the membership
      // year and the message log, and both survive without the person in them.
      const memberships = rows<{ startsOn: string, evidence: string | null }>(database,
        'SELECT starts_on AS startsOn, evidence FROM memberships WHERE user_id = ?', id)
      expect(memberships).toHaveLength(1)
      expect(memberships[0]).toMatchObject({ startsOn: '2026-09-14', evidence: null })

      const messages = rows<{ status: string, subject: string | null }>(database,
        'SELECT status, subject FROM notification_log WHERE user_id = ?', id)
      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({ status: 'SENT', subject: null })

      // The row itself is still there for everything referring to it.
      expect(rows(database, 'SELECT id FROM users WHERE id = ?', id)).toHaveLength(1)
    })
  })

  test('the erasure hook is idempotent under retry', async () => {
    await withDatabase(async (database) => {
      const id = seedPerson(database)
      await erase(database, id)

      const after = JSON.stringify(rows(database, 'SELECT * FROM users WHERE id = ?', id))
      const trail = JSON.stringify(rows(database, 'SELECT * FROM audit_log WHERE actor_id = ?', id))

      // A retry rewrites nothing: the tombstone guard would refuse a second identifying write,
      // and the redaction is a fixed shape, so the second run is a no-op rather than a failure.
      await erase(database, id)

      expect(JSON.stringify(rows(database, 'SELECT * FROM users WHERE id = ?', id))).toBe(after)
      expect(JSON.stringify(rows(database, 'SELECT * FROM audit_log WHERE actor_id = ?', id))).toBe(trail)
    })
  })

  // J-102 criteria 2 and 4: the trail keeps what happened, and loses who it was about.
  test('an identifying value in an audit detail is redacted, and the entry survives it', async () => {
    await withDatabase(async (database) => {
      const id = seedPerson(database)
      await erase(database, id)

      const entries = rows<{ action: string, target: string, detail: string, actor_id: string }>(database,
        'SELECT action, target, detail, actor_id FROM audit_log WHERE id = ?', `al-${id}`)

      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({
        action: 'account.registered',
        target: `user:${id}`,
        actor_id: id,
        detail: REDACTED,
      })
    })
  })
})
