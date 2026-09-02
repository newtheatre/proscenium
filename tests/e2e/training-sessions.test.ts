import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { londonParts } from '#shared/utils/london'
import { adminSession, forgetSpentStep, markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fillDate, fillNumber, fillTime, openSignedOutView, fill, fillPin, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-111 and G-112. Standing to run a session derives from a current certification and nothing
// else, and what a trainer may teach is what they hold: scoped by competence, not by department.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let cookie = ''

const password = generatePassword()
const trainer = { ...syntheticPerson(53), email: registrableAddress('session-trainer') }
let trainerId = ''
let trainerCookie = ''
let department = ''
let trainerCert = ''

const officerPassword = generatePassword()
const officer = { ...syntheticPerson(71), email: registrableAddress('session-officer') }
let officerSecret = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie

  await send('POST', '/api/auth/register', { email: trainer.email, name: trainer.name, password }, '')
  markVerified(app, trainer.email)
  trainerId = read<{ id: string }>('SELECT id FROM users WHERE email = ?', trainer.email)!.id
  const signedIn = await send('POST', '/api/auth/sign-in', { email: trainer.email, password }, '')
  trainerCookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!

  department = `SES${suffix()}`
  await send('POST', '/api/admin/training/departments', { code: department, name: 'Sessions' })

  // The catalogue's own shape: one cross-department certification is what makes a trainer.
  trainerCert = await addModule({ kind: 'CERTIFICATION', grantsTrainer: true, signoffRequired: true })

  // An officer the browser can sign in as: the screen is admin-only, so the case needs a real
  // privileged session rather than a cookie handed round the side (A-112).
  await send('POST', '/api/auth/register', { email: officer.email, name: officer.name, password: officerPassword }, '')
  markVerified(app, officer.email)
  const first = await send('POST', '/api/auth/sign-in', { email: officer.email, password: officerPassword }, '')
  const firstCookie = (first.headers.get('set-cookie') ?? '').split(';')[0]!
  officerSecret = (await (await send('POST', '/api/account/mfa/enrol', {}, firstCookie)).json() as { secret: string }).secret
  await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(officerSecret, stepFor(new Date())) }, firstCookie)
  expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', officer.email, app.databaseFile, '--additional'])
    .exitCode).toBe(0)
}, BOOT_TIMEOUT_MS)

async function officerView(): Promise<Bun.WebView> {
  forgetSpentStep(app, officer.email)
  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', officer.email)
  await fill(view, 'form input[type="password"]', officerPassword)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelectorAll('[data-test="mfa-challenge"] input').length >= 6`)
  await fillPin(view, '[data-test="mfa-challenge"] input', await codeForStep(officerSecret, stepFor(new Date()) + 1))
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`, 30_000)
  return view
}

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

// London days: a session date is a wall-clock day, not an offset from a UTC instant (0014).
function daysFrom(days: number): string {
  const now = londonParts(new Date())
  return new Date(Date.UTC(now.year, now.month - 1, now.day + days)).toISOString().slice(0, 10)
}

async function addModule(over: Record<string, unknown> = {}): Promise<string> {
  const id = `SES-${suffix()}`
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

function award(userId: string, moduleId: string, columns: Record<string, unknown> = {}): string {
  const id = `tr-${crypto.randomUUID().slice(0, 8)}`
  const values: Record<string, unknown> = {
    id,
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
  return id
}

const schedule = (body: Record<string, unknown>, as = cookie): Promise<Response> =>
  send('POST', '/api/admin/training/sessions', {
    heldOn: daysFrom(7),
    startsAt: '19:00',
    endsAt: '21:00',
    capacity: 20,
    ...body,
  }, as)

const said = async (answered: Response): Promise<string> =>
  (await answered.json() as { statusMessage?: string }).statusMessage ?? ''

describe.skipIf(skip !== null)('trainer standing derives from a record (G-111)', () => {
  test('somebody with no certification cannot schedule anything (criteria 1 and 2)', async () => {
    const module = await addModule()
    const refused = await schedule({ moduleIds: [module] }, trainerCookie)
    expect(refused.status).toBe(403)
    expect(await said(refused)).toContain('trainer certification')
  })

  test('holding a trainer-granting record confers it, with no role granted', async () => {
    const module = await addModule()
    award(trainerId, trainerCert)
    award(trainerId, module)

    expect((await schedule({ moduleIds: [module] }, trainerCookie)).status).toBe(200)
    // Never a role: the derivation is the whole mechanism (criterion 1).
    expect(read<{ n: number }>('SELECT count(*) n FROM role_grants WHERE user_id = ?', trainerId)?.n).toBe(0)
  })

  // Criterion 5: the named test. Revoking removes access, and nothing else was written.
  test('revoking the certification removes access, with no other write', async () => {
    const person = await adminSession(app, { roles: [] })
    const module = await addModule()
    const cert = award(person.id, trainerCert)
    award(person.id, module)
    expect((await schedule({ moduleIds: [module] }, person.cookie)).status).toBe(200)

    const before = read<{ n: number }>('SELECT count(*) n FROM training_records WHERE user_id = ?', person.id)?.n
    write(
      `UPDATE training_records SET revoked_at = ?, revoked_by = ?, revoke_reason = ? WHERE id = ?`,
      Math.floor(Date.now() / 1000), person.id, 'Stood down', cert,
    )

    expect((await schedule({ moduleIds: [module] }, person.cookie)).status).toBe(403)
    expect(read<{ n: number }>('SELECT count(*) n FROM training_records WHERE user_id = ?', person.id)?.n)
      .toBe(before!)
    expect(read<{ n: number }>('SELECT count(*) n FROM role_grants WHERE user_id = ?', person.id)?.n).toBe(0)
  })

  test('an expired certification confers nothing, with no sweep having run (criterion 2)', async () => {
    const person = await adminSession(app, { roles: [] })
    const module = await addModule()
    award(person.id, trainerCert, { awarded_on: '2024-01-01', expires_on: '2025-01-01' })
    award(person.id, module)

    expect((await schedule({ moduleIds: [module] }, person.cookie)).status).toBe(403)
  })

  // Criterion 4: supervisor standing derives by the same mechanism, and the member's own page is
  // where it is said out loud rather than stored.
  test('a supervisor-granting certification derives supervisor standing, and revocation takes it', async () => {
    const person = await adminSession(app, { roles: [] })
    const supervisorCert = await addModule({ kind: 'CERTIFICATION', grantsSupervisor: true, signoffRequired: true })
    const cert = award(person.id, supervisorCert)

    const held = await (await send('GET', '/api/training/records', undefined, person.cookie)).json() as
      { standing: { trainer: boolean, supervisor: boolean } }
    expect(held.standing).toEqual({ trainer: false, supervisor: true })

    write(
      `UPDATE training_records SET revoked_at = ?, revoked_by = ?, revoke_reason = ? WHERE id = ?`,
      Math.floor(Date.now() / 1000), person.id, 'Stood down', cert,
    )

    const after = await (await send('GET', '/api/training/records', undefined, person.cookie)).json() as
      { standing: { supervisor: boolean } }
    expect(after.standing.supervisor).toBe(false)
  })

  test('an expiring certification still counts, because expiring is held (criterion 2)', async () => {
    const person = await adminSession(app, { roles: [] })
    const module = await addModule()
    award(person.id, trainerCert, { expires_on: daysFrom(10) })
    award(person.id, module)

    expect((await schedule({ moduleIds: [module] }, person.cookie)).status).toBe(200)
  })
})

describe.skipIf(skip !== null)('a session is scheduled (G-112)', () => {
  test('it records the day, the wall clock, the capacity and what it teaches (criterion 1)', async () => {
    const module = await addModule()
    const answered = await schedule({ moduleIds: [module], place: 'The rehearsal room' })
    expect(answered.status).toBe(200)
    const { id } = await answered.json() as { id: string }

    const held = read<{ starts: string, capacity: number, status: string }>(
      'SELECT starts_at starts, capacity, status FROM training_sessions WHERE id = ?', id,
    )
    expect(held).toMatchObject({ starts: '19:00', capacity: 20, status: 'OPEN' })
    expect(read<{ n: number }>('SELECT count(*) n FROM session_modules WHERE session_id = ?', id)?.n).toBe(1)
  })

  test('a capacity outside one to sixty is refused', async () => {
    const module = await addModule()
    expect((await schedule({ moduleIds: [module], capacity: 0 })).status).toBe(400)
    expect((await schedule({ moduleIds: [module], capacity: 61 })).status).toBe(400)
  })

  test('a session in the past is refused, because logging one is a different act', async () => {
    const module = await addModule()
    const refused = await schedule({ moduleIds: [module], heldOn: daysFrom(-1) })
    expect(refused.status).toBe(422)
  })

  test('a session that ends before it starts is refused', async () => {
    const module = await addModule()
    expect((await schedule({ moduleIds: [module], startsAt: '21:00', endsAt: '19:00' })).status).toBe(400)
  })

  // Criterion 2: opening later keeps it invisible to members until then.
  test('sign-up opens now, or at a chosen later time', async () => {
    const module = await addModule()
    const now = await (await schedule({ moduleIds: [module] })).json() as { id: string }
    const later = await (await schedule({
      moduleIds: [module],
      opensAt: Math.floor(Date.now() / 1000) + 86_400,
    })).json() as { id: string }

    expect(read<{ status: string }>('SELECT status FROM training_sessions WHERE id = ?', now.id)?.status).toBe('OPEN')
    expect(read<{ status: string }>('SELECT status FROM training_sessions WHERE id = ?', later.id)?.status)
      .toBe('PLANNED')
  })

  // Criterion 3, and question 4's answer: a certification is proved by experience, not taught.
  test('a retired, draft or sign-off-only module cannot be taught by session', async () => {
    const retired = await addModule({ status: 'RETIRED' })
    const draft = await addModule({ status: 'DRAFT' })
    const signoff = await addModule({ signoffRequired: true })

    for (const module of [retired, draft, signoff]) {
      const refused = await schedule({ moduleIds: [module] })
      expect(refused.status).toBe(422)
      expect(await said(refused)).toContain(module)
    }
  })

  test('a certification cannot be taught by session, because it carries manual sign-off', async () => {
    const refused = await schedule({ moduleIds: [trainerCert] })
    expect(refused.status).toBe(422)
  })

  // Question 4's answer: scoped by competence rather than by department.
  test('a trainer may teach only a module they currently hold', async () => {
    const person = await adminSession(app, { roles: [] })
    const held = await addModule()
    const notHeld = await addModule()
    award(person.id, trainerCert)
    award(person.id, held)

    expect((await schedule({ moduleIds: [held] }, person.cookie)).status).toBe(200)

    const refused = await schedule({ moduleIds: [notHeld] }, person.cookie)
    expect(refused.status).toBe(422)
    expect(await said(refused)).toContain(notHeld)
  })

  test('the training officer schedules on somebody else\'s behalf without holding it', async () => {
    const module = await addModule()
    expect((await schedule({ moduleIds: [module] })).status).toBe(200)
  })

  test('a module that does not exist is refused', async () => {
    expect((await schedule({ moduleIds: ['NOPE-1'] })).status).toBe(404)
  })

  test('a session names at least one module', async () => {
    expect((await schedule({ moduleIds: [] })).status).toBe(400)
  })

  test('scheduling is on the trail, and a member can neither schedule nor list', async () => {
    const module = await addModule()
    const { id } = await (await schedule({ moduleIds: [module] })).json() as { id: string }
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM audit_log WHERE action = 'session.scheduled' AND target = ?`, `session:${id}`,
    )?.n).toBe(1)

    const member = await adminSession(app, { roles: [] })
    expect((await schedule({ moduleIds: [module] }, member.cookie)).status).toBe(403)
    expect((await send('GET', '/api/admin/training/sessions', undefined, member.cookie)).status).toBe(403)
  })

  test('the listing carries what each session teaches', async () => {
    const module = await addModule()
    const { id } = await (await schedule({ moduleIds: [module] })).json() as { id: string }

    const listing = await (await send('GET', '/api/admin/training/sessions')).json() as
      { items: { id: string, modules: { id: string }[] }[] }
    expect(listing.items.find(one => one.id === id)?.modules.map(one => one.id)).toEqual([module])
  })
})

describe.skipIf(skip !== null)('the trainer screen (G-112)', () => {
  test('a session is scheduled through the screen', async () => {
    const module = await addModule({ name: 'Working at height' })
    const day = daysFrom(21)
    const view = await officerView()

    try {
      await visit(view, `${app.baseURL}/training/manage/sessions`, '[data-test="sessions-table"]')
      // A server render cannot see a hydration failure, so the page is read after it is live.
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')

      await click(view, '[data-test="add-session"]')
      await waitFor(view, `document.querySelector('[data-test="session-starts"]')`, 30_000)
      await fillDate(view, '[data-test="session-day"]', day)
      await fillTime(view, '[data-test="session-starts"]', '18:30')
      await fillTime(view, '[data-test="session-ends"]', '20:30')
      await fill(view, '[data-test="session-place"]', 'The studio')
      // The attribute lands on the inner input, not a wrapper: UInputNumber binds $attrs onto
      // the field itself, so there is nothing to descend into (0032).
      await fillNumber(view, '[data-test="session-capacity"]', '12')

      // A closed set is a row of buttons: a Nuxt UI select is a listbox and a click commits
      // nothing on one (0032).
      await click(view, `[data-test="session-module-${module}"]`)
      await click(view, '[data-test="session-submit"]')

      await waitFor(view, `document.body.innerText.includes(${JSON.stringify(day)})`, 30_000)
    }
    finally {
      view.close()
    }

    const stored = read<{ starts: string, capacity: number, status: string, place: string }>(
      'SELECT starts_at starts, capacity, status, place FROM training_sessions WHERE held_on = ?',
      day,
    )
    expect(stored).toMatchObject({ starts: '18:30', capacity: 12, status: 'OPEN', place: 'The studio' })
  }, CASE_TIMEOUT_MS)

  test('a certification is absent from what the screen offers to teach', async () => {
    const view = await officerView()
    try {
      await visit(view, `${app.baseURL}/training/manage/sessions`, '[data-test="sessions-table"]')
      await click(view, '[data-test="add-session"]')
      await waitFor(view, `document.querySelector('[data-test="session-starts"]')`, 30_000)
      expect(await view.evaluate<boolean>(
        `!!document.querySelector('[data-test="session-module-${trainerCert}"]')`,
      )).toBe(false)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
