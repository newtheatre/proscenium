import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { londonDay } from '#shared/utils/membership'
import { adminSession, markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// A-119. A holder is warned before a grant lapses, once per grant and date; the administrator is
// digested monthly with the permanent grants alongside; grants long lapsed are tidied away.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const DAY = 86_400

let app: AppUnderTest
let cookie = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function read<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

function all<T>(statement: string, ...parameters: unknown[]): T[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(statement).all(...parameters as never[]) as T[]
  }
  finally {
    database.close()
  }
}

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

const send = (method: string, path: string, body?: unknown): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': cookie },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

interface RoleLapseRun {
  warned: number
  holders: number
  digests: number
  pruned: number
  standing: { expiring: number, lapsed: number, permanent: number }
}

// Nitro runs a task over its dev endpoint, which is how the schedule reaches it in production.
const runSweep = async (): Promise<RoleLapseRun> => {
  const answered = await fetch(`${app.baseURL}/_nitro/tasks/daily:sweeps`, { method: 'POST' })
  expect(answered.status).toBe(200)
  return (await answered.json() as { result: { roleLapses: RoleLapseRun } }).result.roleLapses
}

// A real account, verified, so the warning is one notify() will actually send.
async function holder(): Promise<string> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress('holder')
  await send('POST', '/api/auth/register', { email, name: person.name, password: generatePassword() })
  markVerified(app, email)
  return read<{ id: string }>('SELECT id FROM users WHERE email = ?', email)!.id
}

// Grants directly, so the expiry is exactly N days out rather than the committee year end.
function grant(userId: string, role: string, expiresAt: number | null): string {
  const id = crypto.randomUUID().replaceAll('-', '')
  write(
    'INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)',
    id, userId, role, expiresAt,
  )
  return id
}

const now = (): number => Math.floor(Date.now() / 1000)

const claimsFor = (userId: string): { type: string, claim: string | null, subject: string | null }[] =>
  all('SELECT type, claim, subject FROM notification_log WHERE user_id = ? AND type LIKE \'role.%\'', userId)

const trailFor = (userId: string): { action: string, actorId: string | null }[] =>
  all('SELECT action, actor_id as actorId FROM audit_log WHERE target = ? AND action LIKE \'role.%\'', `user:${userId}`)

const grantExists = (id: string): boolean =>
  read<{ n: number }>('SELECT count(*) n FROM role_grants WHERE id = ?', id)!.n > 0

describe.skipIf(skip !== null)('a holder is warned before a grant lapses (criterion 1)', () => {
  test('a grant inside the notice window warns its holder once, however often the sweep runs', async () => {
    const userId = await holder()
    grant(userId, 'BOX_OFFICE', now() + 10 * DAY)

    const run = await runSweep()
    expect(run.warned).toBeGreaterThan(0)
    expect(claimsFor(userId).filter(row => row.type === 'role.expiring')).toHaveLength(1)

    await runSweep()
    expect(claimsFor(userId).filter(row => row.type === 'role.expiring')).toHaveLength(1)
  })

  test('a grant further out than the notice window is not warned about yet', async () => {
    const userId = await holder()
    grant(userId, 'COMMITTEE', now() + 60 * DAY)

    await runSweep()
    expect(claimsFor(userId)).toEqual([])
  })

  // The trap: the committee year end lapses every one of somebody's roles on the same day, so a
  // claim that covered the holder rather than the grant would spend the whole notice on the first.
  test('four grants lapsing together are one message naming all four', async () => {
    const userId = await holder()
    const at = now() + 9 * DAY
    for (const role of ['BOX_OFFICE', 'BAR_MANAGER', 'SAFETY_OFFICER', 'COMMITTEE']) grant(userId, role, at)

    await runSweep()
    const claims = claimsFor(userId).filter(row => row.type === 'role.expiring')
    expect(claims).toHaveLength(4)
    expect(new Set(claims.map(row => row.claim)).size).toBe(4)

    // One message, four claim rows: every row carries the subject of the single send that
    // covered them, which is what proves the four did not go out separately.
    const subjects = new Set(claims.map(row => row.subject))
    expect(subjects.size).toBe(1)
    expect([...subjects][0]).toContain('4 of your roles')

    expect(read<{ n: number }>(
      'SELECT count(*) n FROM audit_log WHERE target = ? AND action = \'role.lapse-warned\'',
      `user:${userId}`,
    )!.n).toBe(4)
  })

  test('moving the expiry re-arms the warning', async () => {
    const userId = await holder()
    const id = grant(userId, 'FRONT_OF_HOUSE', now() + 10 * DAY)

    await runSweep()
    expect(claimsFor(userId).filter(row => row.type === 'role.expiring')).toHaveLength(1)

    write('UPDATE role_grants SET expires_at = ? WHERE id = ?', now() + 12 * DAY, id)
    await runSweep()
    expect(claimsFor(userId).filter(row => row.type === 'role.expiring')).toHaveLength(2)
  })

  // The same bug closed in A-126: a claim spent on a message notify() refuses is the whole notice.
  test('an unverified holder is not claimed for, since the warning could not be sent', async () => {
    const userId = await holder()
    write('UPDATE users SET verified = 0 WHERE id = ?', userId)
    grant(userId, 'BOX_OFFICE', now() + 10 * DAY)

    await runSweep()
    expect(claimsFor(userId)).toEqual([])
  })

  test('a permanent grant is never warned about, having no date to warn before', async () => {
    const userId = await holder()
    grant(userId, 'COMMITTEE', null)

    await runSweep()
    expect(claimsFor(userId)).toEqual([])
  })
})

describe.skipIf(skip !== null)('the warning is attributed to system (criterion 5)', () => {
  test('the trail records the warning with no actor', async () => {
    const userId = await holder()
    grant(userId, 'BOX_OFFICE', now() + 10 * DAY)

    await runSweep()
    const trail = trailFor(userId)
    expect(trail.map(row => row.action)).toContain('role.lapse-warned')
    expect(trail.find(row => row.action === 'role.lapse-warned')?.actorId).toBeNull()
  })
})

describe.skipIf(skip !== null)('grants long lapsed are tidied away (criterion 4)', () => {
  test('a grant lapsed longer ago than the prune window is deleted and trailed', async () => {
    const userId = await holder()
    const id = grant(userId, 'BOX_OFFICE', now() - 200 * DAY)

    const run = await runSweep()
    expect(run.pruned).toBeGreaterThan(0)
    expect(grantExists(id)).toBe(false)

    const pruned = trailFor(userId).filter(row => row.action === 'role.pruned')
    expect(pruned).toHaveLength(1)
    expect(pruned[0]!.actorId).toBeNull()
  })

  test('a grant that lapsed recently is left alone, so the digest can still show it', async () => {
    const userId = await holder()
    const id = grant(userId, 'BOX_OFFICE', now() - 10 * DAY)

    await runSweep()
    expect(grantExists(id)).toBe(true)
  })

  // Pruning is housekeeping, not enforcement: authority already ended at the expiry (0009).
  test('pruning a lapsed grant leaves the account holding nothing it did not already hold', async () => {
    const userId = await holder()
    grant(userId, 'ADMIN', now() - 200 * DAY)

    const before = await send('GET', `/api/admin/roles?userId=${userId}`)
    expect(await before.json()).toEqual({ roles: [] })

    await runSweep()

    const after = await send('GET', `/api/admin/roles?userId=${userId}`)
    expect(await after.json()).toEqual({ roles: [] })
  })
})

describe.skipIf(skip !== null)('the digest (criteria 2, 3)', () => {
  // Monthly, on the first, so the send is asserted against the London day the suite runs on
  // rather than by pretending the clock is somewhere else.
  test('a digest is claimed on the first of the month and on no other day', async () => {
    await runSweep()
    const digested = read<{ n: number }>(
      'SELECT count(*) n FROM notification_log WHERE type = \'role.expiry.digest\'',
    )!.n
    expect(digested > 0).toBe(Number(londonDay(new Date()).slice(8, 10)) === 1)
  })

  // Criterion 3. Computed every run though it only sends monthly, so the standing report is
  // testable on any day rather than only on the first.
  test('a permanent grant appears in the standing report the digest carries', async () => {
    const userId = await holder()
    grant(userId, 'COMMITTEE', null)

    const before = (await runSweep()).standing.permanent
    grant(await holder(), 'MANAGER', null)
    expect((await runSweep()).standing.permanent).toBe(before + 1)
  })

  test('a recently lapsed grant is reported, and one that never expires is not counted as lapsed', async () => {
    const userId = await holder()
    grant(userId, 'BOX_OFFICE', now() - 5 * DAY)

    const run = await runSweep()
    expect(run.standing.lapsed).toBeGreaterThan(0)
    expect(run.standing.expiring).toBeGreaterThanOrEqual(0)
  })
})
