import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { erasureStatements } from '#shared/utils/erasure'
import { reconcileTraining, transformTraining } from '#migration/training'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// K-113, proved against a source shaped like the real old rehearsal schema. The rehearsal
// against a production dump is the other half and cannot run here.

// The tables the transform reads, and nothing else.
function oldEstate(): Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE department_leads (
      id TEXT PRIMARY KEY, department TEXT, user_id TEXT, granted_by TEXT, created_at INTEGER);
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, held_on TEXT, trainer_user_id TEXT, location TEXT, notes TEXT,
      status TEXT, starts_at INTEGER, ends_at INTEGER, capacity INTEGER,
      register_opened_at INTEGER, cancelled_at INTEGER, cancel_reason TEXT,
      created_at INTEGER, updated_at INTEGER);
    CREATE TABLE session_modules (id TEXT PRIMARY KEY, session_id TEXT, module_id TEXT);
    CREATE TABLE session_attendees (
      id TEXT PRIMARY KEY, session_id TEXT, user_id TEXT, status TEXT, signed_up_at INTEGER,
      source TEXT, marked_at INTEGER, marked_by_user_id TEXT);
    CREATE TABLE module_requests (
      id TEXT PRIMARY KEY, user_id TEXT, module_id TEXT, note TEXT, status TEXT,
      resolved_at INTEGER, resolved_by TEXT, decline_reason TEXT, created_at INTEGER);
    CREATE TABLE records (
      id TEXT PRIMARY KEY, user_id TEXT, module_id TEXT, awarded_at TEXT, expires_at TEXT,
      expiry_overridden INTEGER, source TEXT, session_id TEXT, granted_by TEXT,
      external_ref TEXT, revoked_at INTEGER, revoked_by TEXT, revoke_reason TEXT, created_at INTEGER);
  `)
  return db
}

const MARCH = Date.UTC(2024, 2, 4, 19)

async function targetWithCatalogue(): Promise<TestDatabase> {
  const target = await createTestDatabase()
  target.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'new-trainer', 'trainer@example.invalid', 'A Trainer'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'new-member', 'member@example.invalid', 'A Member'],
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
    ['INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'TECH-111', 'TECH', 'MODULE', 'Working at height'],
  ])
  return target
}

function run(
  source: Database,
  target: TestDatabase,
  accounts = new Map([['old-trainer', 'new-trainer'], ['old-member', 'new-member']]),
  ids: { sessionIds?: Map<string, string>, requestIds?: Map<string, string>, recordIds?: Map<string, string> } = {},
): ReturnType<typeof transformTraining> {
  const raw = (target as unknown as { raw: Database }).raw ?? (target as unknown as Database)
  return transformTraining({
    source,
    accounts,
    moduleIds: new Set(rows<{ id: string }>(target, 'SELECT id FROM modules').map(row => row.id)),
    departmentCodes: new Set(rows<{ code: string }>(target, 'SELECT code FROM departments').map(row => row.code)),
    sessionIds: ids.sessionIds ?? new Map(),
    requestIds: ids.requestIds ?? new Map(),
    recordIds: ids.recordIds ?? new Map(),
    target: raw,
  })
}

describe('the training history imports keyed to the canonical account (K-113)', () => {
  test('a session, its attendee and their record all land', async () => {
    const source = oldEstate()
    source.query(`INSERT INTO sessions (id, held_on, trainer_user_id, location, notes, status, starts_at, ends_at, capacity, created_at, updated_at)
      VALUES ('s-1', '2024-03-04', 'old-trainer', 'Studio 1', 'Bring harnesses', 'DELIVERED', ?, ?, 12, ?, ?)`)
      .run(MARCH, MARCH + 2 * 3_600_000, MARCH - 86_400_000, MARCH - 86_400_000)
    source.query(`INSERT INTO session_modules (id, session_id, module_id) VALUES ('sm-1', 's-1', 'TECH-111')`).run()
    source.query(`INSERT INTO session_attendees (id, session_id, user_id, status, signed_up_at, source)
      VALUES ('sa-1', 's-1', 'old-member', 'ATTENDED', ?, 'SELF')`).run(MARCH - 3_600_000)
    source.query(`INSERT INTO records (id, user_id, module_id, awarded_at, source, session_id, created_at)
      VALUES ('r-1', 'old-member', 'TECH-111', '2024-03-04', 'SESSION', 's-1', ?)`).run(MARCH)

    const target = await targetWithCatalogue()
    try {
      const { summary, exceptions } = run(source, target)
      expect(exceptions).toEqual([])
      expect(summary).toMatchObject({ sessionsWritten: 1, attendeesWritten: 1, recordsWritten: 1 })

      const [session] = rows<{ trainer_id: string, starts_at: string, ends_at: string, capacity: number }>(
        target, 'SELECT trainer_id, starts_at, ends_at, capacity FROM training_sessions')
      expect(session?.trainer_id).toBe('new-trainer')
      expect(session?.starts_at).toBe('19:00')
      expect(session?.ends_at).toBe('21:00')
      expect(session?.capacity).toBe(12)

      const [record] = rows<{ user_id: string, source: string }>(target, 'SELECT user_id, source FROM training_records')
      expect(record?.user_id).toBe('new-member')
      expect(record?.source).toBe('SESSION')
    }
    finally {
      target.close()
      source.close()
    }
  })

  test('a session with no imported trainer is an exception, not a guess', async () => {
    const source = oldEstate()
    source.query(`INSERT INTO sessions (id, held_on, trainer_user_id, status, starts_at, ends_at, created_at, updated_at)
      VALUES ('s-1', '2024-03-04', 'somebody-erasure-removed', 'DELIVERED', ?, ?, ?, ?)`)
      .run(MARCH, MARCH + 3_600_000, MARCH, MARCH)

    const target = await targetWithCatalogue()
    try {
      const { summary, exceptions } = run(source, target)
      expect(summary.sessionsWritten).toBe(0)
      expect(summary.skippedSessionNoTrainer).toBe(1)
      expect(exceptions[0]).toContain('no canonical account for trainer')
    }
    finally {
      target.close()
      source.close()
    }
  })

  test('an admin-sourced record imports as LEGACY, the reserved vocabulary (G-127)', async () => {
    const source = oldEstate()
    source.query(`INSERT INTO records (id, user_id, module_id, awarded_at, source, created_at)
      VALUES ('r-1', 'old-member', 'TECH-111', '2024-03-04', 'ADMIN', ?)`).run(MARCH)

    const target = await targetWithCatalogue()
    try {
      run(source, target)
      expect(rows<{ source: string }>(target, 'SELECT source FROM training_records')[0]?.source).toBe('LEGACY')
    }
    finally {
      target.close()
      source.close()
    }
  })

  // 0011, 0059: a session's own scrub (trainer_id-keyed) must survive a later re-import.
  test('a session already scrubbed by erasure does not regain its trainer notes', async () => {
    const source = oldEstate()
    source.query(`INSERT INTO sessions (id, held_on, trainer_user_id, notes, cancel_reason, status, starts_at, ends_at, created_at, updated_at)
      VALUES ('s-1', '2024-03-04', 'old-trainer', 'Bring harnesses', NULL, 'DELIVERED', ?, ?, ?, ?)`)
      .run(MARCH, MARCH + 3_600_000, MARCH, MARCH)
    source.query(`INSERT INTO session_modules (id, session_id, module_id) VALUES ('sm-1', 's-1', 'TECH-111')`).run()

    const target = await targetWithCatalogue()
    const sessionIds = new Map<string, string>()
    try {
      run(source, target, undefined, { sessionIds })
      expect(rows<{ notes: string | null }>(target, 'SELECT notes FROM training_sessions')[0]?.notes).toBe('Bring harnesses')

      target.batch(erasureStatements('new-trainer', 1_780_000_000).map(statement => boundStatement(target, statement)))
      expect(rows<{ notes: string | null }>(target, 'SELECT notes FROM training_sessions')[0]?.notes).toBeNull()

      // The old estate never heard about the erasure: its export still has the real notes.
      run(source, target, undefined, { sessionIds })
      expect(rows(target, 'SELECT id FROM training_sessions')).toHaveLength(1)
      expect(rows<{ notes: string | null }>(target, 'SELECT notes FROM training_sessions')[0]?.notes).toBeNull()
    }
    finally {
      target.close()
      source.close()
    }
  })

  // 0011, 0059: a module request's scrub must survive a later re-import the same way.
  test('a module request already scrubbed by erasure does not regain its note', async () => {
    const source = oldEstate()
    source.query(`INSERT INTO module_requests (id, user_id, module_id, note, status, created_at)
      VALUES ('mr-1', 'old-member', 'TECH-111', 'I would like to learn this', 'OPEN', ?)`).run(MARCH)

    const target = await targetWithCatalogue()
    const requestIds = new Map<string, string>()
    try {
      run(source, target, undefined, { requestIds })
      expect(rows<{ note: string | null }>(target, 'SELECT note FROM module_requests')[0]?.note).toBe('I would like to learn this')

      target.batch(erasureStatements('new-member', 1_780_000_000).map(statement => boundStatement(target, statement)))
      expect(rows<{ note: string | null }>(target, 'SELECT note FROM module_requests')[0]?.note).toBeNull()

      run(source, target, undefined, { requestIds })
      expect(rows(target, 'SELECT id FROM module_requests')).toHaveLength(1)
      expect(rows<{ note: string | null }>(target, 'SELECT note FROM module_requests')[0]?.note).toBeNull()
    }
    finally {
      target.close()
      source.close()
    }
  })

  // 0010: append-only, so a second run of the same unchanged source neither duplicates the
  // award nor attempts the update that would crash on the named-edits trigger.
  test('running the record import twice lands the award once, and evidence stays scrubbed', async () => {
    const source = oldEstate()
    source.query(`INSERT INTO records (id, user_id, module_id, awarded_at, source, external_ref, created_at)
      VALUES ('r-1', 'old-member', 'TECH-111', '2024-03-04', 'EXTERNAL', 'Cert on file', ?)`).run(MARCH)

    const target = await targetWithCatalogue()
    const recordIds = new Map<string, string>()
    try {
      run(source, target, undefined, { recordIds })
      expect(rows(target, 'SELECT id FROM training_records')).toHaveLength(1)

      target.batch(erasureStatements('new-member', 1_780_000_000).map(statement => boundStatement(target, statement)))
      expect(rows<{ ref: string | null }>(target, 'SELECT evidence_ref AS ref FROM training_records')[0]?.ref).toBeNull()

      expect(() => run(source, target, undefined, { recordIds })).not.toThrow()
      expect(rows(target, 'SELECT id FROM training_records')).toHaveLength(1)
      expect(rows<{ ref: string | null }>(target, 'SELECT evidence_ref AS ref FROM training_records')[0]?.ref).toBeNull()
    }
    finally {
      target.close()
      source.close()
    }
  })

  test('a department lead imports with a real expiry, never a permanent grant', async () => {
    const source = oldEstate()
    source.query(`INSERT INTO department_leads (id, department, user_id, created_at) VALUES ('dl-1', 'TECH', 'old-member', ?)`)
      .run(Date.UTC(2020, 8, 1) / 1000 * 1000)

    const target = await targetWithCatalogue()
    try {
      const { summary } = run(source, target)
      expect(summary.leadsWritten).toBe(1)
      const [lead] = rows<{ expires_at: number | null }>(target, 'SELECT expires_at FROM department_leads')
      expect(lead?.expires_at).not.toBeNull()
      expect(lead!.expires_at!).toBeLessThan(Math.floor(Date.now() / 1000))
    }
    finally {
      target.close()
      source.close()
    }
  })

  test('reconciliation is green when every row is accounted for', async () => {
    const source = oldEstate()
    source.query(`INSERT INTO records (id, user_id, module_id, awarded_at, source, created_at)
      VALUES ('r-1', 'old-member', 'TECH-111', '2024-03-04', 'SIGNOFF', ?)`).run(MARCH)

    const target = await targetWithCatalogue()
    try {
      const { summary } = run(source, target)
      const raw = (target as unknown as { raw: Database }).raw
      expect(reconcileTraining(raw, summary).ok).toBe(true)
    }
    finally {
      target.close()
      source.close()
    }
  })
})
