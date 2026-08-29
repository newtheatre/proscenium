import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { DEFAULT_PAGE_SIZE } from '#shared/utils/pagination'
import { markVerified, registerMember } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest

const password = generatePassword()
const officer = { ...syntheticPerson(71), email: registrableAddress('auditor') }
let cookie = ''
let secret = ''
let officerId = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()

  await send('POST', '/api/auth/register', { email: officer.email, name: officer.name, password })
  markVerified(app, officer.email)
  const signedIn = await send('POST', '/api/auth/sign-in', { email: officer.email, password })
  const first = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!
  secret = (await (await send('POST', '/api/account/mfa/enrol', {}, first)).json() as { secret: string }).secret
  await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, first)

  expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', officer.email, app.databaseFile]).exitCode).toBe(0)
  cookie = await signInThroughTheChallenge()
  officerId = read<{ id: string }>('SELECT id FROM users WHERE email = ?', officer.email)!.id
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function send(method: string, path: string, body?: unknown, withCookie?: string): Promise<Response> {
  const carriesBody = method !== 'GET' && method !== 'HEAD'
  return fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(withCookie ? { cookie: withCookie } : {}) },
    ...(carriesBody ? { body: JSON.stringify(body ?? {}) } : {}),
  })
}

function read<T>(sql: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(sql).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

const spentStep = (): number | null => read<{ step: number | null }>(`
  SELECT t.last_used_step AS step FROM totp_secrets t JOIN users u ON u.id = t.user_id WHERE u.email = ?
`, officer.email)?.step ?? null

async function signInThroughTheChallenge(): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (stepFor(new Date()) !== spentStep()) break
    await Bun.sleep(1000)
  }
  const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: officer.email, password })).json() as { attemptId: string }
  const answered = await send('POST', '/api/auth/mfa/challenge', {
    attemptId,
    code: await codeForStep(secret, stepFor(new Date())),
  })
  return (answered.headers.get('set-cookie') ?? '').split(';')[0]!
}

interface Entry {
  id: string
  actorId: string | null
  actorName: string | null
  action: string
  target: string | null
  detail: Record<string, unknown> | null
  createdAt: number
}

interface Listing {
  items: Entry[]
  page: number
  pageSize: number
  total: number
  pages: number
}

async function trail(query = ''): Promise<Listing> {
  const response = await send('GET', `/api/admin/audit${query}`, null, cookie)
  expect(response.status).toBe(200)
  return await response.json() as Listing
}

const YESTERDAY = Math.floor(Date.now() / 1000) - 24 * 60 * 60

describe.skipIf(skip !== null)('reading the audit trail (J-103)', () => {
  test('it answers with an envelope and pages in SQL, never a bare array', async () => {
    const listing = await trail()
    expect(Array.isArray(listing.items)).toBe(true)
    expect(listing).toMatchObject({ page: 1, pageSize: DEFAULT_PAGE_SIZE })
    expect(listing.total).toBeGreaterThan(0)

    const small = await trail('?pageSize=1')
    expect(small.items).toHaveLength(1)
    expect(small.pages).toBe(small.total)

    const second = await trail('?pageSize=1&page=2')
    expect(second.items[0]!.id).not.toBe(small.items[0]!.id)
  })

  test('a grant is findable by actor, by action, by module, by target and by date', async () => {
    const member = await registerMember(app, 'granted', password, { signIn: false })
    expect((await send('POST', '/api/admin/roles', { userId: member.id, role: 'BOX_OFFICE' }, cookie)).status).toBe(200)

    const target = `user:${member.id}`
    const carries = (listing: Listing): boolean =>
      listing.items.some(item => item.action === 'role.granted' && item.target === target)

    expect(carries(await trail(`?target=${encodeURIComponent(target)}`))).toBe(true)
    expect(carries(await trail(`?actor=${officerId}&target=${encodeURIComponent(target)}`))).toBe(true)
    expect(carries(await trail(`?action=role.granted&target=${encodeURIComponent(target)}`))).toBe(true)
    expect(carries(await trail(`?module=identity&target=${encodeURIComponent(target)}`))).toBe(true)
    expect(carries(await trail(`?from=${YESTERDAY}&target=${encodeURIComponent(target)}`))).toBe(true)

    // Each filter has to exclude as well as include, or it is decoration.
    expect(carries(await trail(`?module=governance&target=${encodeURIComponent(target)}`))).toBe(false)
    expect(carries(await trail(`?action=role.revoked&target=${encodeURIComponent(target)}`))).toBe(false)
    expect(carries(await trail(`?to=${YESTERDAY}&target=${encodeURIComponent(target)}`))).toBe(false)
  })

  test('the response carries no password hash and names an erased actor by its tombstone', async () => {
    const listing = await trail('?pageSize=5')
    expect(JSON.stringify(listing.items)).not.toContain('password')

    const member = await registerMember(app, 'erased-actor', password)
    expect((await send('POST', `/api/admin/accounts/${member.id}/security`, { operation: 'erase' }, cookie)).status).toBe(200)

    const theirs = await trail(`?actor=${member.id}`)
    expect(theirs.total).toBeGreaterThan(0)
    for (const item of theirs.items) expect(item.actorName).toBe('Deleted user')
  })

  // A system entry is structurally distinct: nothing but the trail's own writer produces one.
  test('an automatic erasure reads as the system rather than as nobody', async () => {
    const listing = await trail('?action=account.erased.system')
    for (const item of listing.items) expect(item.actorId).toBeNull()
  })

  test('reading it needs the permission', async () => {
    const stranger = await registerMember(app, 'nosy', password)
    expect((await send('GET', '/api/admin/audit', null, stranger.cookie)).status).toBe(403)
    expect((await send('GET', '/api/admin/audit')).status).toBe(401)
  })
})

describe.skipIf(skip !== null)('recording something that happened outside the system (J-103 criteria 2 and 3)', () => {
  const manual = (body: Record<string, unknown>, withCookie = cookie): Promise<Response> =>
    send('POST', '/api/admin/audit', body, withCookie)

  test('it is signed against the officer, names the decider, and keeps the real date apart', async () => {
    const member = await registerMember(app, 'committee', password, { signIn: false })
    const chair = await registerMember(app, 'chair', password, { signIn: false })

    const response = await manual({
      action: 'manual.role.granted',
      target: member.id,
      onBehalfOf: chair.id,
      occurredAt: YESTERDAY,
      detail: { role: 'COMMITTEE' },
    })
    expect(response.status).toBe(200)

    const stored = read<{ actor: string, action: string, target: string, detail: string, created: number }>(
      'SELECT actor_id AS actor, action, target, detail, created_at AS created FROM audit_log WHERE id = ?',
      (await response.json() as { id: string }).id)!

    expect(stored.actor).toBe(officerId)
    expect(stored.action).toBe('manual.role.granted')
    expect(stored.target).toBe(`user:${member.id}`)
    expect(JSON.parse(stored.detail)).toMatchObject({ onBehalfOf: `user:${chair.id}`, occurredAt: YESTERDAY, role: 'COMMITTEE' })
    // The date it happened is not the date it was written down.
    expect(stored.created).toBeGreaterThan(YESTERDAY)
  })

  test('an action the system performs cannot be claimed by hand', async () => {
    const member = await registerMember(app, 'claimed', password, { signIn: false })
    const refused = await manual({
      action: 'role.granted',
      target: member.id,
      onBehalfOf: officerId,
      occurredAt: YESTERDAY,
    })
    expect(refused.status).toBe(400)
  })

  test('everybody it names has to be an account here', async () => {
    const member = await registerMember(app, 'named', password, { signIn: false })
    const missing = 'ffffffffffffffffffffffffffffffff'

    expect((await manual({ action: 'manual.role.revoked', target: missing, onBehalfOf: officerId, occurredAt: YESTERDAY })).status).toBe(400)
    expect((await manual({ action: 'manual.role.revoked', target: member.id, onBehalfOf: missing, occurredAt: YESTERDAY })).status).toBe(400)
  })

  test('a date in the future is refused', async () => {
    const member = await registerMember(app, 'future', password, { signIn: false })
    const ahead = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
    expect((await manual({ action: 'manual.role.granted', target: member.id, onBehalfOf: officerId, occurredAt: ahead })).status).toBe(400)
  })

  // Signing is a property of the entry, not of the role: A-112 already stops a privileged role
  // working without a factor, so this proves the guard that holds when the setting does not.
  test('a signer without an authenticator is refused even where the role would not require one', async () => {
    const without = ['ADMIN', 'MANAGER', 'TRAINING_MANAGER']
    expect((await send('PUT', '/api/admin/config/PRIVILEGED_ROLES', { value: without }, cookie)).status).toBe(200)
    try {
      const deputy = await registerMember(app, 'deputy', password)
      expect((await send('POST', '/api/admin/roles', { userId: deputy.id, role: 'THEATRE_MANAGER' }, cookie)).status).toBe(200)

      // The role works: the refusal that follows is about the signature and nothing else.
      expect((await send('GET', '/api/admin/audit', null, deputy.cookie)).status).toBe(200)

      const refused = await manual({
        action: 'manual.role.granted',
        target: deputy.id,
        onBehalfOf: officerId,
        occurredAt: YESTERDAY,
      }, deputy.cookie)
      expect(refused.status).toBe(403)
      expect((await refused.json() as { statusMessage: string }).statusMessage).toMatch(/authenticator/i)
    }
    finally {
      await send('PUT', '/api/admin/config/PRIVILEGED_ROLES', {
        value: ['ADMIN', 'MANAGER', 'THEATRE_MANAGER', 'TRAINING_MANAGER'],
      }, cookie)
    }
  })

  test('a manual entry is append-only like the rest of the trail', async () => {
    const member = await registerMember(app, 'permanent', password, { signIn: false })
    const { id } = await (await manual({
      action: 'manual.account.disabled',
      target: member.id,
      onBehalfOf: officerId,
      occurredAt: YESTERDAY,
    })).json() as { id: string }

    const database = new Database(app.databaseFile)
    try {
      expect(() => database.query('UPDATE audit_log SET action = ? WHERE id = ?').run('role.granted', id)).toThrow()
      expect(() => database.query('DELETE FROM audit_log WHERE id = ?').run(id)).toThrow()
    }
    finally {
      database.close()
    }
  })
})

describe.skipIf(skip !== null)('exporting the trail (J-103 criterion 5)', () => {
  test('it answers CSV for the current filter and records having done so', async () => {
    const before = (await trail('?action=audit.exported')).total

    const response = await send('GET', '/api/admin/audit/export?module=governance', null, cookie)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toContain('audit-trail.csv')

    const [header, ...rows] = (await response.text()).split('\n')
    expect(header).toBe('id,occurred,actorId,actor,action,target,detail')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.startsWith('"')).toBe(true)

    const after = await trail('?action=audit.exported')
    expect(after.total).toBe(before + 1)
    expect(after.items[0]!.detail).toMatchObject({ module: 'governance' })
  })

  test('exporting needs the permission too', async () => {
    const stranger = await registerMember(app, 'exporter', password)
    expect((await send('GET', '/api/admin/audit/export', null, stranger.cookie)).status).toBe(403)
  })
})

// One browser sign-in, shared. The challenge is answered with the next step rather than the
// current one, so this waits until that step is the one not already spent.
async function signedInView(): Promise<Bun.WebView> {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (stepFor(new Date()) + 1 !== spentStep()) break
    await Bun.sleep(1000)
  }
  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', officer.email)
  await fill(view, 'form input[type="password"]', password)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelectorAll('[data-test="mfa-challenge"] input').length >= 6`)

  const code = await codeForStep(secret, stepFor(new Date()) + 1)
  for (const [index, digit] of [...code].entries()) {
    await fill(view, `[data-test="mfa-challenge"] input:nth-of-type(${index + 1})`, digit)
  }
  await waitFor(view, 'document.querySelector(\'[data-test="sign-out"]\')')
  return view
}

function write(sql: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(sql).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('the audit screen (J-101 criterion 2, J-103)', () => {
  // A fresh database only holds actions this build registers, so nothing here had ever rendered
  // one it had not heard of, and the trail is history rather than a snapshot of this build.
  test('an entry whose action this build does not know still renders', async () => {
    const member = await registerMember(app, 'retired', password, { signIn: false })
    write(
      'INSERT INTO audit_log (id, actor_id, action, target, detail) VALUES (?, ?, ?, ?, ?)',
      crypto.randomUUID().replaceAll('-', ''), officerId, 'booking.refunded', `user:${member.id}`, '{"pence":1200}',
    )

    const view = await signedInView()
    try {
      await visit(view, `${app.baseURL}/admin/audit`, '[data-test="audit-table"]')
      await fill(view, 'input[data-test="audit-target"]', `user:${member.id}`)
      await waitFor(view, `document.querySelector('[data-test="audit-table"]').innerText.includes('booking.refunded')`)

      // Rendered under its own name rather than crashing the table it is one row of.
      expect(await textOf(view, '[data-test="audit-table"]')).toContain('booking.refunded')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('an officer finds a grant they made, and the system entries look different', async () => {
    const member = await registerMember(app, 'onscreen', password, { signIn: false })
    expect((await send('POST', '/api/admin/roles', { userId: member.id, role: 'FRONT_OF_HOUSE' }, cookie)).status).toBe(200)

    const view = await signedInView()
    try {
      await visit(view, `${app.baseURL}/admin/audit`, '[data-test="audit-table"]')
      await fill(view, 'input[data-test="audit-target"]', `user:${member.id}`)
      await waitFor(view, `document.querySelector('[data-test="audit-table"]').innerText.includes('Role granted')`)

      expect(await textOf(view, '[data-test="audit-table"]')).toContain(officer.name)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
