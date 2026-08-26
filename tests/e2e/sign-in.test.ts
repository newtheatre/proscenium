import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { generatePassword, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

// A fresh synthetic person per run, so the suite never depends on what a previous run left.
const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
// generatePassword returns a uuid-based string, comfortably over the shipped minimum.
const password = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function post(path: string, body: unknown, cookie?: string): Promise<Response> {
  return fetch(`${app.baseURL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
}

describe.skipIf(skip !== null)('registering and signing in (A-101, A-103, 0007)', () => {
  let cookie = ''

  test('an address registers', async () => {
    const response = await post('/api/auth/register', { email: person.email, name: person.name, password })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
  })

  // Enumeration safety: a taken address answers exactly as a free one does.
  test('registering the same address again is indistinguishable', async () => {
    const response = await post('/api/auth/register', { email: person.email, name: person.name, password })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
  })

  test('a wrong password is refused', async () => {
    const response = await post('/api/auth/sign-in', { email: person.email, password: 'not the password' })
    expect(response.status).toBe(401)
  })

  test('an address that was never registered is refused the same way', async () => {
    const stranger = syntheticPerson(999_999)
    const response = await post('/api/auth/sign-in', { email: stranger.email, password })
    expect(response.status).toBe(401)
  })

  test('the right password signs in and seals a session', async () => {
    const response = await post('/api/auth/sign-in', { email: person.email, password })
    expect(response.status).toBe(200)
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('nnt-session')
    cookie = setCookie.split(';')[0]!
  })

  test('the session reads back from the account, not the cookie', async () => {
    const response = await fetch(`${app.baseURL}/api/auth/session`, { headers: { cookie } })
    expect(await response.json()).toMatchObject({ signedIn: true, user: { email: person.email } })
  })

  test('signing out ends it', async () => {
    await post('/api/auth/sign-out', {}, cookie)
    const response = await fetch(`${app.baseURL}/api/auth/session`)
    expect(await response.json()).toMatchObject({ signedIn: false })
  })

  test('a password under the configured minimum is refused, quoting the rule', async () => {
    const other = syntheticPerson(888_888)
    const response = await post('/api/auth/register', { email: other.email, name: other.name, password: 'short' })
    expect(response.status).toBe(400)
    expect((await response.json()).statusMessage ?? '').toMatch(/at least \d+ characters/)
  })

  // Refused by the schema before any hashing happens, which is what the outer bound is for.
  test('an absurdly long password is refused before it is hashed', async () => {
    const other = syntheticPerson(777_777)
    const response = await post('/api/auth/register', { email: other.email, name: other.name, password: 'x'.repeat(5000) })
    expect(response.status).toBe(400)
  })

  test('a Workspace address cannot register with a password (0008)', async () => {
    const response = await post('/api/auth/register', {
      email: 'someone.synthetic@newtheatre.org.uk', name: 'Synthetic Officer (test)', password,
    })
    expect(response.status).toBe(400)
    expect((await response.json()).statusMessage ?? '').toMatch(/Google/i)
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
