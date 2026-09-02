import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { londonParts } from '#shared/utils/london'
import { adminSession, markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-115 and G-116. Opening the register is what freezes a session, and marking it is the single
// act that awards: there is no other path from attending to holding.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
let cookie = ''
let department = ''

const password = generatePassword()
const trainer = { ...syntheticPerson(37), email: registrableAddress('register-trainer') }
let trainerId = ''
let trainerCookie = ''
let trainerCert = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie

  await send('POST', '/api/auth/register', { email: trainer.email, name: trainer.name, password }, '')
  markVerified(app, trainer.email)
  trainerId = read<{ id: string }>('SELECT id FROM users WHERE email = ?', trainer.email)!.id
  const signedIn = await send('POST', '/api/auth/sign-in', { email: trainer.email, password }, '')
  trainerCookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!

  department = `REG${suffix()}`
  const made = await send('POST', '/api/admin/training/departments', { code: department, name: 'Registers' })
  expect(made.status).toBe(200)

  trainerCert = await addModule({ kind: 'CERTIFICATION', grantsTrainer: true, signoffRequired: true })
  award(trainerId, trainerCert)
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
  const id = `REG-${suffix()}`
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

function award(userId: string, moduleId: string): string {
  const id = `tr-${crypto.randomUUID().slice(0, 8)}`
  write(
    `INSERT INTO training_records (id, user_id, module_id, awarded_on, source) VALUES (?, ?, ?, ?, 'SIGNOFF')`,
    id, userId, moduleId, daysFrom(-30),
  )
  return id
}

// A session held today, so its register is openable, with the trainer able to teach it.
async function sessionToday(moduleIds: string[]): Promise<string> {
  for (const moduleId of moduleIds) award(trainerId, moduleId)
  const answered = await send('POST', '/api/admin/training/sessions', {
    heldOn: daysFrom(7),
    startsAt: '19:00',
    endsAt: '21:00',
    capacity: 20,
    moduleIds,
  }, trainerCookie)
  expect(answered.status).toBe(200)
  const { id } = await answered.json() as { id: string }

  // Held today, written directly: the write path refuses a past or present date at scheduling,
  // which is G-112's rule, and this suite is about what happens on the day.
  write('UPDATE training_sessions SET held_on = ? WHERE id = ?', daysFrom(0), id)
  return id
}

function signUp(sessionId: string, userId: string, at: number): void {
  write(
    `INSERT INTO session_attendees (id, session_id, user_id, signed_up_at) VALUES (?, ?, ?, ?)`,
    `a-${crypto.randomUUID().slice(0, 8)}`, sessionId, userId, at,
  )
}

const openRegister = (sessionId: string, as = trainerCookie): Promise<Response> =>
  send('POST', `/api/admin/training/sessions/${sessionId}/open-register`, {}, as)

const mark = (sessionId: string, body: unknown, as = trainerCookie): Promise<Response> =>
  send('POST', `/api/admin/training/sessions/${sessionId}/mark`, body, as)

const said = async (answered: Response): Promise<string> =>
  (await answered.json() as { statusMessage?: string }).statusMessage ?? ''

const recordsFor = (sessionId: string): number =>
  read<{ n: number }>('SELECT count(*) n FROM training_records WHERE session_id = ?', sessionId)?.n ?? 0

describe.skipIf(skip !== null)('a register opens on the day (G-115 criterion 1)', () => {
  test('a session in the future cannot have its register opened', async () => {
    const module = await addModule()
    award(trainerId, module)
    const answered = await send('POST', '/api/admin/training/sessions', {
      heldOn: daysFrom(7),
      startsAt: '19:00',
      endsAt: '21:00',
      capacity: 20,
      moduleIds: [module],
    }, trainerCookie)
    const { id } = await answered.json() as { id: string }

    const refused = await openRegister(id)
    expect(refused.status).toBe(422)
    expect(await said(refused)).toContain('opens on the day')
  })

  test('opening it on the day stamps who opened it', async () => {
    const session = await sessionToday([await addModule()])
    expect((await openRegister(session)).status).toBe(200)

    const opened = read<{ at: number, by: string }>(
      'SELECT register_opened_at at, register_opened_by by FROM training_sessions WHERE id = ?', session,
    )
    expect(opened?.at).toBeGreaterThan(0)
    expect(opened?.by).toBe(trainerId)
  })

  test('opening it twice is idempotent, not an error', async () => {
    const session = await sessionToday([await addModule()])
    expect((await openRegister(session)).status).toBe(200)

    const again = await openRegister(session)
    expect(again.status).toBe(200)
    expect((await again.json() as { alreadyOpen: boolean }).alreadyOpen).toBe(true)
  })

  test('somebody else\'s register is not theirs to open', async () => {
    const session = await sessionToday([await addModule()])
    const other = await adminSession(app, { roles: [] })
    award(other.id, trainerCert)

    expect((await openRegister(session, other.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('opening freezes what the session teaches (G-115 criterion 2)', () => {
  test('the module set is refused once the register is open, and released deliberately', async () => {
    const first = await addModule()
    const second = await addModule()
    award(trainerId, second)
    const session = await sessionToday([first])
    await openRegister(session)

    const refused = await send('PUT', `/api/admin/training/sessions/${session}/modules`,
      { moduleIds: [second] }, trainerCookie)
    expect(refused.status).toBe(409)
    expect(await said(refused)).toContain('frozen')

    // Question 6's answer: the session's own trainer may release it while no marks exist.
    const released = await send('PUT', `/api/admin/training/sessions/${session}/modules`,
      { moduleIds: [second], releaseFreeze: true }, trainerCookie)
    expect(released.status).toBe(200)

    expect(read<{ n: number }>(
      'SELECT count(*) n FROM session_modules WHERE session_id = ? AND module_id = ?', session, second,
    )?.n).toBe(1)
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM audit_log WHERE action = 'register.freeze.released' AND target = ?`,
      `session:${session}`,
    )?.n).toBe(1)
  })
})

describe.skipIf(skip !== null)('marking is the single act that awards (G-116)', () => {
  test('a present mark awards one record per module, dated to the session day', async () => {
    const one = await addModule()
    const two = await addModule()
    award(trainerId, two)
    const session = await sessionToday([one, two])
    const member = await adminSession(app, { roles: [] })
    signUp(session, member.id, Math.floor(Date.now() / 1000))
    await openRegister(session)

    const answered = await mark(session, { marks: [{ userId: member.id, mark: 'ATTENDED' }] })
    expect(answered.status).toBe(200)
    expect((await answered.json() as { awarded: number }).awarded).toBe(2)

    const awarded = read<{ n: number, awardedOn: string }>(
      `SELECT count(*) n, max(awarded_on) awardedOn FROM training_records WHERE session_id = ?`, session,
    )
    expect(awarded?.n).toBe(2)
    // Criterion 5: the day of the session, never the day it was marked.
    expect(awarded?.awardedOn).toBe(daysFrom(0))
  })

  test('an absent mark awards nothing at all', async () => {
    const session = await sessionToday([await addModule()])
    const member = await adminSession(app, { roles: [] })
    signUp(session, member.id, Math.floor(Date.now() / 1000))
    await openRegister(session)

    expect((await mark(session, {
      marks: [{ userId: member.id, mark: 'ABSENT' }],
      confirmedAllAbsent: true,
    })).status).toBe(200)
    expect(recordsFor(session)).toBe(0)
  })

  // Criterion 1. The three ways a cover can fail, each named in the refusal.
  test('the register must be covered exactly', async () => {
    const session = await sessionToday([await addModule()])
    const one = await adminSession(app, { roles: [] })
    const two = await adminSession(app, { roles: [] })
    const now = Math.floor(Date.now() / 1000)
    signUp(session, one.id, now)
    signUp(session, two.id, now + 1)
    await openRegister(session)

    const skipped = await mark(session, { marks: [{ userId: one.id, mark: 'ATTENDED' }] })
    expect(skipped.status).toBe(422)
    expect(await said(skipped)).toContain('not marked')

    const stranger = await adminSession(app, { roles: [] })
    const extra = await mark(session, { marks: [
      { userId: one.id, mark: 'ATTENDED' },
      { userId: two.id, mark: 'ATTENDED' },
      { userId: stranger.id, mark: 'ATTENDED' },
    ] })
    expect(extra.status).toBe(422)
    expect(await said(extra)).toContain('not on this register')

    const twice = await mark(session, { marks: [
      { userId: one.id, mark: 'ATTENDED' },
      { userId: one.id, mark: 'ABSENT' },
    ] })
    expect(twice.status).toBe(422)
    expect(await said(twice)).toContain('marked twice')

    expect(recordsFor(session)).toBe(0)
  })

  // Criterion 2. Everybody absent is a real answer and a suspicious one.
  test('a wholly absent register needs its own confirmation', async () => {
    const session = await sessionToday([await addModule()])
    const member = await adminSession(app, { roles: [] })
    signUp(session, member.id, Math.floor(Date.now() / 1000))
    await openRegister(session)

    const refused = await mark(session, { marks: [{ userId: member.id, mark: 'ABSENT' }] })
    expect(refused.status).toBe(422)
    expect(await said(refused)).toContain('Nobody is marked present')

    expect((await mark(session, {
      marks: [{ userId: member.id, mark: 'ABSENT' }],
      confirmedAllAbsent: true,
    })).status).toBe(200)
  })

  // Criterion 4's named case, through the real routes rather than the harness.
  test('the second submission is refused and leaves no duplicate records', async () => {
    const session = await sessionToday([await addModule()])
    const member = await adminSession(app, { roles: [] })
    signUp(session, member.id, Math.floor(Date.now() / 1000))
    await openRegister(session)

    const body = { marks: [{ userId: member.id, mark: 'ATTENDED' }] }
    expect((await mark(session, body)).status).toBe(200)

    const second = await mark(session, body)
    expect(second.status).toBe(409)
    expect(recordsFor(session)).toBe(1)
  })

  test('a register cannot be marked before it is opened', async () => {
    const session = await sessionToday([await addModule()])
    const member = await adminSession(app, { roles: [] })
    signUp(session, member.id, Math.floor(Date.now() / 1000))

    const refused = await mark(session, { marks: [{ userId: member.id, mark: 'ATTENDED' }] })
    expect(refused.status).toBe(409)
    expect(recordsFor(session)).toBe(0)
  })

  // Criterion 5. A register marked weeks late still awards, dated to the day it was taught.
  test('an old register still awards, dated to the session day', async () => {
    const session = await sessionToday([await addModule()])
    const member = await adminSession(app, { roles: [] })
    signUp(session, member.id, Math.floor(Date.now() / 1000))
    write('UPDATE training_sessions SET held_on = ? WHERE id = ?', daysFrom(-30), session)
    await openRegister(session)

    expect((await mark(session, { marks: [{ userId: member.id, mark: 'ATTENDED' }] })).status).toBe(200)
    expect(read<{ awardedOn: string }>(
      'SELECT awarded_on awardedOn FROM training_records WHERE session_id = ?', session,
    )?.awardedOn).toBe(daysFrom(-30))
  })

  test('marking is on the trail, and the session reads as delivered', async () => {
    const session = await sessionToday([await addModule()])
    const member = await adminSession(app, { roles: [] })
    signUp(session, member.id, Math.floor(Date.now() / 1000))
    await openRegister(session)
    await mark(session, { marks: [{ userId: member.id, mark: 'ATTENDED' }] })

    expect(read<{ n: number }>(
      `SELECT count(*) n FROM audit_log WHERE action = 'register.marked' AND target = ?`, `session:${session}`,
    )?.n).toBe(1)
    expect(read<{ status: string }>(
      'SELECT status FROM training_sessions WHERE id = ?', session,
    )?.status).toBe('DELIVERED')
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
