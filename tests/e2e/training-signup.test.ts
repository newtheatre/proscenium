import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { londonParts } from '#shared/utils/london'
import { promotionClaimFor } from '#shared/utils/training-signup'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import type { TestMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-105 and G-106. A place is derived from sign-up order against capacity: nothing stores one,
// nothing is ever refused for fullness, and a promotion is claimed before it is sent.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let cookie = ''
let department = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie

  department = `SGN${suffix()}`
  expect((await send('POST', '/api/admin/training/departments', { code: department, name: 'Sign-ups' })).status)
    .toBe(200)
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
  const id = `SGN-${suffix()}`
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

async function schedule(body: Record<string, unknown> = {}): Promise<string> {
  const answered = await send('POST', '/api/admin/training/sessions', {
    heldOn: daysFrom(7),
    startsAt: '19:00',
    endsAt: '21:00',
    capacity: 2,
    ...body,
  })
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

const member = async (): Promise<{ id: string, cookie: string }> => {
  const person = await adminSession(app, { roles: [] })
  return { id: person.id, cookie: person.cookie }
}

// An ordinary member with a password the browser can use: these screens are member-facing, so
// the case needs a real session in a view rather than a cookie handed round the side.
async function memberView(): Promise<{ person: TestMember, view: Bun.WebView }> {
  const password = generatePassword()
  const person = await registerMember(app, 'signup-member', password)

  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', person.email)
  await fill(view, 'form input[type="password"]', password)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`, 30_000)
  return { person, view }
}

interface Standing {
  ok: boolean
  joined: boolean
  position: number
  placed: boolean
  waitlistPosition: number | null
  warnings: { moduleId: string, requiresId: string, severity: string }[]
}

const signUp = (sessionId: string, as: string): Promise<Response> =>
  send('POST', `/api/training/sessions/${sessionId}/signup`, {}, as)

const withdraw = (sessionId: string, as: string): Promise<Response> =>
  send('DELETE', `/api/training/sessions/${sessionId}/signup`, undefined, as)

const said = async (answered: Response): Promise<string> =>
  (await answered.json() as { statusMessage?: string }).statusMessage ?? ''

function award(userId: string, moduleId: string, columns: Record<string, unknown> = {}): void {
  const values: Record<string, unknown> = {
    id: `tr-${crypto.randomUUID().slice(0, 8)}`,
    user_id: userId,
    module_id: moduleId,
    awarded_on: daysFrom(-1),
    source: 'SIGNOFF',
    ...columns,
  }
  const names = Object.keys(values)
  write(
    `INSERT INTO training_records (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  )
}

describe.skipIf(skip !== null)('a place is derived from the order (G-105 criteria 1 and 4)', () => {
  test('sign-up never refuses for fullness, and says exactly where you stand', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module], capacity: 2 })

    const standings: Standing[] = []
    for (let index = 0; index < 4; index++) {
      const person = await member()
      const answered = await signUp(session, person.cookie)
      expect(answered.status).toBe(200)
      standings.push(await answered.json() as Standing)
    }

    expect(standings.map(one => one.position)).toEqual([1, 2, 3, 4])
    expect(standings.map(one => one.placed)).toEqual([true, true, false, false])
    expect(standings.map(one => one.waitlistPosition)).toEqual([null, null, 1, 2])
  })

  // A member with no row of their own must read as no sign-up, not as position nought: the
  // listing would otherwise show every session as one they hold a place on.
  test('a member who has not signed up has no position at all', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module], capacity: 2 })
    const person = await member()

    const listing = await (await send('GET', '/api/training/sessions', undefined, person.cookie)).json() as
      { items: { id: string, myStatus: string | null, myPosition: number | null, placed: boolean }[] }
    const theirs = listing.items.find(one => one.id === session)

    expect(theirs?.myStatus).toBeNull()
    expect(theirs?.myPosition).toBeNull()
    expect(theirs?.placed).toBe(false)
  })

  test('nothing anywhere stores a place, a position or a waitlist row', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module], capacity: 1 })
    const person = await member()
    await signUp(session, person.cookie)

    const columns = read<{ names: string }>(
      `SELECT group_concat(name) names FROM pragma_table_info('session_attendees')`,
    )!.names
    expect(columns).not.toContain('position')
    expect(columns).not.toContain('waitlist')
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM sqlite_master WHERE type = 'table' AND name LIKE '%waitlist%'`,
    )?.n).toBe(0)
  })

  test('signing up twice changes nothing and still answers where you stand', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module], capacity: 5 })
    const person = await member()

    const first = await (await signUp(session, person.cookie)).json() as Standing
    const again = await (await signUp(session, person.cookie)).json() as Standing

    expect(first.joined).toBe(true)
    expect(again.joined).toBe(false)
    expect(again.position).toBe(first.position)
    expect(read<{ n: number }>(
      'SELECT count(*) n FROM session_attendees WHERE session_id = ?', session,
    )?.n).toBe(1)
  })

  test('the FULL badge is a label: it follows the count and nothing reads it to refuse', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module], capacity: 1 })
    const first = await member()
    const second = await member()

    await signUp(session, first.cookie)
    expect(read<{ status: string }>('SELECT status FROM training_sessions WHERE id = ?', session)?.status)
      .toBe('FULL')

    // A session badged full still takes a sign-up, which is the whole of criterion 1.
    const answered = await signUp(session, second.cookie)
    expect(answered.status).toBe(200)
    expect((await answered.json() as Standing).waitlistPosition).toBe(1)
  })
})

describe.skipIf(skip !== null)('withdrawing and re-joining (G-105 criterion 2)', () => {
  test('re-joining puts you at the back, and the row is never deleted', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module], capacity: 2 })
    const first = await member()
    const second = await member()
    const third = await member()

    await signUp(session, first.cookie)
    await signUp(session, second.cookie)
    await signUp(session, third.cookie)

    expect((await withdraw(session, first.cookie)).status).toBe(200)
    // Never deleted: the row is the evidence they were here, and the register marks on it.
    expect(read<{ status: string }>(
      'SELECT status FROM session_attendees WHERE session_id = ? AND user_id = ?', session, first.id,
    )?.status).toBe('CANCELLED')

    const back = await (await signUp(session, first.cookie)).json() as Standing
    expect(back.position).toBe(3)
    expect(back.placed).toBe(false)
    expect(back.waitlistPosition).toBe(1)
  })

  test('withdrawing when you were never on the list is not an error', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module] })
    const person = await member()

    const answered = await withdraw(session, person.cookie)
    expect(answered.status).toBe(200)
    expect(await answered.json()).toMatchObject({ withdrawn: 0 })
  })
})

describe.skipIf(skip !== null)('prerequisites block or warn (G-105 criteria 3 and 6)', () => {
  test('a safety-critical gap refuses with a 422 naming the missing modules', async () => {
    const needed = await addModule({ name: 'Ladder safety' })
    const taught = await addModule({ safetyCritical: true })
    expect((await send('POST', `/api/admin/training/modules/${taught}/prerequisites`, { requiresId: needed })).status)
      .toBe(200)

    const session = await schedule({ moduleIds: [taught] })
    const person = await member()

    const refused = await signUp(session, person.cookie)
    expect(refused.status).toBe(422)
    expect(await said(refused)).toContain(needed)
    expect(read<{ n: number }>(
      'SELECT count(*) n FROM session_attendees WHERE session_id = ?', session,
    )?.n).toBe(0)
  })

  test('an ordinary module\'s gap warns and lets you in', async () => {
    const needed = await addModule({ name: 'Lighting basics' })
    const taught = await addModule()
    await send('POST', `/api/admin/training/modules/${taught}/prerequisites`, { requiresId: needed })

    const session = await schedule({ moduleIds: [taught] })
    const person = await member()

    const answered = await signUp(session, person.cookie)
    expect(answered.status).toBe(200)
    const standing = await answered.json() as Standing
    expect(standing.placed).toBe(true)
    expect(standing.warnings.map(warning => warning.requiresId)).toEqual([needed])
  })

  // Criterion 6, on both halves of criterion 3.
  test('an expiring record counts as held, so it neither blocks nor warns', async () => {
    const needed = await addModule()
    const safety = await addModule({ safetyCritical: true })
    const ordinary = await addModule()
    await send('POST', `/api/admin/training/modules/${safety}/prerequisites`, { requiresId: needed })
    await send('POST', `/api/admin/training/modules/${ordinary}/prerequisites`, { requiresId: needed })

    const session = await schedule({ moduleIds: [safety, ordinary] })
    const person = await member()
    award(person.id, needed, { expires_on: daysFrom(3) })

    const answered = await signUp(session, person.cookie)
    expect(answered.status).toBe(200)
    expect((await answered.json() as Standing).warnings).toEqual([])
  })

  test('an expired record does not count, and the safety-critical module refuses', async () => {
    const needed = await addModule()
    const taught = await addModule({ safetyCritical: true })
    await send('POST', `/api/admin/training/modules/${taught}/prerequisites`, { requiresId: needed })

    const session = await schedule({ moduleIds: [taught] })
    const person = await member()
    award(person.id, needed, { awarded_on: '2024-01-01', expires_on: '2025-01-01' })

    expect((await signUp(session, person.cookie)).status).toBe(422)
  })

  test('a brief gates nothing, so it never blocks anybody', async () => {
    const brief = await addModule({ kind: 'BRIEF', name: 'Get-in brief' })
    const taught = await addModule({ safetyCritical: true })
    await send('POST', `/api/admin/training/modules/${taught}/prerequisites`, { requiresId: brief })

    const session = await schedule({ moduleIds: [taught] })
    const person = await member()

    expect((await signUp(session, person.cookie)).status).toBe(200)
  })
})

describe.skipIf(skip !== null)('sign-up closes, and withdrawal does not (criterion 5)', () => {
  test('a session whose day has arrived takes no sign-up', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module] })
    write('UPDATE training_sessions SET held_on = ? WHERE id = ?', daysFrom(0), session)

    const person = await member()
    const refused = await signUp(session, person.cookie)
    expect(refused.status).toBe(409)
    expect(await said(refused)).toContain('day arrived')
  })

  test('the configured close shuts it before the day does', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module] })
    const person = await member()
    expect((await signUp(session, person.cookie)).status).toBe(200)

    // A close counted back a fortnight reaches a session a week away.
    expect((await send('PUT', '/api/admin/config/SESSION_SIGNUP_CLOSES_HOURS', { value: 336 })).status).toBe(200)
    try {
      const other = await member()
      const refused = await signUp(session, other.cookie)
      expect(refused.status).toBe(409)
      expect(await said(refused)).toContain('knows their numbers')

      // Withdrawal stays open, because somebody who cannot come must always be able to say so.
      expect((await withdraw(session, person.cookie)).status).toBe(200)
    }
    finally {
      await send('PUT', '/api/admin/config/SESSION_SIGNUP_CLOSES_HOURS', { value: 24 })
    }
  })

  // Criterion 5's first condition, and the one that beats both dates.
  test('an open register closes sign-up and leaves withdrawal open', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module], capacity: 4 })
    const person = await member()
    const other = await member()
    expect((await signUp(session, person.cookie)).status).toBe(200)

    write('UPDATE training_sessions SET register_opened_at = ? WHERE id = ?', Math.floor(Date.now() / 1000), session)

    const refused = await signUp(session, other.cookie)
    expect(refused.status).toBe(409)
    expect(await said(refused)).toContain('register is open')

    expect((await withdraw(session, person.cookie)).status).toBe(200)
    expect(read<{ status: string }>(
      'SELECT status FROM session_attendees WHERE session_id = ? AND user_id = ?', session, person.id,
    )?.status).toBe('CANCELLED')
  })

  test('a session not yet open to members takes none either', async () => {
    const module = await addModule()
    const session = await schedule({
      moduleIds: [module],
      opensAt: Math.floor(Date.now() / 1000) + 86_400,
    })
    const person = await member()

    const refused = await signUp(session, person.cookie)
    expect(refused.status).toBe(409)
    expect(read<{ n: number }>('SELECT count(*) n FROM session_attendees WHERE session_id = ?', session)?.n).toBe(0)
  })

  test('a cancelled session takes none, and a member still sees nothing of it', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module] })
    write(`UPDATE training_sessions SET status = 'CANCELLED' WHERE id = ?`, session)

    const person = await member()
    expect((await signUp(session, person.cookie)).status).toBe(409)

    const listing = await (await send('GET', '/api/training/sessions', undefined, person.cookie)).json() as
      { items: { id: string }[] }
    expect(listing.items.map(one => one.id)).not.toContain(session)
  })
})

describe.skipIf(skip !== null)('a promotion is told once (G-106)', () => {
  test('a withdrawal promotes the next in line and emails them, claimed on the ledger', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module], capacity: 1 })
    const placed = await member()
    const waiting = await member()

    await signUp(session, placed.cookie)
    const standing = await (await signUp(session, waiting.cookie)).json() as Standing
    expect(standing.placed).toBe(false)

    const answered = await withdraw(session, placed.cookie)
    expect(await answered.json()).toMatchObject({ withdrawn: 1, promoted: 1 })

    const signedUpAt = read<{ at: number }>(
      'SELECT signed_up_at at FROM session_attendees WHERE session_id = ? AND user_id = ?', session, waiting.id,
    )!.at
    expect(read<{ n: number }>(
      'SELECT count(*) n FROM notification_log WHERE claim = ?',
      promotionClaimFor(session, waiting.id, signedUpAt),
    )?.n).toBe(1)

    // Criterion 4: the row names its session, so a run reads back off the ledger.
    expect(read<{ session: string }>(
      `SELECT session_id session FROM notification_log
       WHERE type = 'training.session.promoted' AND user_id = ?`, waiting.id,
    )?.session).toBe(session)
  })

  test('nobody who already held a place is told they have been promoted', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module], capacity: 3 })
    const first = await member()
    const second = await member()
    const third = await member()

    await signUp(session, first.cookie)
    await signUp(session, second.cookie)
    await signUp(session, third.cookie)
    await withdraw(session, first.cookie)

    expect(read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE type = 'training.session.promoted' AND session_id = ?`,
      session,
    )?.n).toBe(0)
  })

  test('a second withdrawal never repeats the first promotion (criterion 2)', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module], capacity: 2 })
    const first = await member()
    const second = await member()
    const waiting = await member()

    await signUp(session, first.cookie)
    await signUp(session, second.cookie)
    await signUp(session, waiting.cookie)

    await withdraw(session, first.cookie)
    await withdraw(session, second.cookie)

    // Claims, not log rows: a send writes an outcome row of its own alongside the claim.
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM notification_log
       WHERE type = 'training.session.promoted' AND user_id = ? AND claim IS NOT NULL`, waiting.id,
    )?.n).toBe(1)
  })

  test('re-joining and being promoted again does send, because it is a new sign-up', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module], capacity: 1 })
    const holder = await member()
    const other = await member()

    await signUp(session, holder.cookie)
    await signUp(session, other.cookie)
    await withdraw(session, holder.cookie)
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM notification_log
       WHERE type = 'training.session.promoted' AND user_id = ? AND claim IS NOT NULL`,
      other.id,
    )?.n).toBe(1)

    // Out and back in, then promoted a second time.
    await withdraw(session, other.cookie)
    await signUp(session, holder.cookie)
    await signUp(session, other.cookie)
    await withdraw(session, holder.cookie)

    expect(read<{ n: number }>(
      `SELECT count(*) n FROM notification_log
       WHERE type = 'training.session.promoted' AND user_id = ? AND claim IS NOT NULL`,
      other.id,
    )?.n).toBe(2)
  })

  // Criterion 1's other half, and the badge that would otherwise stay stale.
  test('a capacity rise promotes, tells them, and heals the full badge', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module], capacity: 1 })
    const placed = await member()
    const waiting = await member()

    await signUp(session, placed.cookie)
    await signUp(session, waiting.cookie)
    expect(read<{ status: string }>('SELECT status FROM training_sessions WHERE id = ?', session)?.status)
      .toBe('FULL')

    const answered = await send('POST', `/api/admin/training/sessions/${session}/capacity`, { capacity: 4 })
    expect(answered.status).toBe(200)
    expect(await answered.json()).toMatchObject({ capacity: 4, promoted: 1 })

    expect(read<{ status: string }>('SELECT status FROM training_sessions WHERE id = ?', session)?.status)
      .toBe('OPEN')
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM audit_log WHERE action = 'session.capacity.changed' AND target = ?`,
      `session:${session}`,
    )?.n).toBe(1)
  })

  test('a capacity drop takes nobody off the list: they go back to waiting', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module], capacity: 3 })
    const people = [await member(), await member(), await member()]
    for (const person of people) await signUp(session, person.cookie)

    expect((await send('POST', `/api/admin/training/sessions/${session}/capacity`, { capacity: 1 })).status)
      .toBe(200)

    const listing = await (await send('GET', '/api/training/sessions', undefined, people[2]!.cookie)).json() as
      { items: { id: string, placed: boolean, waitlistPosition: number | null }[] }
    const theirs = listing.items.find(one => one.id === session)
    expect(theirs?.placed).toBe(false)
    expect(theirs?.waitlistPosition).toBe(2)
    expect(read<{ n: number }>('SELECT count(*) n FROM session_attendees WHERE session_id = ?', session)?.n).toBe(3)
  })

  test('a member cannot change a session\'s capacity', async () => {
    const module = await addModule()
    const session = await schedule({ moduleIds: [module] })
    const person = await member()

    expect((await send('POST', `/api/admin/training/sessions/${session}/capacity`, { capacity: 5 }, person.cookie))
      .status).toBe(403)
  })
})

describe.skipIf(skip !== null)('the member screen (G-105)', () => {
  test('a member signs up, sees where they stand, and withdraws', async () => {
    const module = await addModule({ name: 'Sound desk basics' })
    const session = await schedule({ moduleIds: [module], capacity: 1 })

    const { person, view } = await memberView()

    try {
      await visit(view, `${app.baseURL}/training/sessions`, '[data-test="sessions-page"]')
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')

      await click(view, `[data-test="signup-${session}"]`)
      await waitFor(view, `document.querySelector('[data-test="standing-${session}"]')`, 30_000)
      expect(await textOf(view, `[data-test="standing-${session}"]`)).toContain('You have a place')

      await click(view, `[data-test="withdraw-${session}"]`)
      await waitFor(view, `document.querySelector('[data-test="signup-${session}"]')`, 30_000)
    }
    finally {
      view.close()
    }

    expect(read<{ status: string }>(
      'SELECT status FROM session_attendees WHERE session_id = ? AND user_id = ?', session, person.id,
    )?.status).toBe('CANCELLED')
  }, CASE_TIMEOUT_MS)

  test('a full session offers the waiting list rather than turning somebody away', async () => {
    const module = await addModule({ name: 'Rigging' })
    const session = await schedule({ moduleIds: [module], capacity: 1 })
    const holder = await member()
    await signUp(session, holder.cookie)

    const { view } = await memberView()

    try {
      await visit(view, `${app.baseURL}/training/sessions`, '[data-test="sessions-page"]')
      expect(await textOf(view, `[data-test="session-${session}"]`)).toContain('rather than turning you away')

      await click(view, `[data-test="signup-${session}"]`)
      await waitFor(view, `document.querySelector('[data-test="standing-${session}"]')`, 30_000)
      expect(await textOf(view, `[data-test="standing-${session}"]`)).toContain('Waiting, number 1')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the member dashboard says what they are signed up to', async () => {
    const module = await addModule({ name: 'Followspot' })
    const session = await schedule({ moduleIds: [module], capacity: 4 })

    const { person, view } = await memberView()
    await signUp(session, person.cookie)

    try {
      await visit(view, `${app.baseURL}/training`, '[data-test="training-page"]')
      await waitFor(view, `document.querySelector('[data-test="signed-up-${session}"]')`, 30_000)
      expect(await textOf(view, `[data-test="signed-up-${session}"]`)).toContain('You have a place')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
