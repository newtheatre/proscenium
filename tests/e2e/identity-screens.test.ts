import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { WORKSPACE_DOMAIN } from '#shared/utils/auth'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { generatePassword, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, fillPin, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest

const password = generatePassword()
const E2E_DOMAIN = 'e2e.newtheatre.org.uk'

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function send(method: string, path: string, body?: unknown, cookie?: string): Promise<Response> {
  const carriesBody = method !== 'GET' && method !== 'HEAD'
  return fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(carriesBody ? { body: JSON.stringify(body ?? {}) } : {}),
  })
}

function withDatabase<T>(fn: (database: Database) => T, readonly = true): T {
  const database = readonly ? new Database(app.databaseFile, { readonly: true }) : new Database(app.databaseFile)
  try {
    return fn(database)
  }
  finally {
    database.close()
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

// The plaintext exists only in the message, so a test plants one whose hash it knows.
async function plantToken(email: string, kind: string, plaintext: string, expiresInMinutes: number): Promise<void> {
  const hash = await sha256(plaintext)
  withDatabase((database) => {
    const user = database.query('SELECT id FROM users WHERE email = ?').get(email) as { id: string }
    database.query('DELETE FROM auth_tokens WHERE user_id = ? AND kind = ?').run(user.id, kind)
    database.query('INSERT INTO auth_tokens (id, user_id, kind, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(crypto.randomUUID().replaceAll('-', ''), user.id, kind, hash, Math.floor(Date.now() / 1000) + expiresInMinutes * 60)
  }, false)
}

const address = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2)}@${E2E_DOMAIN}`
const newToken = (): string => `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')

async function registerFresh(prefix: string): Promise<string> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = address(prefix)
  await send('POST', '/api/auth/register', { email, name: person.name, password })
  return email
}

// Enrolment happens over the API because the browser test is about the challenge, not about
// getting a factor onto the account.
async function withFactor(email: string): Promise<string> {
  const signedIn = await send('POST', '/api/auth/sign-in', { email, password })
  const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!
  const { secret } = await (await send('POST', '/api/account/mfa/enrol', {}, cookie)).json() as { secret: string }
  await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, cookie)
  return secret
}

// A step spent confirming cannot answer a challenge, so the next one is the one to send.
const nextCode = (secret: string): Promise<string> => codeForStep(secret, stepFor(new Date()) + 1)

function verifiedFlag(email: string): number {
  return withDatabase(database =>
    (database.query('SELECT verified FROM users WHERE email = ?').get(email) as { verified: number }).verified)
}

async function open(path: string): Promise<Bun.WebView> {
  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}${path}`)
  return view
}

const SIGN_IN_FORM = 'form input[type="email"]'
const PASSWORD_FIELD = 'form input[type="password"]'
const SUBMIT = 'form button[type="submit"]'
const CHALLENGE = '[data-test="mfa-challenge"] input'

describe.skipIf(skip !== null)('registering and verifying in a browser (A-101, A-102)', () => {
  test('registering asks the visitor to check their email, and creates no session', async () => {
    const view = await open('/register')
    try {
      const email = address('screen')
      await fill(view, 'form input[type="text"]', syntheticPerson(1).name)
      await fill(view, SIGN_IN_FORM, email)
      await fill(view, PASSWORD_FIELD, password)
      await click(view, SUBMIT)

      await waitFor(view, 'document.querySelector(\'[data-test="check-your-email"]\')')
      expect(await textOf(view)).not.toContain('Sign out')
      expect(withDatabase(database => database.query('SELECT id FROM users WHERE email = ?').get(email))).not.toBeNull()
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the verification link lands on a page that verifies the address', async () => {
    const email = await registerFresh('verify')
    const token = newToken()
    await plantToken(email, 'EMAIL_VERIFY', token, 60)

    const view = await open(`/verify?token=${token}`)
    try {
      await waitFor(view, 'document.querySelector(\'[data-test="verified"]\')')
      expect(verifiedFlag(email)).toBe(1)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // A dead end is the failure this page exists to prevent (A-102 criterion 3).
  test('an expired verification link offers a fresh send rather than a dead end', async () => {
    const email = await registerFresh('stale')
    const token = newToken()
    await plantToken(email, 'EMAIL_VERIFY', token, -1)

    const view = await open(`/verify?token=${token}`)
    try {
      await waitFor(view, 'document.querySelector(\'[data-test="token-expired"]\')')
      expect(await textOf(view)).toMatch(/send|again/i)
      expect(verifiedFlag(email)).toBe(0)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('signing in in a browser (A-103, A-111)', () => {
  test('an address and a password reach a signed-in page', async () => {
    const email = await registerFresh('signin')
    const view = await open('/sign-in')
    try {
      await fill(view, SIGN_IN_FORM, email)
      await fill(view, PASSWORD_FIELD, password)
      await click(view, SUBMIT)

      await waitFor(view, 'document.querySelector(\'[data-test="sign-out"]\')')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a wrong password says so without saying whether the address is known', async () => {
    const email = await registerFresh('wrong')
    const view = await open('/sign-in')
    try {
      await fill(view, SIGN_IN_FORM, email)
      await fill(view, PASSWORD_FIELD, `${password}-not`)
      await click(view, SUBMIT)

      await waitFor(view, 'document.body.innerText.includes("do not match")')
      expect(await textOf(view)).not.toMatch(/no account|unknown address|not registered/i)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // The one deliberate enumeration exception, and the screen has to say something useful
  // (A-103 criterion 2).
  test('a Workspace address is sent to Google rather than refused as a wrong password', async () => {
    const view = await open('/sign-in')
    try {
      await fill(view, SIGN_IN_FORM, `someone@${WORKSPACE_DOMAIN}`)
      await fill(view, PASSWORD_FIELD, password)
      await click(view, SUBMIT)

      await waitFor(view, 'document.body.innerText.includes("Google")')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('an account with a factor is challenged, and a right code gets through', async () => {
    const email = await registerFresh('factor')
    const secret = await withFactor(email)

    const view = await open('/sign-in')
    try {
      await fill(view, SIGN_IN_FORM, email)
      await fill(view, PASSWORD_FIELD, password)
      await click(view, SUBMIT)

      await waitFor(view, `document.querySelectorAll('${CHALLENGE}').length >= 6`)
      expect(await textOf(view)).not.toContain('Sign out')

      await fillPin(view, CHALLENGE, await nextCode(secret))
      await waitFor(view, 'document.querySelector(\'[data-test="sign-out"]\')')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // A typo costs the code and not the password step, so the screen must stay on the challenge
  // (A-111 criterion 2).
  test('a wrong code keeps the user on the challenge rather than back at the password', async () => {
    const email = await registerFresh('typo')
    const secret = await withFactor(email)

    const view = await open('/sign-in')
    try {
      await fill(view, SIGN_IN_FORM, email)
      await fill(view, PASSWORD_FIELD, password)
      await click(view, SUBMIT)
      await waitFor(view, `document.querySelectorAll('${CHALLENGE}').length >= 6`)

      await fillPin(view, CHALLENGE, '000000')
      await waitFor(view, 'document.body.innerText.includes("did not match")')
      expect(await view.evaluate<number>(`document.querySelectorAll('${CHALLENGE}').length`)).toBeGreaterThanOrEqual(6)

      await fillPin(view, CHALLENGE, await nextCode(secret))
      await waitFor(view, 'document.querySelector(\'[data-test="sign-out"]\')')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the links that arrive by email (A-107, A-108)', () => {
  test('the reset link sets a new password, and the old one stops working', async () => {
    const email = await registerFresh('reset')
    const token = newToken()
    await plantToken(email, 'PASSWORD_RESET', token, 60)
    const replacement = generatePassword()

    const view = await open(`/reset?token=${token}`)
    try {
      await fill(view, PASSWORD_FIELD, replacement)
      await click(view, SUBMIT)
      await waitFor(view, 'document.querySelector(\'[data-test="reset-done"]\')')
    }
    finally {
      view.close()
    }

    expect((await send('POST', '/api/auth/sign-in', { email, password: replacement })).status).toBe(200)
    expect((await send('POST', '/api/auth/sign-in', { email, password })).status).toBe(401)
  }, CASE_TIMEOUT_MS)

  test('the sign-in link signs the visitor in', async () => {
    const email = await registerFresh('magic')
    const token = newToken()
    await plantToken(email, 'MAGIC_LINK', token, 60)

    const view = await open(`/magic?token=${token}`)
    try {
      await waitFor(view, 'document.querySelector(\'[data-test="sign-out"]\')')
      expect(verifiedFlag(email)).toBe(1)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a sign-in link on an account with a factor still meets the challenge', async () => {
    const email = await registerFresh('magic-mfa')
    const secret = await withFactor(email)
    const token = newToken()
    await plantToken(email, 'MAGIC_LINK', token, 60)

    const view = await open(`/magic?token=${token}`)
    try {
      await waitFor(view, `document.querySelectorAll('${CHALLENGE}').length >= 6`)
      await fillPin(view, CHALLENGE, await nextCode(secret))
      await waitFor(view, 'document.querySelector(\'[data-test="sign-out"]\')')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('an expired sign-in link offers a fresh one', async () => {
    const email = await registerFresh('magic-stale')
    const token = newToken()
    await plantToken(email, 'MAGIC_LINK', token, -1)

    const view = await open(`/magic?token=${token}`)
    try {
      await waitFor(view, 'document.querySelector(\'[data-test="token-expired"]\')')
      expect(await textOf(view)).not.toContain('Sign out')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
