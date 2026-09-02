import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { londonParts } from '#shared/utils/london'
import { adminSession, markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-113 and G-114. The two ways a session is put right: called off before it runs, and corrected
// after it was marked. Neither deletes anything, because the records are append-only (0010).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let cookie = ''
let department = ''

const password = generatePassword()
const trainer = { ...syntheticPerson(53), email: registrableAddress('fix-trainer') }
let trainerId = ''
let trainerCookie = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie

  await send('POST', '/api/auth/register', { email: trainer.email, name: trainer.name, password }, '')
  markVerified(app, trainer.email)
  trainerId = read<{ id: string }>('SELECT id FROM users WHERE email = ?', trainer.email)!.id
  const signedIn = await send('POST', '/api/auth/sign-in', { email: trainer.email, password }, '')
  trainerCookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!

  department = `FIX${suffix()}`
  expect((await send('POST', '/api/admin/training/departments', { code: department, name: 'Corrections' })).status).toBe(200)

  const cert = await addModule({ kind: 'CERTIFICATION', grantsTrainer: true, signoffRequired: true })
  award(trainerId, cert)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

const said = async (answered: Response): Promise<string> =>
  (await answered.json() as { statusMessage?: string }).statusMessage ?? ''

const suffix = (): string => crypto.randomUUID().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')

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

function daysFrom(days: number): string {
  const now = londonParts(new Date())
  return new Date(Date.UTC(now.year, now.month - 1, now.day + days)).toISOString().slice(0, 10)
}

async function addModule(over: Record<string, unknown> = {}): Promise<string> {
  const id = `FIX-${suffix()}`
  expect((await send('POST', '/api/admin/training/modules', {
    id,
    department,
    kind: 'MODULE',
    name: `Module ${id}`,
    status: 'ACTIVE',
    ...over,
  })).status).toBe(200)
  return id
}

function award(userId: string, moduleId: string): void {
  write(
    `INSERT INTO training_records (id, user_id, module_id, awarded_on, source, granted_by)
     VALUES (?, ?, ?, ?, 'SIGNOFF', ?)`,
    `rec-${crypto.randomUUID().slice(0, 8)}`, userId, moduleId, daysFrom(-30), userId,
  )
}

async function scheduled(moduleIds: string[]): Promise<string> {
  // A trainer may teach only what they hold, so they hold it first (G-112 criterion 3).
  for (const moduleId of moduleIds) award(trainerId, moduleId)
  const answered = await send('POST', '/api/admin/training/sessions', {
    heldOn: daysFrom(7),
    startsAt: '19:00',
    endsAt: '21:00',
    capacity: 20,
    moduleIds,
  }, trainerCookie)
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

// Held today, written directly: scheduling refuses a past day, and these cases are about the day.
async function today(moduleIds: string[]): Promise<string> {
  const id = await scheduled(moduleIds)
  write('UPDATE training_sessions SET held_on = ? WHERE id = ?', daysFrom(0), id)
  return id
}

function signUp(sessionId: string, userId: string, at: number): void {
  write(
    `INSERT INTO session_attendees (id, session_id, user_id, signed_up_at) VALUES (?, ?, ?, ?)`,
    `a-${crypto.randomUUID().slice(0, 8)}`, sessionId, userId, at,
  )
}

async function member(): Promise<{ id: string, cookie: string }> {
  return adminSession(app, { roles: [] })
}

const cancel = (sessionId: string, body: unknown, as = trainerCookie): Promise<Response> =>
  send('POST', `/api/admin/training/sessions/${sessionId}/cancel`, body, as)

const openRegister = (sessionId: string, as = trainerCookie): Promise<Response> =>
  send('POST', `/api/admin/training/sessions/${sessionId}/open-register`, {}, as)

const mark = (sessionId: string, body: unknown, as = trainerCookie): Promise<Response> =>
  send('POST', `/api/admin/training/sessions/${sessionId}/mark`, body, as)

const correct = (sessionId: string, body: unknown, as = trainerCookie): Promise<Response> =>
  send('POST', `/api/admin/training/sessions/${sessionId}/marks`, body, as)

describe.skipIf(skip !== null)('calling a session off (G-113)', () => {
  test('a cancellation carries a reason, and one without is refused', async () => {
    const session = await scheduled([await addModule()])

    expect((await cancel(session, {})).status).toBe(400)
    expect((await cancel(session, { reason: '   ' })).status).toBe(400)

    const answered = await cancel(session, { reason: 'The trainer is unwell.' })
    expect(answered.status).toBe(200)

    expect(read<{ status: string, reason: string }>(
      'SELECT status, cancel_reason reason FROM training_sessions WHERE id = ?', session,
    )).toMatchObject({ status: 'CANCELLED', reason: 'The trainer is unwell.' })
  }, CASE_TIMEOUT_MS)

  test('everybody signed up is told, whether they held a place or were waiting', async () => {
    const session = await scheduled([await addModule()])
    write('UPDATE training_sessions SET capacity = 1 WHERE id = ?', session)

    const placed = await member()
    const waiting = await member()
    signUp(session, placed.id, Math.floor(Date.now() / 1000) - 100)
    signUp(session, waiting.id, Math.floor(Date.now() / 1000))

    expect((await cancel(session, { reason: 'The room flooded.' })).status).toBe(200)

    const told = all<{ userId: string }>(
      `SELECT user_id userId FROM notification_log WHERE type = 'training.session.cancelled' AND session_id = ?`,
      session,
    ).map(row => row.userId)
    expect(told).toContain(placed.id)
    expect(told).toContain(waiting.id)
  }, CASE_TIMEOUT_MS)

  test('a cancelled session can never open its register, so it awards nothing', async () => {
    const session = await today([await addModule()])
    expect((await cancel(session, { reason: 'Nobody could make it.' })).status).toBe(200)

    const refused = await openRegister(session)
    expect(refused.status).toBe(409)
    expect(await said(refused)).toContain('cancelled')
    expect(all('SELECT id FROM training_records WHERE session_id = ?', session)).toHaveLength(0)
  }, CASE_TIMEOUT_MS)

  test('a register already open is corrected, not cancelled', async () => {
    const session = await today([await addModule()])
    expect((await openRegister(session)).status).toBe(200)

    const refused = await cancel(session, { reason: 'Too late for this.' })
    expect(refused.status).toBe(409)
    expect(await said(refused)).toMatch(/open|correct/i)
    expect(read<{ status: string }>('SELECT status FROM training_sessions WHERE id = ?', session)?.status)
      .not.toBe('CANCELLED')
  }, CASE_TIMEOUT_MS)

  test('cancelling twice is refused rather than telling everybody again', async () => {
    const session = await scheduled([await addModule()])
    expect((await cancel(session, { reason: 'Once.' })).status).toBe(200)
    expect((await cancel(session, { reason: 'Twice.' })).status).toBe(409)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('correcting a marked register (G-114)', () => {
  async function delivered(): Promise<{ session: string, module: string, stayed: { id: string }, dropped: { id: string } }> {
    const module = await addModule()
    const session = await today([module])
    const stayed = await member()
    const dropped = await member()
    signUp(session, stayed.id, Math.floor(Date.now() / 1000) - 100)
    signUp(session, dropped.id, Math.floor(Date.now() / 1000))

    expect((await openRegister(session)).status).toBe(200)
    expect((await mark(session, {
      marks: [
        { userId: stayed.id, mark: 'ATTENDED' },
        { userId: dropped.id, mark: 'ATTENDED' },
      ],
    })).status).toBe(200)

    return { session, module, stayed, dropped }
  }

  test('an edit revokes what was issued and re-issues the corrected set', async () => {
    const { session, module, stayed, dropped } = await delivered()

    expect((await correct(session, {
      marks: [
        { userId: stayed.id, mark: 'ATTENDED' },
        { userId: dropped.id, mark: 'ABSENT' },
      ],
    })).status).toBe(200)

    // Criterion 2. The one who stayed still holds it: never a moment with nothing.
    const live = all<{ userId: string }>(
      `SELECT user_id userId FROM training_records
       WHERE session_id = ? AND module_id = ? AND revoked_at IS NULL`, session, module,
    ).map(row => row.userId)
    expect(live).toEqual([stayed.id])

    // Nothing is deleted: what was awarded before is still there, revoked with a reason.
    const every = all<{ userId: string, revoked: number | null, reason: string | null }>(
      `SELECT user_id userId, revoked_at revoked, revoke_reason reason FROM training_records
       WHERE session_id = ? ORDER BY user_id`, session,
    )
    expect(every.filter(row => row.revoked !== null)).toHaveLength(2)
    expect(every.every(row => row.revoked === null || row.reason !== null)).toBe(true)
  }, CASE_TIMEOUT_MS)

  test('somebody dropped keeps their absence as evidence', async () => {
    const { session, dropped } = await delivered()

    expect((await correct(session, {
      marks: [{ userId: dropped.id, mark: 'ABSENT' }],
      // The one who stayed is still on the register, so the cover has to name them too.
    })).status).toBe(422)
  }, CASE_TIMEOUT_MS)

  test('a re-issued record keeps the day the session was held', async () => {
    const { session, stayed, dropped } = await delivered()
    const heldOn = read<{ heldOn: string }>('SELECT held_on heldOn FROM training_sessions WHERE id = ?', session)!.heldOn

    expect((await correct(session, {
      marks: [
        { userId: stayed.id, mark: 'ATTENDED' },
        { userId: dropped.id, mark: 'ABSENT' },
      ],
    })).status).toBe(200)

    const live = all<{ awardedOn: string }>(
      `SELECT awarded_on awardedOn FROM training_records WHERE session_id = ? AND revoked_at IS NULL`, session,
    )
    expect(live.every(row => row.awardedOn === heldOn)).toBe(true)
  }, CASE_TIMEOUT_MS)

  test('the dropped attendee is marked absent rather than removed', async () => {
    const { session, stayed, dropped } = await delivered()

    expect((await correct(session, {
      marks: [
        { userId: stayed.id, mark: 'ATTENDED' },
        { userId: dropped.id, mark: 'ABSENT' },
      ],
    })).status).toBe(200)

    expect(all<{ userId: string, status: string }>(
      `SELECT user_id userId, status FROM session_attendees WHERE session_id = ? ORDER BY signed_up_at`, session,
    )).toEqual([
      { userId: stayed.id, status: 'ATTENDED' },
      { userId: dropped.id, status: 'ABSENT' },
    ])
  }, CASE_TIMEOUT_MS)

  test('past the window it is revocation and a fresh grant, not an edit', async () => {
    const { session, stayed, dropped } = await delivered()
    write('UPDATE training_sessions SET held_on = ? WHERE id = ?', daysFrom(-40), session)

    const refused = await correct(session, {
      marks: [
        { userId: stayed.id, mark: 'ATTENDED' },
        { userId: dropped.id, mark: 'ABSENT' },
      ],
    })
    expect(refused.status).toBe(409)
    expect(await said(refused)).toMatch(/revok/i)
  }, CASE_TIMEOUT_MS)

  test('a register nobody has marked is not something to correct', async () => {
    const module = await addModule()
    const session = await today([module])
    const person = await member()
    signUp(session, person.id, Math.floor(Date.now() / 1000))
    expect((await openRegister(session)).status).toBe(200)

    const refused = await correct(session, { marks: [{ userId: person.id, mark: 'ATTENDED' }] })
    expect(refused.status).toBe(409)
  }, CASE_TIMEOUT_MS)

  test('the edit is audited with who, which session and what moved', async () => {
    const { session, stayed, dropped } = await delivered()

    expect((await correct(session, {
      marks: [
        { userId: stayed.id, mark: 'ATTENDED' },
        { userId: dropped.id, mark: 'ABSENT' },
      ],
    })).status).toBe(200)

    const entry = read<{ actor: string, detail: string }>(
      `SELECT actor_id actor, detail FROM audit_log WHERE action = 'register.corrected' AND target = ?`,
      `session:${session}`,
    )
    expect(entry?.actor).toBe(trainerId)
    const detail = JSON.parse(entry!.detail) as { present: number, absent: number, revoked: number }
    expect(detail).toMatchObject({ present: 1, absent: 1 })
    expect(detail.revoked).toBeGreaterThan(0)
  }, CASE_TIMEOUT_MS)

  test('an ordinary member cannot correct a register that is not theirs', async () => {
    const { session, stayed, dropped } = await delivered()
    const other = await member()

    expect((await correct(session, {
      marks: [
        { userId: stayed.id, mark: 'ATTENDED' },
        { userId: dropped.id, mark: 'ABSENT' },
      ],
    }, other.cookie)).status).toBe(403)
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
