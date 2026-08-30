import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { buildLoad, applyLoad, loadedCounts } from '#migration/load'
import { createCore, transformIdentity } from '#migration/identity'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// The import proved on a source it can assert about, against the real schema the migrations build
// (K-112). The rehearsal against production dumps is the other half, and cannot run here.

const ROLE_MAP = { 'auth:ADMIN': 'ADMIN', 'ticketing:BOX_OFFICE': 'BOX_OFFICE' }

// A stand-in for one stage-door export: the tables the transform reads, and nothing else.
function sourceEstate(): Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, password TEXT,
      google_sub TEXT, pending_google_email TEXT, email_verified INTEGER, disabled INTEGER,
      session_epoch INTEGER, last_login INTEGER, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE user_roles (
      user_id TEXT, role TEXT, expires_at INTEGER, granted_by TEXT, granted_at INTEGER,
      note TEXT, expiry_warned_at INTEGER);
    CREATE TABLE totp_secrets (
      user_id TEXT, secret TEXT, confirmed_at INTEGER, last_used_step INTEGER, created_at INTEGER);
    CREATE TABLE mfa_recovery_codes (user_id TEXT, code_hash TEXT, used_at INTEGER);
  `)
  return db
}

interface Person {
  id: string
  email: string
  name?: string
  password?: string | null
  verified?: number
  disabled?: number
  updated?: number
}

function addPerson(db: Database, person: Person): void {
  db.query(`
    INSERT INTO users (id, email, name, password, google_sub, pending_google_email, email_verified,
      disabled, session_epoch, last_login, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 0, NULL, 1700000000, ?)
  `).run(
    person.id, person.email, person.name ?? 'A Member (test)', person.password ?? null,
    person.verified ?? 1, person.disabled ?? 0, person.updated ?? 1700000000,
  )
}

interface Run {
  target: TestDatabase
  ids: Map<string, string>
  exceptions: string[]
  summary: Record<string, number>
}

// One pass of the whole pipeline: transform into the core, build the SQL, apply it to the schema
// the application's own migrations produce.
async function importInto(source: Database, target: TestDatabase, ids = new Map<string, string>()): Promise<Run> {
  const core = await createCore(':memory:')
  try {
    const { summary, exceptions } = transformIdentity({ auth: source, mirrors: [], roleMap: ROLE_MAP, idMap: ids, target: core })
    applyLoad(buildLoad(core), target.raw)
    return { target, ids, exceptions, summary }
  }
  finally {
    core.close()
  }
}

describe('the identity import lands in the application schema (K-112)', () => {
  test('a person, their role and their authenticator arrive', async () => {
    const source = sourceEstate()
    addPerson(source, { id: 'old-1', email: 'officer@example.invalid', name: 'An Officer (test)' })
    source.query('INSERT INTO user_roles VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('old-1', 'auth:ADMIN', null, null, 1700000000, null, null)
    source.query('INSERT INTO totp_secrets VALUES (?, ?, ?, ?, ?)')
      .run('old-1', 'SECRET', 1700000000, null, 1700000000)

    const target = await createTestDatabase()
    try {
      const run = await importInto(source, target)
      const [person] = rows<{ id: string, email: string }>(target, 'SELECT id, email FROM users')
      expect(person!.email).toBe('officer@example.invalid')
      expect(person!.id).not.toBe('old-1')
      expect(rows(target, 'SELECT 1 FROM role_grants WHERE role = ?', 'ADMIN')).toHaveLength(1)
      expect(rows(target, 'SELECT 1 FROM totp_secrets')).toHaveLength(1)
      expect(run.summary.users).toBe(1)
    }
    finally {
      target.close()
      source.close()
    }
  })

  // Criterion 4. The id map is what makes the second run an update rather than a second estate.
  test('running it twice updates rather than duplicates', async () => {
    const source = sourceEstate()
    for (let index = 0; index < 5; index++) {
      addPerson(source, { id: `old-${index}`, email: `member${index}@example.invalid` })
    }

    const target = await createTestDatabase()
    try {
      const first = await importInto(source, target)
      const before = rows<{ id: string }>(target, 'SELECT id FROM users ORDER BY id').map(row => row.id)

      source.query('UPDATE users SET name = ? WHERE id = ?').run('A Renamed Member (test)', 'old-2')
      addPerson(source, { id: 'old-9', email: 'joined-later@example.invalid' })

      await importInto(source, target, first.ids)
      const after = rows<{ id: string }>(target, 'SELECT id FROM users ORDER BY id').map(row => row.id)

      // Everyone from the first run is still there under the id they were given, and the person
      // who joined since is beside them rather than instead of them.
      expect(after).toHaveLength(6)
      expect(before.filter(id => after.includes(id))).toHaveLength(5)
      expect(rows<{ name: string }>(target, 'SELECT name FROM users WHERE email = ?', 'member2@example.invalid')[0]!.name)
        .toBe('A Renamed Member (test)')
    }
    finally {
      target.close()
      source.close()
    }
  })

  // Criterion 1: the old estate's hashes are the same PHC scrypt strings this app writes, so a
  // password survives the move. Hashed here by the application's own hasher to prove the shape.
  test('an imported password still verifies', async () => {
    // The driver nuxt-auth-utils uses, on its defaults: the same PHC string the app writes.
    const scrypt = new Scrypt({})
    const secret = 'a-password-nobody-has-to-reset'
    const hash = await scrypt.make(secret)

    const source = sourceEstate()
    addPerson(source, { id: 'old-1', email: 'keeps-password@example.invalid', password: hash })

    const target = await createTestDatabase()
    try {
      await importInto(source, target)
      const stored = rows<{ password: string }>(target, 'SELECT password FROM users')[0]!.password
      expect(stored).toBe(hash)
      expect(await scrypt.verify(stored, secret)).toBe(true)
    }
    finally {
      target.close()
      source.close()
    }
  })

  // Criterion 3, and the guard that makes it stick (0011).
  test('a tombstone imports anonymised and cannot be rewritten', async () => {
    const source = sourceEstate()
    addPerson(source, { id: 'old-1', email: 'deleted-abc@anonymised.invalid', updated: 1699000000 })

    const target = await createTestDatabase()
    try {
      await importInto(source, target)
      const [row] = rows<{ id: string, anonymised: number | null }>(target, 'SELECT id, anonymised_at AS anonymised FROM users')
      expect(row!.anonymised).toBe(1699000000)
      expect(() => target.raw.query('UPDATE users SET name = ? WHERE id = ?').run('Someone', row!.id)).toThrow()
    }
    finally {
      target.close()
      source.close()
    }
  })

  test('an address that is not lowercase is normalised, because the schema refuses it otherwise', async () => {
    const source = sourceEstate()
    addPerson(source, { id: 'old-1', email: 'Shouty.Member@Example.Invalid' })

    const target = await createTestDatabase()
    try {
      await importInto(source, target)
      expect(rows<{ email: string }>(target, 'SELECT email FROM users')[0]!.email).toBe('shouty.member@example.invalid')
    }
    finally {
      target.close()
      source.close()
    }
  })

  // The old estate's ids are not data here (0015), including where one hides in a column with no
  // foreign key to catch it.
  test('the officer who granted a role is mapped, never carried across as an old id', async () => {
    const source = sourceEstate()
    addPerson(source, { id: 'old-1', email: 'granter@example.invalid' })
    addPerson(source, { id: 'old-2', email: 'holder@example.invalid' })
    source.query('INSERT INTO user_roles VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('old-2', 'auth:ADMIN', null, 'old-1', 1700000000, null, null)
    source.query('INSERT INTO user_roles VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('old-1', 'ticketing:BOX_OFFICE', null, 'someone-who-left', 1700000000, null, null)

    const target = await createTestDatabase()
    try {
      const run = await importInto(source, target)
      const granter = rows<{ id: string }>(target, 'SELECT id FROM users WHERE email = ?', 'granter@example.invalid')[0]!.id

      expect(rows<{ by: string | null }>(target, 'SELECT granted_by AS by FROM role_grants WHERE role = ?', 'ADMIN')[0]!.by)
        .toBe(granter)
      expect(rows<{ by: string | null }>(target, 'SELECT granted_by AS by FROM role_grants WHERE role = ?', 'BOX_OFFICE')[0]!.by)
        .toBeNull()
      expect(run.exceptions.join('\n')).toMatch(/granted by an unknown/i)
    }
    finally {
      target.close()
      source.close()
    }
  })

  test('the load reports what it put in each table', async () => {
    const source = sourceEstate()
    addPerson(source, { id: 'old-1', email: 'counted@example.invalid' })

    const target = await createTestDatabase()
    try {
      await importInto(source, target)
      expect(loadedCounts(target.raw)).toMatchObject({ users: 1, role_grants: 0, totp_secrets: 0, recovery_codes: 0 })
    }
    finally {
      target.close()
      source.close()
    }
  })
})
