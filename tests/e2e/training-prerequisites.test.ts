import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, openView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-108 and G-103 through the real routes. Direct edges only, a loop refused by naming it, and a
// catalogue that tells a member which of a module's prerequisites they already hold.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let cookie = ''

const password = generatePassword()
const member = { ...syntheticPerson(29), email: registrableAddress('catalogue-member') }
let memberId = ''
let memberCookie = ''
let department = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie

  await send('POST', '/api/auth/register', { email: member.email, name: member.name, password }, '')
  markVerified(app, member.email)
  memberId = read<{ id: string }>('SELECT id FROM users WHERE email = ?', member.email)!.id
  const signedIn = await send('POST', '/api/auth/sign-in', { email: member.email, password }, '')
  memberCookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!

  department = `PRE${suffix()}`
  await send('POST', '/api/admin/training/departments', { code: department, name: 'Prerequisites' })
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

async function addModule(over: Record<string, unknown> = {}): Promise<string> {
  const id = `PRE-${suffix()}`
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

const needs = (moduleId: string, requiresId: string): Promise<Response> =>
  send('POST', `/api/admin/training/modules/${moduleId}/prerequisites`, { requiresId })

describe.skipIf(skip !== null)('prerequisites are direct edges (G-108)', () => {
  test('an edge is declared and read back (criterion 1)', async () => {
    const gate = await addModule()
    const advanced = await addModule()
    expect((await needs(advanced, gate)).status).toBe(200)

    const listing = await (await send('GET', '/api/admin/training/modules')).json() as
      { items: { id: string, prerequisites: { requiresId: string }[] }[] }
    expect(listing.items.find(one => one.id === advanced)?.prerequisites.map(edge => edge.requiresId))
      .toEqual([gate])
  })

  test('a module cannot require itself (criterion 4)', async () => {
    const module = await addModule()
    expect((await needs(module, module)).status).toBe(409)
  })

  test('the same edge cannot be declared twice', async () => {
    const gate = await addModule()
    const advanced = await addModule()
    expect((await needs(advanced, gate)).status).toBe(200)
    expect((await needs(advanced, gate)).status).toBe(409)
  })

  test('a brief cannot be required (criterion 3)', async () => {
    const brief = await addModule({ kind: 'BRIEF' })
    const advanced = await addModule()

    const refused = await needs(advanced, brief)
    expect(refused.status).toBe(409)
    expect((await refused.json() as { statusMessage?: string }).statusMessage ?? '').toContain('brief')
  })

  // The other end of criterion 3: a module already required cannot quietly become a brief.
  test('a required module cannot be turned into a brief', async () => {
    const gate = await addModule()
    const advanced = await addModule()
    await needs(advanced, gate)

    const refused = await send('PUT', `/api/admin/training/modules/${gate}`, {
      department,
      kind: 'BRIEF',
      name: `Module ${gate}`,
    })
    expect(refused.status).toBe(409)
    expect(read<{ kind: string }>('SELECT kind FROM modules WHERE id = ?', gate)?.kind).toBe('MODULE')
  })

  test('an edge is withdrawn without touching what was earned under it', async () => {
    const gate = await addModule()
    const advanced = await addModule()
    const { id } = await (await needs(advanced, gate)).json() as { id: string }

    expect((await send('DELETE', `/api/admin/training/prerequisites/${id}`)).status).toBe(200)
    expect(read<{ n: number }>('SELECT count(*) n FROM module_prerequisites WHERE id = ?', id)?.n).toBe(0)
  })

  test('a member cannot declare or withdraw one', async () => {
    const gate = await addModule()
    const advanced = await addModule()
    expect((await send('POST', `/api/admin/training/modules/${advanced}/prerequisites`,
      { requiresId: gate }, memberCookie)).status).toBe(403)
    expect((await send('DELETE', '/api/admin/training/prerequisites/anything', undefined, memberCookie)).status)
      .toBe(403)
  })
})

describe.skipIf(skip !== null)('a loop is refused, and the refusal names it (G-108 criterion 2)', () => {
  test('a two-hop loop is refused', async () => {
    const first = await addModule()
    const second = await addModule()
    await needs(second, first)

    const refused = await needs(first, second)
    expect(refused.status).toBe(409)
    const said = (await refused.json() as { statusMessage?: string }).statusMessage ?? ''
    expect(said).toContain(first)
    expect(said).toContain(second)
  })

  test('a four-hop loop is refused, and every module in it is named', async () => {
    const a = await addModule()
    const b = await addModule()
    const c = await addModule()
    const d = await addModule()
    await needs(b, c)
    await needs(c, d)
    await needs(d, a)

    const refused = await needs(a, b)
    expect(refused.status).toBe(409)
    const said = (await refused.json() as { statusMessage?: string }).statusMessage ?? ''
    for (const module of [a, b, c, d]) expect(said).toContain(module)
  })

  test('a diamond is allowed, because it is not a loop', async () => {
    const base = await addModule()
    const left = await addModule()
    const right = await addModule()
    expect((await needs(left, base)).status).toBe(200)
    expect((await needs(right, base)).status).toBe(200)
  })
})

describe.skipIf(skip !== null)('the catalogue a member browses (G-103)', () => {
  test('a draft is invisible and a retired module stays readable (criteria 4 and 5)', async () => {
    const draft = await addModule({ status: 'DRAFT' })
    const retired = await addModule({ status: 'RETIRED' })

    const listing = await (await send('GET', '/api/training/modules', undefined, memberCookie)).json() as
      { items: { id: string, retired: boolean }[] }
    expect(listing.items.some(one => one.id === draft)).toBe(false)
    expect(listing.items.find(one => one.id === retired)?.retired).toBe(true)
  })

  test('each prerequisite is marked held or not for the person reading (criterion 2)', async () => {
    const gate = await addModule()
    const other = await addModule()
    const advanced = await addModule()
    await needs(advanced, gate)
    await needs(advanced, other)

    write(
      `INSERT INTO training_records (id, user_id, module_id, awarded_on, source) VALUES (?, ?, ?, ?, 'SIGNOFF')`,
      `tr-${suffix()}`, memberId, gate, '2026-09-01',
    )

    const listing = await (await send('GET', '/api/training/modules', undefined, memberCookie)).json() as
      { items: { id: string, prerequisites: { moduleId: string, held: boolean }[] }[] }
    const shown = listing.items.find(one => one.id === advanced)?.prerequisites ?? []
    expect(shown.find(need => need.moduleId === gate)?.held).toBe(true)
    expect(shown.find(need => need.moduleId === other)?.held).toBe(false)
  })

  // An expiring record still counts as held, which is the property every gate leans on.
  test('an expiring prerequisite is held and an expired one is not (criterion 2, G-101 criterion 3)', async () => {
    const expiring = await addModule()
    const expired = await addModule()
    const advanced = await addModule()
    await needs(advanced, expiring)
    await needs(advanced, expired)

    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
    write(
      `INSERT INTO training_records (id, user_id, module_id, awarded_on, expires_on, source)
       VALUES (?, ?, ?, '2026-09-01', ?, 'SIGNOFF')`,
      `tr-${suffix()}`, memberId, expiring, soon,
    )
    write(
      `INSERT INTO training_records (id, user_id, module_id, awarded_on, expires_on, source)
       VALUES (?, ?, ?, '2024-01-01', '2025-01-01', 'SIGNOFF')`,
      `tr-${suffix()}`, memberId, expired,
    )

    const listing = await (await send('GET', '/api/training/modules', undefined, memberCookie)).json() as
      { items: { id: string, prerequisites: { moduleId: string, held: boolean }[] }[] }
    const shown = listing.items.find(one => one.id === advanced)?.prerequisites ?? []
    expect(shown.find(need => need.moduleId === expiring)?.held).toBe(true)
    expect(shown.find(need => need.moduleId === expired)?.held).toBe(false)
  })

  test('a signed-out visitor gets nothing', async () => {
    expect((await send('GET', '/api/training/modules', undefined, '')).status).toBe(401)
  })

  test('the catalogue renders for a member', async () => {
    const module = await addModule({ name: 'Driving the desk' })
    const view = await openView()
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', member.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`, 30_000)

      await visit(view, `${app.baseURL}/training/catalogue`, '[data-test="catalogue-page"]')
      // A server render cannot see a hydration failure, so the page is read after it is live.
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')
      expect(await textOf(view, '[data-test="catalogue"]')).toContain(module)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
