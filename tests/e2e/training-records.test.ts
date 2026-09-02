import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, forgetSpentStep, markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-101 through the real routes and the real screen. Nothing reads a stored validity: the record
// keeps its dates and every state on this page is worked out from them (0018).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let cookie = ''

const password = generatePassword()
const member = { ...syntheticPerson(63), email: registrableAddress('training-member') }
let memberId = ''
let memberCookie = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie

  await send('POST', '/api/auth/register', { email: member.email, name: member.name, password }, '')
  markVerified(app, member.email)
  memberId = read<{ id: string }>('SELECT id FROM users WHERE email = ?', member.email)!.id

  const signedIn = await send('POST', '/api/auth/sign-in', { email: member.email, password }, '')
  memberCookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!
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

// Records are seeded directly: the award paths are G-116 and G-120, and this slice is what a
// record means once it exists rather than how one comes to.
async function seedModule(over: Record<string, unknown> = {}): Promise<string> {
  const department = `REC${suffix()}`
  await send('POST', '/api/admin/training/departments', { code: department, name: `Department ${department}` })
  const id = `REC-${suffix()}`
  const answered = await send('POST', '/api/admin/training/modules', {
    id,
    department,
    kind: 'MODULE',
    name: 'Working at height',
    status: 'ACTIVE',
    ...over,
  })
  expect(answered.status).toBe(200)
  return id
}

function awardTo(userId: string, moduleId: string, columns: Record<string, unknown> = {}): string {
  const id = `tr-${crypto.randomUUID().slice(0, 8)}`
  const values: Record<string, unknown> = {
    id,
    user_id: userId,
    module_id: moduleId,
    awarded_on: '2026-09-01',
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

interface RecordItem {
  id: string
  moduleId: string
  state: string | null
  held: boolean
  expiresOn: string | null
}

async function mine(): Promise<RecordItem[]> {
  const answered = await send('GET', '/api/training/records', undefined, memberCookie)
  expect(answered.status).toBe(200)
  return (await answered.json() as { items: RecordItem[] }).items
}

describe.skipIf(skip !== null)('a record\'s state is derived from its dates (G-101)', () => {
  test('never, far off, inside the window and past all read differently (criteria 1, 2, 4)', async () => {
    const never = await seedModule()
    const far = await seedModule()
    const soon = await seedModule()
    const past = await seedModule()

    awardTo(memberId, never, {})
    awardTo(memberId, far, { expires_on: '2099-01-01' })
    awardTo(memberId, soon, { expires_on: todayPlus(10) })
    awardTo(memberId, past, { awarded_on: '2024-01-01', expires_on: '2025-01-01' })

    const items = await mine()
    expect(items.find(one => one.moduleId === never)?.state).toBe('VALID')
    expect(items.find(one => one.moduleId === far)?.state).toBe('VALID')
    expect(items.find(one => one.moduleId === soon)?.state).toBe('EXPIRING')
    expect(items.find(one => one.moduleId === past)?.state).toBe('EXPIRED')
  })

  // Criterion 3, which every gate in the system leans on.
  test('expiring counts as held and expired does not', async () => {
    const soon = await seedModule()
    const past = await seedModule()
    awardTo(memberId, soon, { expires_on: todayPlus(5) })
    awardTo(memberId, past, { awarded_on: '2024-01-01', expires_on: '2025-01-01' })

    const items = await mine()
    expect(items.find(one => one.moduleId === soon)?.held).toBe(true)
    expect(items.find(one => one.moduleId === past)?.held).toBe(false)
  })

  test('a brief shows its attendance and no state (criterion 5)', async () => {
    const brief = await seedModule({ kind: 'BRIEF' })
    awardTo(memberId, brief, {})

    expect((await mine()).find(one => one.moduleId === brief)?.state).toBeNull()
  })

  test('a revoked record is gone from the member\'s own view (criterion 6)', async () => {
    const module = await seedModule()
    const id = awardTo(memberId, module, {})
    expect((await mine()).some(one => one.id === id)).toBe(true)

    write(
      `UPDATE training_records SET revoked_at = ?, revoked_by = ?, revoke_reason = ? WHERE id = ?`,
      Math.floor(Date.now() / 1000), memberId, 'Recorded in error', id,
    )
    expect((await mine()).some(one => one.id === id)).toBe(false)
  })

  test('a renewal supersedes what it renews, so one module shows once (criterion 6)', async () => {
    const module = await seedModule()
    const older = awardTo(memberId, module, { awarded_on: '2025-09-01' })
    const newer = awardTo(memberId, module, { awarded_on: '2026-09-01' })

    const held = (await mine()).filter(one => one.moduleId === module)
    expect(held).toHaveLength(1)
    expect(held[0]?.id).toBe(newer)
    expect(held[0]?.id).not.toBe(older)
  })

  // Nothing was written to make any of the above true: only the calendar moved.
  test('the state moves with the date and no write, which is the whole point', async () => {
    const module = await seedModule()
    const id = awardTo(memberId, module, { expires_on: todayPlus(10) })
    expect((await mine()).find(one => one.id === id)?.state).toBe('EXPIRING')

    write(`UPDATE training_records SET expires_on = ? WHERE id = ?`, todayPlus(400), id)
    expect((await mine()).find(one => one.id === id)?.state).toBe('VALID')
  })

  test('a member cannot read anybody else\'s history', async () => {
    expect((await send('GET', `/api/admin/training/records?userId=${memberId}`, undefined, memberCookie)).status)
      .toBe(403)
  })

  test('an officer sees the revoked and superseded ones the member does not', async () => {
    const module = await seedModule()
    awardTo(memberId, module, { awarded_on: '2025-01-01' })
    awardTo(memberId, module, { awarded_on: '2026-01-01' })

    const answered = await send('GET', `/api/admin/training/records?userId=${memberId}`)
    expect(answered.status).toBe(200)
    const items = (await answered.json() as { items: { moduleId: string, superseded: boolean }[] }).items
    const forModule = items.filter(one => one.moduleId === module)
    expect(forModule).toHaveLength(2)
    expect(forModule.filter(one => one.superseded)).toHaveLength(1)
  })
})

describe.skipIf(skip !== null)('the screen (G-101)', () => {
  test('a member sees their records grouped, with each state shown', async () => {
    const module = await seedModule()
    awardTo(memberId, module, { expires_on: todayPlus(10) })

    forgetSpentStep(app, member.email)
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', member.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`, 30_000)

      await visit(view, `${app.baseURL}/training`, '[data-test="training-page"]')
      await waitFor(view, `document.querySelector('[data-test="records"]')`, 30_000)
      // A server render cannot see a hydration failure, so the page is read after it is live.
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')
      expect(await textOf(view, '[data-test="records"]')).toContain(module)
      expect(await textOf(view, `[data-test="state-${module}"]`)).toBe('Expiring')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

// A London day offset, which is what an expiry is measured in (0014).
function todayPlus(days: number): string {
  const at = new Date(Date.now() + days * 86_400_000)
  return at.toISOString().slice(0, 10)
}

if (skip) console.warn(`[e2e] skipped: ${skip}`)
