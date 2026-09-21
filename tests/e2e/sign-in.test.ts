import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
// Without credentials the route correctly falls to its error branch, which is not what this
// test is checking. CI has no secrets for a redirect, so it says so rather than failing.
const googleConfigured = Boolean(process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID)
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

// A fresh synthetic person per run, so the suite never depends on what a previous run left. The
// address is registrable, because this one has to reach an account it can sign in to.
const person = { ...syntheticPerson(Math.floor(Math.random() * 1_000_000)), email: registrableAddress('signin') }
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
    markVerified(app, person.email)
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

  // Indistinguishable, body included: different wording is as good an oracle as a different
  // status. Timing is equalised structurally, by always running a verification (A-103).
  test('an unknown address and a wrong password are indistinguishable', async () => {
    const stranger = syntheticPerson(999_999)
    const unknown = await post('/api/auth/sign-in', { email: stranger.email, password })
    const wrong = await post('/api/auth/sign-in', { email: person.email, password: 'not the password' })
    expect(unknown.status).toBe(wrong.status)
    expect(await unknown.text()).toBe(await wrong.text())
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

  // K-128 criterion 2: an empty box used to read "Too small: expected string to have >=1
  // characters", which is zod's wording, not ours.
  test('an empty password is refused in the house voice', async () => {
    const response = await post('/api/auth/sign-in', { email: person.email, password: '' })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.statusMessage).toBe('Something on this form needs another look.')
    expect(body.data.fields.password).toBe('Type your password.')
  })

  test('an address that is not one is refused in the house voice', async () => {
    const response = await post('/api/auth/sign-in', { email: 'not-an-address', password })
    expect(response.status).toBe(400)
    expect((await response.json()).data.fields.email).toBe('Type the email address on your account.')
  })

  // The fallback no longer names parameters, so nothing on the wire tells a reader what a field
  // is called in the code.
  test('the refusal never names a field key', async () => {
    const response = await post('/api/auth/sign-in', {})
    expect(response.status).toBe(400)
    expect((await response.json()).statusMessage).not.toContain('password')
  })

  // Refused by the schema before any hashing happens, which is what the outer bound is for.
  test('an absurdly long password is refused before it is hashed', async () => {
    const other = syntheticPerson(777_777)
    const response = await post('/api/auth/register', { email: other.email, name: other.name, password: 'x'.repeat(5000) })
    expect(response.status).toBe(400)
  })

  // The round trip needs a real Google login, so what is checked here is that the route is
  // wired and asks for the right thing. The resolution it performs afterwards is unit tested.
  test.skipIf(!googleConfigured)('the Google route hands off to Google, scoped to the Workspace domain', async () => {
    const response = await fetch(`${app.baseURL}/auth/google`, { redirect: 'manual' })
    expect(response.status).toBe(302)
    const target = new URL(response.headers.get('location') ?? '')
    expect(target.host).toBe('accounts.google.com')
    expect(target.searchParams.get('hd')).toBe('newtheatre.org.uk')
    expect(target.searchParams.get('redirect_uri')).toBe(`${app.baseURL}/auth/google`)
    expect(target.searchParams.get('client_id')).toBeTruthy()
  })

  test('a Workspace address cannot register with a password (0008)', async () => {
    const response = await post('/api/auth/register', {
      email: 'someone.synthetic@newtheatre.org.uk', name: 'Synthetic Officer (test)', password,
    })
    expect(response.status).toBe(400)
    expect((await response.json()).statusMessage ?? '').toMatch(/Google/i)
  })
})

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

// The plaintext exists only in the message, so a test plants one whose hash it knows.
async function plantToken(email: string, kind: string, plaintext: string): Promise<void> {
  const hash = await sha256(plaintext)
  const database = new Database(app.databaseFile)
  try {
    const user = database.query('SELECT id FROM users WHERE email = ?').get(email) as { id: string }
    // One live token per user per kind, and registration already issued the verification one.
    database.query('DELETE FROM auth_tokens WHERE user_id = ? AND kind = ?').run(user.id, kind)
    database.query('INSERT INTO auth_tokens (id, user_id, kind, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(crypto.randomUUID().replaceAll('-', ''), user.id, kind, hash, Math.floor(Date.now() / 1000) + 3600)
  }
  finally {
    database.close()
  }
}

const newToken = (): string => `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')

// Registered and left as registration leaves it: unproven.
async function unproven(prefix: string): Promise<string> {
  const stranger = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress(prefix)
  expect((await post('/api/auth/register', { email, name: stranger.name, password })).status).toBe(200)
  return email
}

const signIn = (email: string, secret = password): Promise<Response> =>
  post('/api/auth/sign-in', { email, password: secret })

describe.skipIf(skip !== null)('an unverified address cannot sign in (0026)', () => {
  test('it is refused, and indistinguishable from a wrong password and an unknown address', async () => {
    const email = await unproven('unproven')

    const refused = await signIn(email)
    const wrong = await signIn(person.email, 'not the password')
    const unknown = await signIn(registrableAddress('nobody'))

    expect(refused.status).toBe(401)
    const body = await refused.text()
    expect(await wrong.text()).toBe(body)
    expect(await unknown.text()).toBe(body)
  })

  // Each of the four routes to a verified address is a way back for somebody who never got the
  // first email, which is what keeps the refusal from being a dead end.
  test('the verification link opens the door', async () => {
    const email = await unproven('by-link')
    const token = newToken()
    await plantToken(email, 'EMAIL_VERIFY', token)

    expect((await post('/api/auth/verify', { token })).status).toBe(200)
    expect((await signIn(email)).status).toBe(200)
  })

  test('a password reset opens the door', async () => {
    const email = await unproven('by-reset')
    const token = newToken()
    await plantToken(email, 'PASSWORD_RESET', token)
    const replacement = generatePassword()

    expect((await post('/api/auth/password/reset', { token, password: replacement })).status).toBe(200)
    expect((await signIn(email, replacement)).status).toBe(200)
  })

  test('a sign-in link opens the door', async () => {
    const email = await unproven('by-magic')
    const token = newToken()
    await plantToken(email, 'MAGIC_LINK', token)

    expect((await post('/api/auth/magic-link/consume', { token })).status).toBe(200)
    expect((await signIn(email)).status).toBe(200)
  })

  test('asking for the link again tells the caller nothing about the address', async () => {
    const known = await post('/api/auth/verify/resend', { email: await unproven('resending') })
    const stranger = await post('/api/auth/verify/resend', { email: registrableAddress('nobody') })

    expect(known.status).toBe(stranger.status)
    expect(await known.text()).toBe(await stranger.text())
  })
})

// A row the box office made for a ticket guest: a name, an address and no way to sign in.
function guest(email: string, name: string): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('INSERT INTO users (id, email, name) VALUES (?, ?, ?)')
      .run(crypto.randomUUID().replaceAll('-', ''), email, name)
  }
  finally {
    database.close()
  }
}

function read<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(statement).get(...parameters as never[]) as T | undefined
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('registering on an address that already booked as a guest (A-116)', () => {
  test('it is sent a claim link rather than told to sign in as usual', async () => {
    const email = registrableAddress('guest-claim')
    guest(email, 'Guest Booker (test)')

    const answered = await post('/api/auth/register', { email, name: 'Guest Booker (test)', password })
    expect(answered.status).toBe(200)

    // The row is claimed, never replaced: the bookings already on it are the point.
    expect(read<{ password: string | null, n: number }>('SELECT password, count(*) n FROM users WHERE email = ?', email))
      .toMatchObject({ password: null, n: 1 })

    const token = read<{ kind: string }>(
      'SELECT t.kind FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE u.email = ?', email)
    expect(token?.kind).toBe('SET_PASSWORD')

    const sent = read<{ type: string, status: string }>(
      'SELECT l.type, l.status FROM notification_log l JOIN users u ON u.id = l.user_id WHERE u.email = ?', email)
    expect(sent).toMatchObject({ type: 'account.claim', status: 'SENT' })

    // A-101 criterion 2: the answer is still the one a free address gets.
    const fresh = await post('/api/auth/register', { email: registrableAddress('guest-claim-fresh'), name: 'Fresh (test)', password })
    expect(await answered.text()).toBe(await fresh.text())
  })

  test('an address that can already sign in is told it exists, and gets no token', async () => {
    const email = await unproven('already-registered')

    expect((await post('/api/auth/register', { email, name: 'Twice (test)', password })).status).toBe(200)

    const sent = read<{ type: string }>(
      `SELECT l.type FROM notification_log l JOIN users u ON u.id = l.user_id
       WHERE u.email = ? AND l.type = 'account.exists'`, email)
    expect(sent?.type).toBe('account.exists')

    const claim = read<{ n: number }>(
      `SELECT count(*) n FROM auth_tokens t JOIN users u ON u.id = t.user_id
       WHERE u.email = ? AND t.kind = 'SET_PASSWORD'`, email)
    expect(claim?.n).toBe(0)
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
if (!skip && !googleConfigured) console.warn('[e2e] Google handoff skipped: NUXT_OAUTH_GOOGLE_CLIENT_ID is not set')
