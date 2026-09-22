import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { ROLES, defaultRoleExpiry } from '#shared/utils/roles'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { forgetSpentStep, markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, fillPin, openView, pickPerson, skipReason, startApp, textOf, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// The role register, end to end (A-131). What it grants, what it refuses and what the page says
// are the same three facts, so they are asserted against the same running application.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

const password = generatePassword()
const officer = { ...syntheticPerson(71), email: registrableAddress('register-officer') }
let cookie = ''
let secret = ''

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
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function send(method: string, path: string, body?: unknown, withCookie?: string): Promise<Response> {
  const carriesBody = method !== 'GET' && method !== 'HEAD' && method !== 'DELETE'
  return fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(withCookie ? { cookie: withCookie } : {}) },
    ...(carriesBody ? { body: JSON.stringify(body ?? {}) } : {}),
  })
}

async function signInThroughTheChallenge(): Promise<string> {
  forgetSpentStep(app, officer.email)
  const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: officer.email, password })).json() as { attemptId: string }
  const answered = await send('POST', '/api/auth/mfa/challenge', {
    attemptId,
    code: await codeForStep(secret, stepFor(new Date())),
  })
  return (answered.headers.get('set-cookie') ?? '').split(';')[0]!
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

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

interface Holder {
  id: string
  userId: string
  name: string
  email: string
  role: string
  expiresAt: number | null
  grantedAt: number
  grantedBy: string | null
  note: string | null
  live: boolean
  disabled: boolean
}

interface Register {
  items: Holder[]
  page: number
  pageSize: number
  total: number
  pages: number
  counts: Record<string, number>
  permanent: Holder[]
  lapsedHidden: number
}

async function register(query = ''): Promise<Register> {
  const response = await send('GET', `/api/admin/roles/register${query}`, null, cookie)
  expect(response.status).toBe(200)
  return await response.json() as Register
}

async function person(prefix: string): Promise<{ id: string, email: string, name: string }> {
  const made = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress(prefix)
  await send('POST', '/api/auth/register', { email, name: made.name, password })
  markVerified(app, email)
  return { id: read<{ id: string }>('SELECT id FROM users WHERE email = ?', email)!.id, email, name: made.name }
}

describe.skipIf(skip !== null)('the role register answers who holds what (A-131 criteria 1 to 3)', () => {
  test('it counts live holders for every role in one answer, and pages the holders', async () => {
    const holder = await person('counted')
    expect((await send('POST', '/api/admin/roles', { userId: holder.id, role: 'BAR_MANAGER' }, cookie)).status).toBe(200)

    const listing = await register('?role=is:BAR_MANAGER')
    expect(listing.items.map(item => item.email)).toContain(holder.email)
    expect(listing.counts.BAR_MANAGER).toBeGreaterThanOrEqual(1)
    expect(listing.counts.ADMIN).toBeGreaterThanOrEqual(1)
    expect(listing).toMatchObject({ page: 1 })
    expect(Object.keys(listing.counts).every(role => (ROLES as readonly string[]).includes(role))).toBe(true)
  })

  test('the response names nobody it was not asked to, and carries no password hash', async () => {
    const listing = await register('?role=is:ADMIN')
    const serialised = JSON.stringify(listing.items)
    expect(serialised).not.toContain('password')
    expect(serialised).not.toContain('googleSub')
    expect(listing.items[0]).toHaveProperty('grantedAt')
  })

  test('a lapsed grant is hidden, counted, and there when asked for', async () => {
    const holder = await person('lapsing')
    expect((await send('POST', '/api/admin/roles', { userId: holder.id, role: 'SAFETY_OFFICER' }, cookie)).status).toBe(200)
    write('UPDATE role_grants SET expires_at = ? WHERE user_id = ?', Math.floor(Date.now() / 1000) - 60, holder.id)

    const hidden = await register('?role=is:SAFETY_OFFICER')
    expect(hidden.items.map(item => item.email)).not.toContain(holder.email)
    expect(hidden.lapsedHidden).toBeGreaterThanOrEqual(1)
    expect(hidden.counts.SAFETY_OFFICER ?? 0).toBe(0)

    const asked = await register('?role=is:SAFETY_OFFICER&includeLapsed=true')
    expect(asked.items.map(item => item.email)).toContain(holder.email)
    expect(asked.items.find(item => item.email === holder.email)?.live).toBe(false)
    expect((await register('?role=is:SAFETY_OFFICER&lapsed=true')).lapsedHidden).toBe(0)
  })

  test('permanent grants are a standing report, whatever role is being looked at (criterion 6)', async () => {
    const holder = await person('forever')
    expect((await send('POST', '/api/admin/roles', { userId: holder.id, role: 'COMMITTEE', expiresAt: null }, cookie)).status).toBe(200)

    const listing = await register('?role=is:BOX_OFFICE')
    expect(listing.permanent.map(item => item.email)).toContain(holder.email)
    expect(listing.permanent.every(item => item.expiresAt === null)).toBe(true)
  })

  test('an unknown role, an undeclared sort and a role list past its cap are all refused', async () => {
    expect((await send('GET', '/api/admin/roles/register?role=is:SUPREME_LEADER', null, cookie)).status).toBe(400)
    expect((await send('GET', '/api/admin/roles/register?sort=note', null, cookie)).status).toBe(400)
    expect((await send('GET', `/api/admin/roles/register?role=any:${[...ROLES, 'ADMIN'].join(',')}`, null, cookie)).status).toBe(400)
  })

  test('reading the register needs a permission, and a signed-out caller never reaches it', async () => {
    expect((await send('GET', '/api/admin/roles/register')).status).toBe(401)
    const bystander = await person('bystander')
    const theirs = (await (await send('POST', '/api/auth/sign-in', { email: bystander.email, password })).headers.get('set-cookie') ?? '').split(';')[0]!
    expect((await send('GET', '/api/admin/roles/register', null, theirs)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('a grant carries its expiry, its note and its history (A-118, A-131 criterion 5)', () => {
  test('an expiry can be picked rather than taken, and a note is kept on the grant', async () => {
    const holder = await person('noted')
    const picked = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
    const granted = await send('POST', '/api/admin/roles', {
      userId: holder.id,
      role: 'TREASURER',
      expiresAt: picked,
      note: 'Standing in until the by-election',
    }, cookie)

    expect(granted.status).toBe(200)
    expect((await granted.json()).expiresAt).toBe(picked)

    const row = read<{ expires_at: number, note: string }>('SELECT expires_at, note FROM role_grants WHERE user_id = ? AND role = ?', holder.id, 'TREASURER')!
    expect(row.expires_at).toBe(picked)
    expect(row.note).toBe('Standing in until the by-election')

    const listing = await register('?role=is:TREASURER')
    expect(listing.items.find(item => item.email === holder.email)?.note).toBe('Standing in until the by-election')
  })

  test('a note over five hundred characters is refused rather than truncated', async () => {
    const holder = await person('verbose')
    const response = await send('POST', '/api/admin/roles', { userId: holder.id, role: 'COMMITTEE', note: 'x'.repeat(501) }, cookie)
    expect(response.status).toBe(400)
  })

  // The unique key on (user, role) means a lapsed grant is still a row, so a renewal that did
  // nothing would be silent and total: the role simply never came back.
  test('re-granting a lapsed role renews it rather than doing nothing', async () => {
    const holder = await person('renewed')
    expect((await send('POST', '/api/admin/roles', { userId: holder.id, role: 'FOH_MANAGER' }, cookie)).status).toBe(200)
    write('UPDATE role_grants SET expires_at = ?, expiry_warned_at = ? WHERE user_id = ?', Math.floor(Date.now() / 1000) - 60, Math.floor(Date.now() / 1000) - 120, holder.id)

    const again = await send('POST', '/api/admin/roles', { userId: holder.id, role: 'FOH_MANAGER' }, cookie)
    expect(again.status).toBe(200)

    const row = read<{ expires_at: number, expiry_warned_at: number | null }>('SELECT expires_at, expiry_warned_at FROM role_grants WHERE user_id = ? AND role = ?', holder.id, 'FOH_MANAGER')!
    expect(row.expires_at).toBe(defaultRoleExpiry(new Date()))
    // Changing the expiry re-arms A-119's warning, which would otherwise never fire again.
    expect(row.expiry_warned_at).toBeNull()

    expect((await register('?role=is:FOH_MANAGER')).items.map(item => item.email)).toContain(holder.email)
  })

  test('a renewal is audited as a from and a to, and the note itself never reaches the trail (0011)', async () => {
    const holder = await person('audited')
    const first = Math.floor(Date.now() / 1000) + 10 * 24 * 60 * 60
    const second = Math.floor(Date.now() / 1000) + 20 * 24 * 60 * 60
    await send('POST', '/api/admin/roles', { userId: holder.id, role: 'ACCESSIBILITY_OFFICER', expiresAt: first }, cookie)
    await send('POST', '/api/admin/roles', { userId: holder.id, role: 'ACCESSIBILITY_OFFICER', expiresAt: second, note: 'Confirmed by the committee' }, cookie)

    const entry = read<{ action: string, detail: string }>(
      'SELECT action, detail FROM audit_log WHERE target = ? AND action = ? ORDER BY created_at DESC',
      `user:${holder.id}`,
      'role.renewed',
    )
    expect(entry).toBeDefined()
    const detail = JSON.parse(entry!.detail)
    expect(detail.changes.expiresAt).toEqual({ from: first, to: second })
    expect(detail.noted).toBe(true)
    expect(JSON.stringify(detail)).not.toContain('Confirmed by the committee')
  })

  // A-120 criterion 1 names expiring the last administrator alongside removing them.
  test('the last administrator cannot be given an expiry date', async () => {
    const self = read<{ id: string }>('SELECT id FROM users WHERE email = ?', officer.email)!.id
    const response = await send('POST', '/api/admin/roles', {
      userId: self,
      role: 'ADMIN',
      expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    }, cookie)

    expect(response.status).toBe(409)
    expect((await response.json()).statusMessage ?? '').toMatch(/last IT Manager/i)
    expect(read<{ expires_at: number | null }>('SELECT expires_at FROM role_grants WHERE user_id = ? AND role = ?', self, 'ADMIN')!.expires_at).toBeNull()
  })
})

// One browser backs every view, so a console screen is reached by signing in through the real
// form and its challenge, the way an officer does.
async function signedInView(): Promise<Bun.WebView> {
  const view = await openView({ width: 1280, height: 800 })
  await view.navigate(`${app.baseURL}/sign-in`)
  await waitFor(view, `document.querySelector('form input[type="email"]')`)
  await fill(view, 'form input[type="email"]', officer.email)
  await fill(view, 'form input[type="password"]', password)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelectorAll('[data-test="mfa-challenge"] input').length >= 6`)
  forgetSpentStep(app, officer.email)
  await fillPin(view, '[data-test="mfa-challenge"] input', await codeForStep(secret, stepFor(new Date())))
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)
  return view
}

describe.skipIf(skip !== null)('the page grants and revokes without the account directory (criterion 4)', () => {
  test('a role is granted and revoked from the register itself', async () => {
    const holder = await person('onscreen')
    const view = await signedInView()
    try {
      await view.navigate(`${app.baseURL}/people/roles?role=is:BOX_OFFICE`)
      await waitFor(view, `document.querySelector('[data-test="role-tiles"]')`)
      expect(await textOf(view, '[data-test="role-tiles"]')).toContain('Box office')

      await pickPerson(view, '[data-test="grant-person"]', holder.email.split('@')[0]!, holder.name)
      await click(view, '[data-test="grant-submit"]')
      await waitFor(view, `document.body.innerText.includes(${JSON.stringify(holder.name)})`)

      expect(read<{ role: string }>('SELECT role FROM role_grants WHERE user_id = ?', holder.id)?.role).toBe('BOX_OFFICE')

      // K-123: the press opens the confirmation, and the named verb is what revokes.
      await click(view, `[data-test="revoke-${holder.id}-BOX_OFFICE"]`)
      await waitFor(view, `document.querySelector('[data-test="confirm-revoke-role-verb"]')`)
      await click(view, '[data-test="confirm-revoke-role-verb"]')
      await waitFor(view, `!document.body.innerText.includes(${JSON.stringify(holder.name)})`)
      expect(read<{ role: string }>('SELECT role FROM role_grants WHERE user_id = ?', holder.id)).toBeUndefined()
    }
    finally {
      view.close()
    }
  }, BOOT_TIMEOUT_MS)

  test('the register refuses the last administrator out loud rather than silently (criterion 7)', async () => {
    const view = await signedInView()
    try {
      await view.navigate(`${app.baseURL}/people/roles?role=is:ADMIN`)
      await waitFor(view, `document.querySelector('[data-test="holders-table"]')`)
      const self = read<{ id: string }>('SELECT id FROM users WHERE email = ?', officer.email)!.id

      // K-123: the refusal renders in the confirmation, not in a page alert behind its overlay.
      await click(view, `[data-test="revoke-${self}-ADMIN"]`)
      await waitFor(view, `document.querySelector('[data-test="confirm-revoke-role-verb"]')`)
      await click(view, '[data-test="confirm-revoke-role-verb"]')
      await waitFor(view, `document.querySelector('[data-test="confirm-revoke-role-failure"]')`)
      expect(await textOf(view, '[data-test="confirm-revoke-role-failure"]')).toMatch(/last IT Manager/i)
    }
    finally {
      view.close()
    }
  }, BOOT_TIMEOUT_MS)

  test('the account page still reaches the same grants, and links to the register', async () => {
    const self = read<{ id: string }>('SELECT id FROM users WHERE email = ?', officer.email)!.id
    const view = await signedInView()
    try {
      await view.navigate(`${app.baseURL}/people/accounts/${self}`)
      await waitFor(view, `document.querySelector('[data-test="grants"]')`)
      expect(await textOf(view, '[data-test="grants"]')).toContain('ADMIN')
      await waitFor(view, `document.querySelector('[data-test="open-register"]')`)
    }
    finally {
      view.close()
    }
  }, BOOT_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
