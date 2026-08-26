import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { defaultRoleExpiry } from '#shared/utils/roles'
import { generatePassword, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

const officer = syntheticPerson(Math.floor(Math.random() * 1_000_000))
const subject = syntheticPerson(Math.floor(Math.random() * 1_000_000) + 1)
const password = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

async function register(person: { email: string, name: string }): Promise<void> {
  await fetch(`${app.baseURL}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...person, password }),
  })
}

async function signIn(email: string): Promise<string> {
  const response = await fetch(`${app.baseURL}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return (response.headers.get('set-cookie') ?? '').split(';')[0]!
}

function send(method: string, path: string, body: unknown, cookie?: string): Promise<Response> {
  return fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
}

describe.skipIf(skip !== null)('roles and the guards over them (A-118, A-120, 0009)', () => {
  let cookie = ''
  let subjectId = ''

  beforeAll(async () => {
    if (skip) return
    await register(officer)
    await register(subject)
    cookie = await signIn(officer.email)
    const session = await (await fetch(`${app.baseURL}/api/auth/session`, { headers: { cookie: await signIn(subject.email) } })).json()
    subjectId = session.user.id
  }, BOOT_TIMEOUT_MS)

  // Guards fail closed: an ordinary member holds nothing, so nothing is reachable.
  test('an account with no roles cannot grant one', async () => {
    const response = await send('POST', '/api/admin/roles', { userId: subjectId, role: 'MANAGER' }, cookie)
    expect(response.status).toBe(403)
  })

  test('and cannot read another account\'s roles', async () => {
    const response = await fetch(`${app.baseURL}/api/admin/roles?userId=${subjectId}`, { headers: { cookie } })
    expect(response.status).toBe(403)
  })

  test('a signed-out caller is refused before permissions are even considered', async () => {
    expect((await send('POST', '/api/admin/roles', { userId: subjectId, role: 'MANAGER' })).status).toBe(401)
  })

  // The first administrator cannot be granted through the API, because granting needs the
  // permission that being one confers. The bootstrap script is the only way in (A-120).
  test('the gate: an administrator grants a role that expires at the committee year', async () => {
    const bootstrap = Bun.spawnSync(['bun', 'scripts/grant-admin.ts', officer.email, app.databaseFile])
    expect(bootstrap.exitCode).toBe(0)

    // The session was sealed before the grant existed, and permissions are read fresh.
    const granted = await send('POST', '/api/admin/roles', { userId: subjectId, role: 'MANAGER' }, cookie)
    expect(granted.status).toBe(200)
    const body = await granted.json()
    expect(body.expiresAt).toBe(defaultRoleExpiry(new Date()))

    const read = await fetch(`${app.baseURL}/api/admin/roles?userId=${subjectId}`, { headers: { cookie } })
    expect(await read.json()).toMatchObject({ roles: [{ role: 'MANAGER' }] })
  })

  test('an unknown role is refused by the schema once the caller is allowed in', async () => {
    const response = await send('POST', '/api/admin/roles', { userId: subjectId, role: 'SUPREME_LEADER' }, cookie)
    expect(response.status).toBe(400)
  })

  test('the last administrator cannot be revoked (A-120)', async () => {
    const session = await (await fetch(`${app.baseURL}/api/auth/session`, { headers: { cookie } })).json()
    const response = await send('DELETE', '/api/admin/roles', { userId: session.user.id, role: 'ADMIN' }, cookie)
    expect(response.status).toBe(409)
    expect((await response.json()).statusMessage ?? '').toMatch(/last administrator/i)
  })

  // "Usable" excludes disabled accounts, so a disabled second administrator must not satisfy
  // the guard (A-120 criterion 3).
  test('a disabled second administrator does not satisfy the last-admin guard', async () => {
    const spare = syntheticPerson(Math.floor(Math.random() * 1_000_000) + 2)
    await register(spare)
    const spareCookie = await signIn(spare.email)
    const spareSession = await (await fetch(`${app.baseURL}/api/auth/session`, { headers: { cookie: spareCookie } })).json()

    expect((await send('POST', '/api/admin/roles', { userId: spareSession.user.id, role: 'ADMIN' }, cookie)).status).toBe(200)

    // With a second live administrator the guard lets go.
    const session = await (await fetch(`${app.baseURL}/api/auth/session`, { headers: { cookie } })).json()
    const { Database } = await import('bun:sqlite')
    const database = new Database(app.databaseFile)
    database.query('UPDATE users SET disabled = 1 WHERE id = ?').run(spareSession.user.id)
    database.close()

    // Disabled, so it no longer counts and the guard holds again.
    const response = await send('DELETE', '/api/admin/roles', { userId: session.user.id, role: 'ADMIN' }, cookie)
    expect(response.status).toBe(409)
  })

  test('an ordinary role can be revoked', async () => {
    expect((await send('DELETE', '/api/admin/roles', { userId: subjectId, role: 'MANAGER' }, cookie)).status).toBe(200)
    const read = await fetch(`${app.baseURL}/api/admin/roles?userId=${subjectId}`, { headers: { cookie } })
    expect(await read.json()).toMatchObject({ roles: [] })
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
