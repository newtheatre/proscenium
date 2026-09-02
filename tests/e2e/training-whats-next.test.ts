import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { londonParts } from '#shared/utils/london'
import { adminSession, forgetSpentStep, markVerified } from '#tests/helpers/accounts'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, fillPin, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-102. Doing more should be a visible path rather than folklore, and the path is recomputed on
// every read: nothing about it is stored, so a record awarded now shows on the next load.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let cookie = ''
let department = ''

const password = generatePassword()
const member = { ...syntheticPerson(29), email: registrableAddress('next-member') }
let memberId = ''
let memberCookie = ''
let memberSecret = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie

  await send('POST', '/api/auth/register', { email: member.email, name: member.name, password }, '')
  markVerified(app, member.email)
  memberId = read<{ id: string }>('SELECT id FROM users WHERE email = ?', member.email)!.id
  const signedIn = await send('POST', '/api/auth/sign-in', { email: member.email, password }, '')
  memberCookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!
  memberSecret = (await (await send('POST', '/api/account/mfa/enrol', {}, memberCookie)).json() as { secret: string }).secret
  await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(memberSecret, stepFor(new Date())) }, memberCookie)

  department = `NXT${suffix()}`
  await send('POST', '/api/admin/training/departments', { code: department, name: 'Next steps' })
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
  const id = `NXT-${suffix()}`
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

async function requires(moduleId: string, requiresId: string): Promise<void> {
  const answered = await send('POST', `/api/admin/training/modules/${moduleId}/prerequisites`, { requiresId })
  expect(answered.status).toBe(200)
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
  const database = new Database(app.databaseFile)
  try {
    database.query(
      `INSERT INTO training_records (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ).run(...Object.values(values) as never[])
  }
  finally {
    database.close()
  }
  return id
}

const nextIds = async (): Promise<string[]> => {
  const answered = await send('GET', '/api/training/next', undefined, memberCookie)
  expect(answered.status).toBe(200)
  return ((await answered.json() as { items: { id: string }[] }).items).map(item => item.id)
}

describe.skipIf(skip !== null)('the path is computed, never stored (G-102)', () => {
  test('a module with an unheld prerequisite is off the list, and holding it puts it on', async () => {
    const foundation = await addModule()
    const advanced = await addModule()
    await requires(advanced, foundation)

    expect(await nextIds()).toContain(foundation)
    expect(await nextIds()).not.toContain(advanced)

    // Criterion 4: the next read, with nothing invalidated and nothing swept.
    award(memberId, foundation)
    const after = await nextIds()
    expect(after).toContain(advanced)
    expect(after).not.toContain(foundation)
  })

  test('an expiring prerequisite opens what it gates, because expiring is held (criterion 1)', async () => {
    const foundation = await addModule()
    const advanced = await addModule()
    await requires(advanced, foundation)
    award(memberId, foundation, { expires_on: daysFrom(10) })

    expect(await nextIds()).toContain(advanced)
  })

  test('a draft module is never offered (criterion 5)', async () => {
    const draft = await addModule({ status: 'DRAFT' })
    expect(await nextIds()).not.toContain(draft)
  })

  test('a retired module is never offered, because it takes nothing new', async () => {
    const retired = await addModule({ status: 'RETIRED' })
    expect(await nextIds()).not.toContain(retired)
  })

  test('revoking a record puts the module back on the list', async () => {
    const module = await addModule()
    const record = award(memberId, module)
    expect(await nextIds()).not.toContain(module)

    const revoked = await send('POST', `/api/admin/training/records/${record}/revoke`, { reason: 'Wrong person' })
    expect(revoked.status).toBe(200)
    expect(await nextIds()).toContain(module)
  })

  test('the list is your own: it never reads another member\'s records', async () => {
    const other = await adminSession(app, { roles: [] })
    const module = await addModule()
    award(other.id, module)

    expect(await nextIds()).toContain(module)
  })

  test('signed out, there is no list at all', async () => {
    expect((await send('GET', '/api/training/next', undefined, '')).status).toBe(401)
  })
})

// Criterion 2. The write path refuses an edge onto a brief, so this drives it the only way it can
// still happen: a row written straight to the database. A brief must never be what blocks somebody.
describe.skipIf(skip !== null)('a brief gates nothing (G-102 criterion 2)', () => {
  test('an edge onto a brief does not keep a module off the list', async () => {
    const brief = await addModule({ kind: 'BRIEF' })
    const module = await addModule()

    const database = new Database(app.databaseFile)
    try {
      database.query('INSERT INTO module_prerequisites (id, module_id, requires_id) VALUES (?, ?, ?)')
        .run(`p-${suffix()}`, module, brief)
    }
    finally {
      database.close()
    }

    expect(await nextIds()).toContain(module)
  })

  test('the write path refuses the edge in the first place', async () => {
    const brief = await addModule({ kind: 'BRIEF' })
    const module = await addModule()
    const refused = await send('POST', `/api/admin/training/modules/${module}/prerequisites`, { requiresId: brief })
    expect(refused.status).toBe(409)
  })
})

// Criterion 3. Only one gated surface exists today, the prerequisite gate on a sign-off. Shifts,
// the till and kit loans are modules E, F and C, and their halves close with them.
describe.skipIf(skip !== null)('a gate names what would unlock it (G-102 criterion 3)', () => {
  test('a refused sign-off names the module by its published id and title', async () => {
    const foundation = await addModule({ name: 'Working at height' })
    const advanced = await addModule()
    await requires(advanced, foundation)

    const refused = await send('POST', '/api/admin/training/signoffs', {
      userId: memberId,
      moduleId: advanced,
      awardedOn: daysFrom(0),
    })
    expect(refused.status).toBe(422)
    const said = (await refused.json() as { statusMessage?: string }).statusMessage ?? ''
    expect(said).toContain(foundation)
    expect(said).toContain('Working at height')
  })
})

describe.skipIf(skip !== null)('the dashboard shows the path (G-102 criterion 1)', () => {
  test('what you could do next renders for a member', async () => {
    const module = await addModule({ name: 'Sweeping the stage' })

    forgetSpentStep(app, member.email)
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', member.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelectorAll('[data-test="mfa-challenge"] input').length >= 6`)
      await fillPin(view, '[data-test="mfa-challenge"] input', await codeForStep(memberSecret, stepFor(new Date()) + 1))
      await waitFor(view, `document.querySelector('[data-test="sign-out"]')`, 30_000)

      await visit(view, `${app.baseURL}/training`, '[data-test="training-page"]')
      // A server render cannot see a hydration failure, so the page is read after it is live.
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')
      await waitFor(view, `document.querySelector('[data-test="next-${module}"]')`, 30_000)
      expect(await textOf(view, '[data-test="whats-next"]')).toContain('Sweeping the stage')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
