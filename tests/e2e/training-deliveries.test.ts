import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { addMonths, gapKey } from '#shared/utils/training'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { londonParts } from '#shared/utils/london'
import { adminSession, forgetSpentStep, markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, fillDate, fillPin, openSignedOutView, pickPerson, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-118. A session that already happened, previewed exactly and then written in one batch. The
// dry-run and the write compute from one function, so the preview cannot disagree with the result.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let cookie = ''

const password = generatePassword()
const trainer = { ...syntheticPerson(29), email: registrableAddress('delivery-trainer') }
let trainerId = ''
let trainerCookie = ''
let department = ''
let trainerCert = ''

const officerPassword = generatePassword()
const officer = { ...syntheticPerson(37), email: registrableAddress('delivery-officer') }
let officerSecret = ''

interface PreviewRecord {
  userId: string
  name: string
  moduleId: string
  moduleName: string
  awardedOn: string
  expiresOn: string | null
  alreadyHeld: boolean
}

interface PreviewGap {
  key: string
  userId: string
  moduleId: string
  requiresId: string
  severity: string
}

interface Preview {
  heldOn: string
  records: PreviewRecord[]
  gaps: PreviewGap[]
  creates: number
  blocked: boolean
}

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie

  await send('POST', '/api/auth/register', { email: trainer.email, name: trainer.name, password }, '')
  markVerified(app, trainer.email)
  trainerId = read<{ id: string }>('SELECT id FROM users WHERE email = ?', trainer.email)!.id
  const signedIn = await send('POST', '/api/auth/sign-in', { email: trainer.email, password }, '')
  trainerCookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!

  department = `DEL${suffix()}`
  await send('POST', '/api/admin/training/departments', { code: department, name: 'Deliveries' })
  trainerCert = await addModule({ kind: 'CERTIFICATION', grantsTrainer: true, signoffRequired: true })
  award(trainerId, trainerCert)

  // An officer the browser can sign in as: the screen is console-only, so the case needs a real
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

afterAll(async () => {
  await app?.stop()
}, 30_000)

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

const send = (method: string, path: string, body?: unknown, as = cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

const suffix = (): string => crypto.randomUUID().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')

// London days: an award date is a wall-clock day, not an offset from a UTC instant (0014).
function daysFrom(days: number): string {
  const now = londonParts(new Date())
  return new Date(Date.UTC(now.year, now.month - 1, now.day + days)).toISOString().slice(0, 10)
}

async function addModule(over: Record<string, unknown> = {}): Promise<string> {
  const id = `DEL-${suffix()}`
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

async function addPerson(): Promise<string> {
  const person = await adminSession(app, { roles: [] })
  return person.id
}

function award(userId: string, moduleId: string, columns: Record<string, unknown> = {}): string {
  const id = `tr-${crypto.randomUUID().slice(0, 8)}`
  const values: Record<string, unknown> = {
    id,
    user_id: userId,
    module_id: moduleId,
    awarded_on: daysFrom(-30),
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

const preview = (body: Record<string, unknown>, as = cookie): Promise<Response> =>
  send('POST', '/api/admin/training/deliveries/preview', { heldOn: daysFrom(-3), ...body }, as)

const log = (body: Record<string, unknown>, as = cookie): Promise<Response> =>
  send('POST', '/api/admin/training/deliveries', { heldOn: daysFrom(-3), ...body }, as)

const said = async (answered: Response): Promise<string> =>
  (await answered.json() as { statusMessage?: string }).statusMessage ?? ''

const recordsFor = (moduleId: string): { userId: string, moduleId: string, awardedOn: string, expiresOn: string | null, source: string, sessionId: string | null }[] =>
  all(`SELECT user_id userId, module_id moduleId, awarded_on awardedOn, expires_on expiresOn,
    source, session_id sessionId FROM training_records WHERE module_id = ? ORDER BY user_id`, moduleId)

describe.skipIf(skip !== null)('the dry-run shows the records and writes nothing (G-118 criteria 1 and 2)', () => {
  test('it names one record per person per module, with the expiry the log would stamp', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12 })
    const other = await addModule()
    const [one, two] = [await addPerson(), await addPerson()]
    const heldOn = daysFrom(-3)

    const answered = await preview({ heldOn, moduleIds: [module, other], userIds: [one, two] })
    expect(answered.status).toBe(200)
    const shown = await answered.json() as Preview

    expect(shown.records).toHaveLength(4)
    expect(shown.creates).toBe(4)
    expect(shown.blocked).toBe(false)
    expect(shown.records.every(record => record.awardedOn === heldOn)).toBe(true)
    expect(shown.records.find(record => record.moduleId === module)?.expiresOn)
      .toBe(addMonths(heldOn, 12))
    expect(shown.records.find(record => record.moduleId === other)?.expiresOn).toBeNull()

    // The whole point of a dry-run: nothing exists afterwards.
    expect(recordsFor(module)).toHaveLength(0)
    expect(recordsFor(other)).toHaveLength(0)
  })

  test('a day in the future is refused, by the dry-run and by the write alike', async () => {
    const module = await addModule()
    const person = await addPerson()
    const tomorrow = { heldOn: daysFrom(1), moduleIds: [module], userIds: [person] }

    expect((await preview(tomorrow)).status).toBe(422)
    const refused = await log({ ...tomorrow, expectedCount: 1 })
    expect(refused.status).toBe(422)
    expect(await said(refused)).toContain('future')
  })

  test('somebody who already holds it for that day is shown as such and is not written twice', async () => {
    const module = await addModule()
    const person = await addPerson()
    const heldOn = daysFrom(-3)
    award(person, module, { awarded_on: heldOn, source: 'SESSION' })

    const shown = await (await preview({ heldOn, moduleIds: [module], userIds: [person] })).json() as Preview
    expect(shown.records[0]?.alreadyHeld).toBe(true)
    expect(shown.creates).toBe(0)
  })
})

describe.skipIf(skip !== null)('a safety-critical gap blocks absolutely (G-118 criterion 3)', () => {
  async function gated(safetyCritical: boolean): Promise<{ module: string, gate: string, person: string }> {
    const gate = await addModule()
    const module = await addModule({ safetyCritical })
    await send('POST', `/api/admin/training/modules/${module}/prerequisites`, { requiresId: gate })
    return { module, gate, person: await addPerson() }
  }

  test('the dry-run says it blocks, and the write refuses naming what is missing', async () => {
    const { module, gate, person } = await gated(true)
    const shown = await (await preview({ moduleIds: [module], userIds: [person] })).json() as Preview
    expect(shown.blocked).toBe(true)
    expect(shown.gaps.map(gap => gap.severity)).toEqual(['BLOCKS'])

    const refused = await log({ moduleIds: [module], userIds: [person], expectedCount: 1 })
    expect(refused.status).toBe(422)
    expect(await said(refused)).toContain(gate)
    expect(recordsFor(module)).toHaveLength(0)
  })

  // No parameter waves one through, which is what "absolutely" means.
  test('nothing in the body can acknowledge it', async () => {
    const { module, gate, person } = await gated(true)
    const acknowledged = [gapKey({ userId: person, moduleId: module, requiresId: gate })]

    for (const attempt of [{ acknowledged }, { force: true }, { override: true }, { acknowledged: ['*'] }]) {
      const refused = await log({ moduleIds: [module], userIds: [person], expectedCount: 1, ...attempt })
      expect(refused.status).toBe(422)
    }
    expect(recordsFor(module)).toHaveLength(0)
  })

  test('an ordinary gap asks once, per gap, and then allows', async () => {
    const { module, gate, person } = await gated(false)
    const shown = await (await preview({ moduleIds: [module], userIds: [person] })).json() as Preview
    expect(shown.gaps.map(gap => gap.severity)).toEqual(['ACKNOWLEDGE'])
    expect(shown.blocked).toBe(false)

    const unacknowledged = await log({ moduleIds: [module], userIds: [person], expectedCount: 1 })
    expect(unacknowledged.status).toBe(422)
    expect(await said(unacknowledged)).toContain(gate)

    const allowed = await log({
      moduleIds: [module],
      userIds: [person],
      expectedCount: 1,
      acknowledged: shown.gaps.map(gap => gap.key),
    })
    expect(allowed.status).toBe(200)
    expect(recordsFor(module)).toHaveLength(1)
  })

  test('an acknowledgement for one person does not carry to another', async () => {
    const { module, gate, person } = await gated(false)
    const another = await addPerson()

    const refused = await log({
      moduleIds: [module],
      userIds: [person, another],
      expectedCount: 2,
      acknowledged: [gapKey({ userId: person, moduleId: module, requiresId: gate })],
    })
    expect(refused.status).toBe(422)
    expect(recordsFor(module)).toHaveLength(0)
  })

  test('holding the prerequisite leaves no gap at all', async () => {
    const { module, gate, person } = await gated(true)
    award(person, gate)

    const shown = await (await preview({ moduleIds: [module], userIds: [person] })).json() as Preview
    expect(shown.gaps).toEqual([])
    expect((await log({ moduleIds: [module], userIds: [person], expectedCount: 1 })).status).toBe(200)
  })

  // Expiring counts as held everywhere, so it is not a gap here either (G-101 criterion 3).
  test('an expiring prerequisite counts as held and an expired one does not', async () => {
    const first = await gated(true)
    award(first.person, first.gate, { expires_on: daysFrom(10) })
    expect(((await (await preview({ moduleIds: [first.module], userIds: [first.person] })).json()) as Preview).gaps)
      .toEqual([])

    const second = await gated(true)
    award(second.person, second.gate, { awarded_on: '2024-01-01', expires_on: '2025-01-01' })
    expect(((await (await preview({ moduleIds: [second.module], userIds: [second.person] })).json()) as Preview).blocked)
      .toBe(true)
  })

  // The batch awards the prerequisite at the same date, so it is not missing by the time the log
  // lands: refusing here would only teach a trainer to log the same evening twice.
  test('a prerequisite taught by the same log is not a gap', async () => {
    const { module, gate, person } = await gated(true)
    const shown = await (await preview({ moduleIds: [gate, module], userIds: [person] })).json() as Preview
    expect(shown.gaps).toEqual([])
    expect((await log({ moduleIds: [gate, module], userIds: [person], expectedCount: 2 })).status).toBe(200)
  })
})

describe.skipIf(skip !== null)('the write is the preview (G-118 criteria 4 and 5)', () => {
  test('what was previewed is exactly what lands, in one batch at the held-on date', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 24 })
    const other = await addModule({ expiryMode: 'ACADEMIC_YEAR' })
    const people = [await addPerson(), await addPerson(), await addPerson()]
    const heldOn = daysFrom(-10)

    const shown = await (await preview({ heldOn, moduleIds: [module, other], userIds: people })).json() as Preview
    expect(shown.creates).toBe(6)

    const answered = await log({ heldOn, moduleIds: [module, other], userIds: people, expectedCount: shown.creates })
    expect(answered.status).toBe(200)
    expect(await answered.json()).toMatchObject({ ok: true, created: 6 })

    const written = [...recordsFor(module), ...recordsFor(other)]
      .map(record => ({ ...record, key: `${record.userId}:${record.moduleId}` }))
      .sort((a, b) => a.key.localeCompare(b.key))
    const previewed = shown.records
      .map(record => ({ ...record, key: `${record.userId}:${record.moduleId}` }))
      .sort((a, b) => a.key.localeCompare(b.key))

    expect(written).toHaveLength(previewed.length)
    for (const [index, record] of previewed.entries()) {
      expect(written[index]).toMatchObject({
        userId: record.userId,
        moduleId: record.moduleId,
        awardedOn: record.awardedOn,
        expiresOn: record.expiresOn,
        source: 'SESSION',
      })
    }
    // Awarded at the held-on date, never at the day the log was typed.
    expect(written.every(record => record.awardedOn === heldOn)).toBe(true)
    expect(written.every(record => record.sessionId === null)).toBe(true)
  })

  test('a log whose preview has moved is refused, quoting both figures', async () => {
    const module = await addModule()
    const people = [await addPerson(), await addPerson()]
    expect((await log({ moduleIds: [module], userIds: people, expectedCount: 2 })).status).toBe(200)

    // The same log again creates nothing, so the count it was previewed at no longer holds.
    const refused = await log({ moduleIds: [module], userIds: people, expectedCount: 2 })
    expect(refused.status).toBe(409)
    expect(await said(refused)).toContain('2')
    expect(recordsFor(module)).toHaveLength(2)
  })

  test('every attendee is on the trail, and the reason nobody is named in the detail', async () => {
    const module = await addModule()
    const person = await addPerson()
    expect((await log({ moduleIds: [module], userIds: [person], expectedCount: 1 })).status).toBe(200)

    expect(read<{ n: number }>(
      `SELECT count(*) n FROM audit_log WHERE action = 'record.delivery-logged' AND target = ?`,
      `user:${person}`,
    )?.n).toBe(1)
  })
})

describe.skipIf(skip !== null)('logging is a trainer\'s, on what they hold (G-111 criterion 3)', () => {
  test('a member cannot log a delivery, and cannot preview one either', async () => {
    const module = await addModule()
    const person = await adminSession(app, { roles: [] })
    expect((await preview({ moduleIds: [module], userIds: [person.id] }, person.cookie)).status).toBe(403)
    expect((await log({ moduleIds: [module], userIds: [person.id], expectedCount: 1 }, person.cookie)).status)
      .toBe(403)
  })

  test('a trainer may log only a module they currently hold', async () => {
    const held = await addModule()
    const notHeld = await addModule()
    award(trainerId, held)
    const person = await addPerson()

    expect((await log({ moduleIds: [held], userIds: [person], expectedCount: 1 }, trainerCookie)).status).toBe(200)
    const refused = await log({ moduleIds: [notHeld], userIds: [person], expectedCount: 1 }, trainerCookie)
    expect(refused.status).toBe(422)
    expect(await said(refused)).toContain(notHeld)
  })

  test('a retired or sign-off-only module cannot be logged as delivered', async () => {
    const retired = await addModule({ status: 'RETIRED' })
    const signoff = await addModule({ signoffRequired: true })
    const person = await addPerson()

    for (const module of [retired, signoff]) {
      expect((await log({ moduleIds: [module], userIds: [person], expectedCount: 1 })).status).toBe(422)
    }
  })
})

describe.skipIf(skip !== null)('the trainer screen (G-118)', () => {
  test('a delivery is previewed and then logged through the screen', async () => {
    const module = await addModule({ name: 'Fire safety brief' })
    const signoff = await addModule({ signoffRequired: true })
    const person = { ...syntheticPerson(83), email: registrableAddress('delivery-attendee') }
    await send('POST', '/api/auth/register', { email: person.email, name: person.name, password: generatePassword() }, '')
    markVerified(app, person.email)
    const attendee = read<{ id: string }>('SELECT id FROM users WHERE email = ?', person.email)!.id
    const day = daysFrom(-5)

    const view = await officerView()
    try {
      await visit(view, `${app.baseURL}/training/manage/sessions`, '[data-test="sessions-table"]')
      await click(view, '[data-test="log-session"]')
      await waitFor(view, `document.querySelector('[data-test="delivery-form"]')`)
      // A server render cannot see a hydration failure, so the page is read after it is live.
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')

      // Only what may be taught is on offer: a sign-off-only module and a certification are not.
      expect(await view.evaluate<boolean>(
        `!!document.querySelector('[data-test="delivery-module-${signoff}"]')`,
      )).toBe(false)
      expect(await view.evaluate<boolean>(
        `!!document.querySelector('[data-test="delivery-module-${trainerCert}"]')`,
      )).toBe(false)

      await fillDate(view, '[data-test="delivery-day"]', day)
      await click(view, `[data-test="delivery-module-${module}"]`)
      await pickPerson(view, '[data-test="delivery-person"]', person.email.split('@')[0]!, person.name)
      await click(view, '[data-test="delivery-add-person"]')
      await waitFor(view, `document.querySelector('[data-test="delivery-attendees"]')`, 20_000)

      await click(view, '[data-test="delivery-preview"]')
      await waitFor(view, `document.querySelector('[data-test="delivery-plan"]')`, 30_000)
      const plan = await textOf(view, '[data-test="delivery-plan"]')
      expect(plan).toContain(module)
      expect(plan).toContain(person.name)

      // The plan clears only when the log has landed; a refusal leaves it on the page.
      await click(view, '[data-test="delivery-submit"]')
      await waitFor(view, `!document.querySelector('[data-test="delivery-plan"]')`, 30_000)
    }
    finally {
      view.close()
    }

    // The row that was saved, not the field that looked filled in (0039).
    expect(all<{ userId: string, awardedOn: string, source: string }>(
      'SELECT user_id userId, awarded_on awardedOn, source FROM training_records WHERE module_id = ?',
      module,
    )).toEqual([{ userId: attendee, awardedOn: day, source: 'SESSION' }])
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
