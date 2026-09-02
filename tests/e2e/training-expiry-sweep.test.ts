import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { londonParts } from '#shared/utils/london'
import { adminSession, markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-125. The sweep notices, it never enacts, and the ledger is what stops it repeating itself.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
let cookie = ''
let department = ''

const password = generatePassword()
const member = { ...syntheticPerson(83), email: registrableAddress('sweep-member') }
let memberId = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie

  await send('POST', '/api/auth/register', { email: member.email, name: member.name, password }, '')
  markVerified(app, member.email)
  memberId = read<{ id: string }>('SELECT id FROM users WHERE email = ?', member.email)!.id

  department = `SWP${suffix()}`
  const made = await send('POST', '/api/admin/training/departments', { code: department, name: 'Sweeping' })
  expect(`${made.status} ${await made.text()}`).toContain('200')
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

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

const send = (method: string, path: string, body?: unknown, as = cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

const suffix = (): string => crypto.randomUUID().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')

function daysFrom(days: number): string {
  const now = londonParts(new Date())
  return new Date(Date.UTC(now.year, now.month - 1, now.day + days)).toISOString().slice(0, 10)
}

async function addModule(over: Record<string, unknown> = {}): Promise<string> {
  const id = `SWP-${suffix()}`
  const answered = await send('POST', '/api/admin/training/modules', {
    id,
    department,
    kind: 'MODULE',
    name: `Module ${id}`,
    status: 'ACTIVE',
    ...over,
  })
  expect(answered.status).toBe(200)
  return id
}

function award(userId: string, moduleId: string, expiresOn: string | null): string {
  const id = `tr-${crypto.randomUUID().slice(0, 8)}`
  write(
    `INSERT INTO training_records (id, user_id, module_id, awarded_on, source, expires_on)
     VALUES (?, ?, ?, ?, 'SIGNOFF', ?)`,
    id, userId, moduleId, daysFrom(-400), expiresOn,
  )
  return id
}

interface SweepResult {
  armed: boolean
  window: number
  final: number
  digests: number
  pruned: number
  wouldSend: { userId: string, kind: string, moduleIds: string[] }[]
}

// Nitro runs a task over its dev endpoint, which is how the schedule reaches it in production.
const runSweep = async (): Promise<SweepResult> => {
  const answered = await fetch(`${app.baseURL}/_nitro/tasks/training:expiry-sweep`, { method: 'POST' })
  expect(answered.status).toBe(200)
  return (await answered.json() as { result: SweepResult }).result
}

const arm = (on: boolean): Promise<Response> =>
  send('PUT', '/api/admin/config/TRAINING_SWEEP_ARMED', { value: on })

const claimsFor = (recordId: string): number =>
  read<{ n: number }>('SELECT count(*) n FROM notification_log WHERE record_id = ?', recordId)?.n ?? 0

describe.skipIf(skip !== null)('the sweep ships disarmed (G-125 criterion 4)', () => {
  test('a disarmed run reports what it would send and writes no claim', async () => {
    const module = await addModule()
    const record = award(memberId, module, daysFrom(30))

    const run = await runSweep()
    expect(run.armed).toBe(false)
    expect(run.wouldSend.some(one => one.moduleIds.includes(module))).toBe(true)
    expect(claimsFor(record)).toBe(0)

    // Reporting twice is the same report, because reporting claims nothing.
    expect((await runSweep()).wouldSend.some(one => one.moduleIds.includes(module))).toBe(true)
  })
})

describe.skipIf(skip !== null)('armed, it warns once per record and window (criterion 1)', () => {
  test('the same record is warned about once, however many times the sweep runs', async () => {
    const module = await addModule()
    const record = award(memberId, module, daysFrom(30))
    await arm(true)

    try {
      const first = await runSweep()
      expect(first.armed).toBe(true)
      expect(first.window).toBeGreaterThan(0)
      const afterFirst = claimsFor(record)
      expect(afterFirst).toBeGreaterThan(0)

      await runSweep()
      expect(claimsFor(record)).toBe(afterFirst)
    }
    finally {
      await arm(false)
    }
  })

  // Criterion 1 again, and the reason the two claims are separate keys: a record inside both
  // windows is warned about twice, gently and then urgently.
  test('a record inside the final window carries both claims, not one', async () => {
    const module = await addModule()
    const record = award(memberId, module, daysFrom(7))
    await arm(true)

    try {
      await runSweep()
      const kinds = read<{ kinds: string }>(
        `SELECT group_concat(DISTINCT type) kinds FROM notification_log WHERE record_id = ?`, record,
      )?.kinds ?? ''
      expect(kinds).toContain('training.expiry.final')
      expect(kinds).toContain('training.expiry.window')
    }
    finally {
      await arm(false)
    }
  })

  test('a record with no expiry is never warned about, because never is not soon', async () => {
    const module = await addModule()
    const record = award(memberId, module, null)
    await arm(true)

    try {
      await runSweep()
      expect(claimsFor(record)).toBe(0)
    }
    finally {
      await arm(false)
    }
  })

  test('a brief is never warned about, because a brief never expires', async () => {
    const module = await addModule({ kind: 'BRIEF' })
    const record = award(memberId, module, daysFrom(10))
    await arm(true)

    try {
      await runSweep()
      expect(claimsFor(record)).toBe(0)
    }
    finally {
      await arm(false)
    }
  })

  test('a revoked record is never warned about', async () => {
    const module = await addModule()
    const record = award(memberId, module, daysFrom(20))
    write(
      `UPDATE training_records SET revoked_at = ?, revoked_by = ?, revoke_reason = ? WHERE id = ?`,
      Math.floor(Date.now() / 1000), memberId, 'Recorded in error', record,
    )
    await arm(true)

    try {
      await runSweep()
      expect(claimsFor(record)).toBe(0)
    }
    finally {
      await arm(false)
    }
  })
})

// Criterion 5, and the one worth a named test: the sweep is a reader. Expiry happens because the
// calendar moved, and a sweep that edited a record would be enacting rather than noticing.
describe.skipIf(skip !== null)('the sweep never changes a record (criterion 5)', () => {
  test('every training record is byte for byte what it was before the run', async () => {
    const module = await addModule()
    award(memberId, module, daysFrom(5))
    await arm(true)

    const fingerprint = (): string => read<{ f: string }>(
      `SELECT group_concat(id || ':' || awarded_on || ':' || coalesce(expires_on, '-')
        || ':' || coalesce(revoked_at, '-')) f FROM training_records ORDER BY id`,
    )?.f ?? ''

    try {
      const before = fingerprint()
      await runSweep()
      expect(fingerprint()).toBe(before)
    }
    finally {
      await arm(false)
    }
  })
})
