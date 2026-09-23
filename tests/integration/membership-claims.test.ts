import { describe, expect, test } from 'bun:test'
import { auditEntry } from '#shared/utils/audit'
import { erasureStatements } from '#shared/utils/erasure'
import { endOfTerm } from '#shared/utils/membership'
import { claimsDecidersStatement, declineClaimStatements, grantMembershipStatements, waitingClaimsStatement, recordClaimStatements, recordStudentId, studentIdConstraintRefusal } from '#shared/utils/membership-claims'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { expectOneWinner, race } from '#tests/helpers/race'
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
interface Attempt { claimId?: string, userId?: string, studentId?: string, held?: string | null }

function attemptRecord(database: TestDatabase, index: number, attempt: Attempt = {}): { status: number, says?: string } {
  const { claimId = 'c-1', userId = 'u1', studentId = '20123456', held = null } = attempt
  const membershipId = `m-${index}`
  const expiresOn = endOfTerm('2026-09-14', 1)
  const entries = {
    granted: auditEntry({ actorId: 'officer', action: 'membership.granted', target: `user:${userId}`, detail: { membership: membershipId, years: 1, expiresOn } }),
    recorded: auditEntry({ actorId: 'officer', action: 'membership.claim.recorded', target: `claim:${claimId}`, detail: { claim: claimId, membership: membershipId } }),
  }
  try {
    run(database, recordClaimStatements({
      claimId,
      userId,
      studentId,
      held,
      membership: { id: membershipId, startsOn: '2026-09-14', expiresOn },
      actorId: 'officer',
      now: 1_790_000_000 + index,
      entries,
    }))
  }
  catch (error) {
    // The route's own mapping: a clash on the number is a 409 that says so, anything else a defect.
    const refusal = studentIdConstraintRefusal(error)
    return refusal ? { status: refusal.statusCode, says: refusal.statusMessage } : { status: 500 }
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

  // An erasure that lands between the officer's read and the batch: nothing may attach a
  // membership to a tombstone, however open the claim still reads (0011).
  test('a claim whose person was erased in the meantime records nothing', async () => {
    await withDatabase((database) => {
      seed(database)
      claim(database, { id: 'c-1' })
      database.batch(erasureStatements('u1', 1_790_000_000).map(statement => boundStatement(database, statement)))

      expect(attemptRecord(database, 0).status).toBe(409)
      expect(rows(database, `SELECT id FROM memberships`)).toHaveLength(0)
      expect(rows(database, `SELECT id FROM audit_log WHERE action LIKE 'membership.%'`)).toHaveLength(0)
      expect(rows<{ status: string }>(database, `SELECT status FROM membership_claims WHERE id = 'c-1'`)[0]!.status).toBe('OPEN')
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

// One rule for the number, batch-shaped, used by both write paths (A-117, A-130 criterion 2): the
// users_student_id index is the check, so a clash fails the whole batch it rides in (0006, 0047).
describe('the student number rides in the same batch as the membership (issue 1005)', () => {
  const grant = (database: TestDatabase, userId: string, studentId: string | undefined, held: string | null = null): { status: number, says?: string } => {
    try {
      run(database, grantMembershipStatements({
        id: `m-${userId}`,
        userId,
        startsOn: '2026-09-14',
        years: 1,
        evidence: null,
        actorId: 'officer',
        now: 1_790_000_000,
        studentId,
        held,
      }))
      return { status: 200 }
    }
    catch (error) {
      const refusal = studentIdConstraintRefusal(error)
      return refusal ? { status: refusal.statusCode, says: refusal.statusMessage } : { status: 500 }
    }
  }

  test('a number the account already holds writes nothing to it and nothing to the trail', () => {
    expect(recordStudentId({ userId: 'u1', studentId: '20123456', held: '20123456', actorId: 'officer', now: 1 })).toEqual([])
  })

  test('recording one writes the membership, its entry, the number and its entry together', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(grant(database, 'u1', '20123456').status).toBe(200)
      expect(rows(database, `SELECT id FROM memberships WHERE user_id = 'u1'`)).toHaveLength(1)
      expect(rows<{ studentId: string }>(database, `SELECT student_id AS studentId FROM users WHERE id = 'u1'`)[0]!.studentId).toBe('20123456')
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'account.student-id.recorded'`)).toHaveLength(1)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'membership.granted'`)).toHaveLength(1)
    })
  })

  test('recording one with a number another account holds writes no membership at all', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([[`UPDATE users SET student_id = '20123456' WHERE id = 'u2'`]])

      expect(grant(database, 'u1', '20123456')).toEqual({ status: 409, says: 'Another account already holds that student number' })
      expect(rows(database, `SELECT id FROM memberships`)).toHaveLength(0)
      expect(rows(database, `SELECT id FROM audit_log`)).toHaveLength(0)
    })
  })

  test('recording a claim whose number another account holds leaves the claim open and nothing written', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([[`UPDATE users SET student_id = '20123456' WHERE id = 'u2'`]])
      claim(database, { id: 'c-1' })

      expect(attemptRecord(database, 0)).toEqual({ status: 409, says: 'Another account already holds that student number' })
      expect(rows(database, `SELECT id FROM memberships`)).toHaveLength(0)
      expect(rows(database, `SELECT id FROM audit_log`)).toHaveLength(0)
      expect(rows<{ status: string }>(database, `SELECT status FROM membership_claims WHERE id = 'c-1'`)[0]!.status).toBe('OPEN')
    })
  })

  // Two people claiming one number, recorded by two officers at once: the index lets one through.
  test('two claims for the same number on two accounts, recorded at once, settle to one membership', async () => {
    await withDatabase(async (database) => {
      seed(database)
      claim(database, { id: 'c-1', user_id: 'u1' })
      claim(database, { id: 'c-2', user_id: 'u2' })

      const answers = await race(2, async index => attemptRecord(database, index, index === 0
        ? { claimId: 'c-1', userId: 'u1' }
        : { claimId: 'c-2', userId: 'u2' }))
      expectOneWinner(answers)

      expect(rows(database, `SELECT id FROM memberships`)).toHaveLength(1)
      expect(rows(database, `SELECT id FROM users WHERE student_id = '20123456'`)).toHaveLength(1)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'account.student-id.recorded'`)).toHaveLength(1)
      expect(rows(database, `SELECT id FROM membership_claims WHERE status = 'OPEN'`)).toHaveLength(1)
    })
  })
})

// Who is told that claims wait, and what they are told (A-130 criterion 12): every live holder
// of members.write, and only while a claim is open on a person who still exists.
describe('the waiting claims notice (issue 1005)', () => {
  const now = 1_790_000_000
  const read = <T>(database: TestDatabase, statement: ReturnType<typeof waitingClaimsStatement>): T[] => {
    const [text, ...parameters] = boundStatement(database, statement)
    return rows<T>(database, text, ...parameters)
  }

  test('the count is open claims on living accounts, and the oldest is when the first was made', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([['INSERT INTO users (id, email, name, verified, anonymised_at) VALUES (?, ?, ?, 1, 1)', 'gone', 'gone@example.invalid', 'Gone']])
      claim(database, { id: 'c-1', user_id: 'u1', created_at: 1_780_000_500 })
      claim(database, { id: 'c-2', user_id: 'u2', created_at: 1_780_000_100 })
      claim(database, { id: 'c-3', user_id: 'officer', status: 'DECLINED', created_at: 1_780_000_000 })
      claim(database, { id: 'c-4', user_id: 'gone', created_at: 1_780_000_050 })

      expect(read<{ waiting: number, oldest: number | null }>(database, waitingClaimsStatement())).toEqual([{ waiting: 2, oldest: 1_780_000_100 }])
    })
  })

  test('nothing open reads as none, so the sweep sends nothing', async () => {
    await withDatabase((database) => {
      seed(database)
      claim(database, { id: 'c-1', status: 'RECORDED' })
      expect(read<{ waiting: number }>(database, waitingClaimsStatement())[0]!.waiting).toBe(0)
    })
  })

  test('the deciders are live holders of members.write on reachable accounts, each once', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'lapsed', 'lapsed@example.invalid', 'Lapsed'],
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 0)', 'unverified', 'unverified@example.invalid', 'Unverified'],
        ['INSERT INTO users (id, email, name, verified, disabled) VALUES (?, ?, ?, 1, 1)', 'disabled', 'disabled@example.invalid', 'Disabled'],
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'reader', 'reader@example.invalid', 'Reader'],
        ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g1', 'officer', 'MANAGER', now + 86_400],
        ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g2', 'officer', 'ADMIN', null],
        ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g3', 'lapsed', 'MANAGER', now - 1],
        ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g4', 'unverified', 'MANAGER', null],
        ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g5', 'disabled', 'MANAGER', null],
        ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g6', 'reader', 'THEATRE_MANAGER', null],
      ])

      expect(read<{ id: string }>(database, claimsDecidersStatement(now)).map(row => row.id)).toEqual(['officer'])
    })
  })
})
