import { describe, expect, test } from 'bun:test'
import { auditEntry } from '#shared/utils/audit'
import { erasureStatements } from '#shared/utils/erasure'
import { endOfTerm } from '#shared/utils/membership'
import { declineClaimStatements, recordClaimStatements } from '#shared/utils/membership-claims'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { race } from '#tests/helpers/race'
import type { TestDatabase } from '#tests/helpers/database'

// A-130. One open claim per person is the database's rule, recording it is at most once however
// many officers press the button, and erasure leaves a statistic rather than a person.

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
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u1', 'one@example.invalid', 'A Member'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u2', 'two@example.invalid', 'Another'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'officer', 'officer@example.invalid', 'An Officer'],
  ])
}

function claim(database: TestDatabase, columns: Record<string, unknown> = {}): void {
  const values: Record<string, unknown> = {
    id: `c-${Math.random().toString(36).slice(2, 10)}`,
    user_id: 'u1',
    student_id: '20123456',
    starts_on: '2026-09-14',
    term: 1,
    ...columns,
  }
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO membership_claims (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

const run = (database: TestDatabase, statements: ReturnType<typeof recordClaimStatements>): void =>
  database.batch(statements.map(statement => boundStatement(database, statement)))

describe('one open claim per person (A-130 criterion 1)', () => {
  test('a second open claim is refused by the database', async () => {
    await withDatabase((database) => {
      seed(database)
      claim(database)
      expect(() => claim(database)).toThrow()
      expect(rows(database, 'SELECT id FROM membership_claims')).toHaveLength(1)
    })
  })

  test('two people may each have one open', async () => {
    await withDatabase((database) => {
      seed(database)
      claim(database)
      claim(database, { user_id: 'u2' })
      expect(rows(database, 'SELECT id FROM membership_claims')).toHaveLength(2)
    })
  })

  // The index is partial on OPEN, so a withdrawn or answered claim leaves it and the next one is
  // free to be made: a declined claim can be put right and sent again.
  test('withdrawing, declining and recording each free the next claim', async () => {
    await withDatabase((database) => {
      seed(database)
      claim(database, { id: 'c-first' })
      database.batch([[`UPDATE membership_claims SET status = 'WITHDRAWN' WHERE id = 'c-first'`]])
      claim(database, { id: 'c-second' })
      database.batch([[`UPDATE membership_claims SET status = 'DECLINED', reason = 'Not on the list' WHERE id = 'c-second'`]])
      claim(database, { id: 'c-third' })
      database.batch([[`UPDATE membership_claims SET status = 'RECORDED' WHERE id = 'c-third'`]])
      claim(database, { id: 'c-fourth' })

      expect(rows(database, 'SELECT id FROM membership_claims')).toHaveLength(4)
      expect(rows(database, `SELECT id FROM membership_claims WHERE status = 'OPEN'`)).toHaveLength(1)
    })
  })

  test('a status outside the four, and a term the SU does not sell, are both refused', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => claim(database, { status: 'PENDING' })).toThrow()
      expect(() => claim(database, { term: 2 })).toThrow()
      expect(() => claim(database, { term: 3 })).not.toThrow()
    })
  })

  test('a claim dies with the person, because it is a thing they said', async () => {
    await withDatabase((database) => {
      seed(database)
      claim(database)
      database.batch([['DELETE FROM users WHERE id = ?', 'u1']])
      expect(rows(database, 'SELECT id FROM membership_claims')).toHaveLength(0)
    })
  })
})

// The statements the record route runs, in the order it runs them, guarded on the claim still
// being open at commit time: the loser of a race writes nothing at all (0006).
function attemptRecord(database: TestDatabase, index: number): { status: number } {
  const membershipId = `m-${index}`
  const expiresOn = endOfTerm('2026-09-14', 1)
  const entries = {
    studentId: auditEntry({ actorId: 'officer', action: 'account.student-id.recorded', target: 'user:u1', detail: { replaced: false } }),
    granted: auditEntry({ actorId: 'officer', action: 'membership.granted', target: 'user:u1', detail: { membership: membershipId, years: 1, expiresOn } }),
    recorded: auditEntry({ actorId: 'officer', action: 'membership.claim.recorded', target: 'claim:c-1', detail: { claim: 'c-1', membership: membershipId } }),
  }
  try {
    run(database, recordClaimStatements({
      claimId: 'c-1',
      userId: 'u1',
      studentId: '20123456',
      membership: { id: membershipId, startsOn: '2026-09-14', expiresOn },
      actorId: 'officer',
      now: 1_790_000_000 + index,
      entries,
    }))
  }
  catch {
    return { status: 500 }
  }
  return { status: rows(database, 'SELECT id FROM memberships WHERE id = ?', membershipId).length ? 200 : 409 }
}

describe('recording a claim (A-130 criteria 2 and 5)', () => {
  test('two officers recording the same claim leave exactly one membership and one trail entry', async () => {
    await withDatabase(async (database) => {
      seed(database)
      claim(database, { id: 'c-1' })

      const answers = await race(2, async index => attemptRecord(database, index))
      expect(answers.map(answer => answer.status).sort()).toEqual([200, 409])

      expect(rows(database, `SELECT id FROM memberships WHERE user_id = 'u1'`)).toHaveLength(1)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'membership.claim.recorded'`)).toHaveLength(1)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'membership.granted'`)).toHaveLength(1)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'account.student-id.recorded'`)).toHaveLength(1)

      const [held] = rows<{ status: string, decidedBy: string | null }>(
        database, `SELECT status, decided_by AS decidedBy FROM membership_claims WHERE id = 'c-1'`)
      expect(held).toEqual({ status: 'RECORDED', decidedBy: 'officer' })
    })
  })

  test('the membership is the claim, verbatim: manual, evidenced by the claim, and the number lands on the account', async () => {
    await withDatabase((database) => {
      seed(database)
      claim(database, { id: 'c-1', term: 3, starts_on: '2026-09-14' })
      expect(attemptRecord(database, 0).status).toBe(200)

      const [membership] = rows<Record<string, unknown>>(database, `SELECT * FROM memberships WHERE id = 'm-0'`)
      expect(membership).toMatchObject({
        user_id: 'u1',
        starts_on: '2026-09-14',
        source: 'MANUAL',
        evidence: 'claim c-1',
        granted_by: 'officer',
      })
      expect(rows<{ studentId: string | null }>(database, `SELECT student_id AS studentId FROM users WHERE id = 'u1'`)[0]!.studentId)
        .toBe('20123456')
    })
  })

  // Criterion 5: the trail names the claim and never the number or the reason (0011).
  test('the trail carries the claim id and never the student number', async () => {
    await withDatabase((database) => {
      seed(database)
      claim(database, { id: 'c-1' })
      expect(attemptRecord(database, 0).status).toBe(200)
      const details = rows<{ detail: string, target: string }>(database, `SELECT detail, target FROM audit_log`)
      expect(details.length).toBeGreaterThan(0)
      for (const row of details) {
        expect(`${row.target} ${row.detail}`).not.toContain('20123456')
      }
      expect(details.some(row => row.detail.includes('"claim":"c-1"'))).toBe(true)
    })
  })
})

function attemptDecline(database: TestDatabase, reason: string, at: number): void {
  run(database, declineClaimStatements({
    claimId: 'c-1',
    reason,
    actorId: 'officer',
    now: at,
    entry: auditEntry({ actorId: 'officer', action: 'membership.claim.declined', target: 'claim:c-1', detail: { claim: 'c-1' } }),
  }))
}

describe('declining a claim (A-130 criteria 3 and 5)', () => {
  test('the reason lands on the claim for the member, and the trail carries only the id', async () => {
    await withDatabase((database) => {
      seed(database)
      claim(database, { id: 'c-1' })
      attemptDecline(database, 'Not on the SU list under that number', 1_790_000_000)

      const [held] = rows<{ status: string, reason: string, decidedBy: string }>(
        database, `SELECT status, reason, decided_by AS decidedBy FROM membership_claims WHERE id = 'c-1'`)
      expect(held).toEqual({ status: 'DECLINED', reason: 'Not on the SU list under that number', decidedBy: 'officer' })

      const trail = rows<{ detail: string }>(database, `SELECT detail FROM audit_log WHERE action = 'membership.claim.declined'`)
      expect(trail).toHaveLength(1)
      expect(trail[0]!.detail).not.toContain('SU list')
      expect(rows(database, `SELECT id FROM memberships`)).toHaveLength(0)
    })
  })

  test('a second decision writes nothing: the first reason and the first entry stand', async () => {
    await withDatabase((database) => {
      seed(database)
      claim(database, { id: 'c-1' })
      attemptDecline(database, 'First answer', 1_790_000_000)
      attemptDecline(database, 'Second answer', 1_790_000_001)
      expect(attemptRecord(database, 0).status).toBe(409)

      expect(rows<{ reason: string }>(database, `SELECT reason FROM membership_claims WHERE id = 'c-1'`)[0]!.reason).toBe('First answer')
      expect(rows(database, `SELECT id FROM audit_log WHERE action LIKE 'membership.claim.%'`)).toHaveLength(1)
    })
  })
})

// Criterion 6, and the tests the registry's own suite runs for every table besides.
describe('erasure anonymises claims (A-130 criterion 6, 0011)', () => {
  const erase = (database: TestDatabase, at: number): void =>
    database.batch(erasureStatements('u1', at).map(statement => boundStatement(database, statement)))

  test('the number and the reason go, the claim and its outcome stay', async () => {
    await withDatabase((database) => {
      seed(database)
      claim(database, { id: 'c-1', status: 'DECLINED', reason: 'Wrong number for A Member' })
      erase(database, 1_790_000_000)

      const [held] = rows<Record<string, unknown>>(database, `SELECT * FROM membership_claims WHERE id = 'c-1'`)
      expect(held).toMatchObject({ user_id: 'u1', status: 'DECLINED', term: 1, starts_on: '2026-09-14', reason: null })
      expect(held!.student_id).not.toBe('20123456')
      expect(String(held!.student_id ?? '')).not.toContain('20123456')
    })
  })

  test('erasing twice changes nothing the second time', async () => {
    await withDatabase((database) => {
      seed(database)
      claim(database, { id: 'c-1' })
      erase(database, 1_790_000_000)
      const once = JSON.stringify(rows(database, `SELECT * FROM membership_claims WHERE id = 'c-1'`))
      expect(() => erase(database, 1_790_000_100)).not.toThrow()
      expect(JSON.stringify(rows(database, `SELECT * FROM membership_claims WHERE id = 'c-1'`))).toBe(once)
    })
  })
})
