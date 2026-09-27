import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { isAuditAction } from '#shared/utils/audit-actions'

// A-134 criteria 2 and 3 against a scratch database at the shape the retirement meets: the grants
// a real committee holds, then the one migration, then what each holder is left with.

const MIGRATIONS_DIR = 'server/db/migrations/sqlite'
// Found by name, so the number it is given when it lands does not matter here.
const RETIRE_NAME = '_the_front_of_house_role_is_retired'
const FUTURE = 2_000_000_000

async function journalTags(): Promise<string[]> {
  const journal = await Bun.file(join(MIGRATIONS_DIR, 'meta', '_journal.json')).json() as { entries: { tag: string }[] }
  return journal.entries.map(entry => entry.tag)
}

function execMigration(raw: Database, sql: string): void {
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim()
    if (trimmed) raw.exec(trimmed)
  }
}

async function withRetired(seed: (raw: Database) => void, check: (raw: Database) => void): Promise<void> {
  const tags = await journalTags()
  const cutoff = tags.findIndex(tag => tag.endsWith(RETIRE_NAME))
  if (cutoff === -1) throw new Error(`no migration ending ${RETIRE_NAME} is in the journal`)
  const raw = new Database(':memory:')
  try {
    raw.exec('PRAGMA foreign_keys = ON;')
    for (const tag of tags.slice(0, cutoff)) execMigration(raw, await Bun.file(join(MIGRATIONS_DIR, `${tag}.sql`)).text())
    seed(raw)
    execMigration(raw, await Bun.file(join(MIGRATIONS_DIR, `${tags[cutoff]}.sql`)).text())
    check(raw)
  }
  finally {
    raw.close()
  }
}

function person(raw: Database, id: string): void {
  raw.query('INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)').run(id, `${id}@e2e.newtheatre.org.uk`, `Someone ${id}`)
}

function grant(raw: Database, userId: string, role: string, expiresAt: number | null, note: string | null = null): void {
  raw.query('INSERT INTO role_grants (id, user_id, role, expires_at, granted_at, note) VALUES (?, ?, ?, ?, ?, ?)')
    .run(`${userId}-${role}`, userId, role, expiresAt, 1_700_000_000, note)
}

function rolesOf(raw: Database, userId: string): [string, number | null][] {
  return (raw.query('SELECT role, expires_at AS expiresAt FROM role_grants WHERE user_id = ? ORDER BY role').all(userId) as { role: string, expiresAt: number | null }[])
    .map(row => [row.role, row.expiresAt])
}

describe('the front of house role is retired (A-134 criterion 2)', () => {
  test('every front of house grant is removed, and every other grant is untouched', async () => {
    await withRetired((raw) => {
      person(raw, 'crew')
      person(raw, 'officer')
      grant(raw, 'crew', 'FRONT_OF_HOUSE', FUTURE)
      grant(raw, 'officer', 'FRONT_OF_HOUSE', null)
      grant(raw, 'officer', 'FOH_MANAGER', FUTURE)
      grant(raw, 'officer', 'COMMITTEE', null)
    }, (raw) => {
      expect(raw.query('SELECT count(*) AS n FROM role_grants WHERE role = \'FRONT_OF_HOUSE\'').get()).toEqual({ n: 0 })
      expect(rolesOf(raw, 'crew')).toEqual([])
      expect(rolesOf(raw, 'officer')).toEqual([['COMMITTEE', null], ['FOH_MANAGER', FUTURE]])
    })
  })
})

describe('each removed grant is audited, with no free text (A-134 criterion 3, 0011)', () => {
  test('one role.retired entry per front of house grant, naming the role and the expiry it had', async () => {
    await withRetired((raw) => {
      person(raw, 'dated')
      person(raw, 'permanent')
      grant(raw, 'dated', 'FRONT_OF_HOUSE', FUTURE, 'A note that must not travel')
      grant(raw, 'permanent', 'FRONT_OF_HOUSE', null)
    }, (raw) => {
      const entries = raw.query(`
        SELECT actor_id AS actorId, target, detail FROM audit_log WHERE action = 'role.retired' ORDER BY target
      `).all() as { actorId: string | null, target: string, detail: string }[]
      expect(entries.map(entry => ({ ...entry, detail: JSON.parse(entry.detail) as unknown }))).toEqual([
        { actorId: null, target: 'user:dated', detail: { role: 'FRONT_OF_HOUSE', expiresAt: FUTURE, permanent: false } },
        { actorId: null, target: 'user:permanent', detail: { role: 'FRONT_OF_HOUSE', expiresAt: null, permanent: true } },
      ])
      expect(entries.some(entry => entry.detail.includes('must not travel'))).toBe(false)
      expect(isAuditAction('role.retired')).toBe(true)
    })
  })

  test('a database with no front of house grant writes no entry at all', async () => {
    await withRetired((raw) => {
      person(raw, 'holder')
      grant(raw, 'holder', 'FOH_MANAGER', FUTURE)
    }, (raw) => {
      expect(raw.query('SELECT count(*) AS n FROM audit_log WHERE action = \'role.retired\'').get()).toEqual({ n: 0 })
      expect(rolesOf(raw, 'holder')).toEqual([['FOH_MANAGER', FUTURE]])
    })
  })
})
