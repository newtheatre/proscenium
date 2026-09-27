import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { WORKSPACE_DOMAIN } from '#shared/utils/auth'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { markVerified } from '#tests/helpers/accounts'
import { generatePassword, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, fillPin, letters, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
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

// Verified by default because a signed-in member has to be (0026); the tests about verification
// itself ask for one that is not.
async function registerFresh(prefix: string, verified = true): Promise<string> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = address(prefix)
  await send('POST', '/api/auth/register', { email, name: person.name, password })
  if (verified) markVerified(app, email)
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
const EMAIL_ME_A_LINK = '[data-test="email-me-a-link"]'
const SIGNED_IN = 'document.querySelector(\'[data-test="account-menu"]\')'

// The link a message carried, read back from the mail sink as a person reads their inbox, and
// opened on this app whatever base the message was addressed from.
async function linkSentTo(email: string, path: string, pattern = new RegExp(`https?://\\S*${path}\\?token=\\S+`)): Promise<string> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const found = (await letters(app))
      .filter(letter => letter.startsWith(`To: ${email}`))
      .map(letter => letter.match(pattern)?.[0])
      .find(Boolean)
    if (found) {
      const url = new URL(found)
      return `${url.pathname}${url.search}`
    }
    await Bun.sleep(200)
  }
  throw new Error(`no ${path} link reached ${email}`)
}

// The one cookie of that name a response set, as the browser would store it.
function registrationCookie(response: Response): string {
  return response.headers.getSetCookie().find(line => line.startsWith('nnt-registered=')) ?? ''
}

// A trigger standing in for a failed write, so a test can see what the rest of a batch left.
function refuseChallengesFor(email: string): () => void {
  const name = `refuse_challenge_${crypto.randomUUID().replaceAll('-', '')}`
  withDatabase((database) => {
    const { id } = database.query('SELECT id FROM users WHERE email = ?').get(email) as { id: string }
    database.run(`CREATE TRIGGER ${name} BEFORE INSERT ON mfa_attempts WHEN NEW.user_id = '${id}'
      BEGIN SELECT RAISE(ABORT, 'refused for the test'); END`)
  }, false)
  return () => withDatabase(database => database.run(`DROP TRIGGER IF EXISTS ${name}`), false)
}

// A row the box office made for a ticket guest: a name, an address and no way to sign in.
function guest(email: string): void {
  withDatabase((database) => {
    database.query('INSERT INTO users (id, email, name) VALUES (?, ?, ?)')
      .run(crypto.randomUUID().replaceAll('-', ''), email, syntheticPerson(Math.floor(Math.random() * 1_000_000)).name)
  }, false)
}

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
    const email = await registerFresh('verify', false)
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

  // Registering seals the address into this browser, so the link opened here is a sign-in; the
  // email carries where the visitor set out from (0103).
  test('the confirmation link signs in the browser that registered, and returns to next', async () => {
    const view = await open('/register?next=%2Faccount%2Fprofile')
    try {
      const email = address('here')
      await fill(view, 'form input[type="text"]', syntheticPerson(2).name)
      await fill(view, SIGN_IN_FORM, email)
      await fill(view, PASSWORD_FIELD, password)
      await click(view, SUBMIT)
      await waitFor(view, 'document.querySelector(\'[data-test="check-your-email"]\')')

      const link = await linkSentTo(email, '/verify')
      expect(link).toContain('next=%2Faccount%2Fprofile')
      await view.navigate(`${app.baseURL}${link}`)
      await waitFor(view, `location.pathname === '/account/profile' && ${SIGNED_IN}`, 30_000)
      expect(verifiedFlag(email)).toBe(1)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('opened in a browser that did not register, the confirmation link confirms without signing in', async () => {
    const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
    const email = address('elsewhere')
    await send('POST', '/api/auth/register', { email, name: person.name, password, next: '/account/profile' })
    const link = await linkSentTo(email, '/verify')

    const view = await openSignedOutView(app.baseURL)
    try {
      await view.navigate(`${app.baseURL}${link}`)
      await waitFor(view, 'document.querySelector(\'[data-test="verified"]\')', 30_000)
      expect(verifiedFlag(email)).toBe(1)
      expect(await view.evaluate<boolean>(`Boolean(${SIGNED_IN})`)).toBe(false)
      expect(await view.evaluate<string>('document.querySelector(\'[data-test="verified"] a\')?.getAttribute("href") ?? ""'))
        .toContain('next=%2Faccount%2Fprofile')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // A dead end is the failure this page exists to prevent (A-102 criterion 3).
  // A sign-in link confirms the address as it signs in, so it is the fresh send (0103).
  test('an expired verification link offers a sign-in link rather than a dead end', async () => {
    const email = await registerFresh('stale', false)
    const token = newToken()
    await plantToken(email, 'EMAIL_VERIFY', token, -1)

    const view = await open(`/verify?token=${token}`)
    try {
      await waitFor(view, 'document.querySelector(\'[data-test="token-expired"]\')')
      expect(verifiedFlag(email)).toBe(0)

      await fill(view, SIGN_IN_FORM, email)
      await click(view, SUBMIT)
      await waitFor(view, 'document.querySelector(\'[data-test="check-your-email"]\')')
      expect(await linkSentTo(email, '/magic')).toContain('/magic?token=')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('signing in in a browser (A-103, A-111)', () => {
  // The refusal an unverified account gets is deliberately generic, so it points to the emailed
  // link, which confirms the address as it signs in (0026, 0103).
  test('a refused password points to the emailed link, and the link gets an unconfirmed address in', async () => {
    const email = await registerFresh('refused', false)
    const view = await open('/sign-in')
    try {
      await fill(view, SIGN_IN_FORM, email)
      await fill(view, PASSWORD_FIELD, password)
      await click(view, SUBMIT)
      await waitFor(view, 'document.body.innerText.includes("do not match")')
      expect(await textOf(view, '[data-test="sign-in-refused"]')).toContain('Email me a sign-in link')

      await click(view, EMAIL_ME_A_LINK)
      await waitFor(view, 'document.querySelector(\'[data-test="check-your-email"]\')')
      await view.navigate(`${app.baseURL}${await linkSentTo(email, '/magic')}`)
      await waitFor(view, SIGNED_IN, 30_000)
      expect(verifiedFlag(email)).toBe(1)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('an address and a password reach a signed-in page', async () => {
    const email = await registerFresh('signin')
    const view = await open('/sign-in')
    try {
      await fill(view, SIGN_IN_FORM, email)
      await fill(view, PASSWORD_FIELD, password)
      await click(view, SUBMIT)

      await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')
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

  // No password field is ever drawn for a theatre address, so none can be typed there (0008,
  // 0103). Without Google credentials the route comes straight back refused, which also counts.
  test('a Workspace address is offered Google alone, and continuing goes to Google', async () => {
    const view = await open('/sign-in')
    try {
      await fill(view, SIGN_IN_FORM, `someone@${WORKSPACE_DOMAIN}`)
      await waitFor(view, 'document.querySelector(\'[data-test="google-sign-in"]\')')
      expect(await view.evaluate<number>(`document.querySelectorAll('input[type="password"]').length`)).toBe(0)
      expect(await view.evaluate<boolean>(`Boolean(document.querySelector('${EMAIL_ME_A_LINK}'))`)).toBe(false)

      await click(view, '[data-test="google-sign-in"]')
      await waitFor(view, `location.host !== ${JSON.stringify(new URL(app.baseURL).host)} || location.search.includes('refused=google')`, 30_000)
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
      await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')
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
      await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the links that arrive by email (A-107, A-108)', () => {
  // Choosing the password is the sign-in: nobody types it a second time straight after (0103).
  test('the reset link sets a new password, signs in where the person set out for, and the old one stops working', async () => {
    const email = await registerFresh('reset')
    const token = newToken()
    await plantToken(email, 'PASSWORD_RESET', token, 60)
    const replacement = generatePassword()

    const view = await open(`/reset?token=${token}&next=%2Faccount%2Fprofile`)
    try {
      await fill(view, PASSWORD_FIELD, replacement)
      await click(view, SUBMIT)
      await waitFor(view, `location.pathname === '/account/profile' && ${SIGNED_IN}`, 30_000)
    }
    finally {
      view.close()
    }

    expect((await send('POST', '/api/auth/sign-in', { email, password: replacement })).status).toBe(200)
    expect((await send('POST', '/api/auth/sign-in', { email, password })).status).toBe(401)
  }, CASE_TIMEOUT_MS)

  test('the sign-in link signs the visitor in', async () => {
    const email = await registerFresh('magic', false)
    const token = newToken()
    await plantToken(email, 'MAGIC_LINK', token, 60)

    const view = await open(`/magic?token=${token}`)
    try {
      await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')
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
      await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')
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

describe.skipIf(skip !== null)('the sign-in screen asks for the address first (0103)', () => {
  test('before an address it offers the address field alone, and no standing resend step', async () => {
    const view = await open('/sign-in')
    try {
      await waitFor(view, 'document.querySelector(\'[data-test="continue"]\')')
      expect(await view.evaluate<number>(`document.querySelectorAll('input[type="password"]').length`)).toBe(0)
      expect(await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="resend-verification"]'))`)).toBe(false)
      expect(await textOf(view)).not.toContain('I did not get my confirmation email')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('any other address is offered the emailed link first, with the password beside it', async () => {
    const view = await open('/sign-in')
    try {
      await fill(view, SIGN_IN_FORM, address('offers'))
      await waitFor(view, `document.querySelector('${EMAIL_ME_A_LINK}') && document.querySelector('${PASSWORD_FIELD}')`)
      const order = await view.evaluate<string>(`JSON.stringify({
        linkFirst: Boolean(document.querySelector('${EMAIL_ME_A_LINK}').compareDocumentPosition(document.querySelector('${PASSWORD_FIELD}')) & Node.DOCUMENT_POSITION_FOLLOWING),
        linkSubmits: document.querySelector('${EMAIL_ME_A_LINK}').type === 'submit',
        submits: document.querySelectorAll('${SUBMIT}').length,
      })`)
      expect(JSON.parse(order)).toEqual({ linkFirst: true, linkSubmits: false, submits: 1 })
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('every control on the screen is at least 44 pixels tall on a phone', async () => {
    const view = await openSignedOutView(app.baseURL, { width: 500, height: 900 })
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, SIGN_IN_FORM, address('thumbs'))
      await waitFor(view, `document.querySelector('${PASSWORD_FIELD}')`)
      const small = await view.evaluate<string>(`JSON.stringify(
        [...document.querySelectorAll('[data-test="sign-in"] :is(input, button, a)')]
          .filter(control => control.getClientRects().length > 0)
          .map(control => ({ control: control.innerText || control.getAttribute('type'), height: control.getBoundingClientRect().height }))
          .filter(found => found.height < 44))`)
      expect(JSON.parse(small)).toEqual([])
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('every emailed link carries next (0103)', () => {
  test('the sign-in link returns to where the person set out from', async () => {
    const email = await registerFresh('link-next')
    const view = await open('/sign-in?next=%2Faccount%2Fprofile')
    try {
      await fill(view, SIGN_IN_FORM, email)
      await click(view, EMAIL_ME_A_LINK)
      await waitFor(view, 'document.querySelector(\'[data-test="check-your-email"]\')')

      const link = await linkSentTo(email, '/magic')
      expect(link).toContain('next=%2Faccount%2Fprofile')
      await view.navigate(`${app.baseURL}${link}`)
      await waitFor(view, `location.pathname === '/account/profile' && ${SIGNED_IN}`, 30_000)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the forgotten-password step sends a reset link that carries next', async () => {
    const email = await registerFresh('reset-next')
    const view = await open('/sign-in?method=reset&next=%2Faccount%2Fprofile')
    try {
      await fill(view, SIGN_IN_FORM, email)
      await click(view, SUBMIT)
      await waitFor(view, 'document.querySelector(\'[data-test="check-your-email"]\')')
      expect(await linkSentTo(email, '/reset')).toContain('next=%2Faccount%2Fprofile')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('registering a guest address sends a claim link that carries next', async () => {
    const email = address('claim-next')
    guest(email)
    await send('POST', '/api/auth/register', { email, name: syntheticPerson(3).name, password, next: '/my' })
    expect(await linkSentTo(email, '/reset')).toContain('next=%2Fmy')
  }, CASE_TIMEOUT_MS)

  test('registering an address that has an account sends a sign-in link that carries next', async () => {
    const email = await registerFresh('exists-next')
    await send('POST', '/api/auth/register', { email, name: syntheticPerson(4).name, password, next: '/account/profile' })
    expect(await linkSentTo(email, '/sign-in', /https?:\/\/\S*\/sign-in\?next=\S+/)).toContain('next=%2Faccount%2Fprofile')
  }, CASE_TIMEOUT_MS)

  test('a resent confirmation carries next', async () => {
    const email = await registerFresh('resend-next', false)
    await send('POST', '/api/auth/verify/resend', { email, next: '/my' })
    expect(await linkSentTo(email, '/verify', /https?:\/\/\S*\/verify\?token=\S*next=%2Fmy/)).toContain('next=%2Fmy')
  }, CASE_TIMEOUT_MS)

  // Registering, then choosing, then signing in was three passwords for one guest (issue 1339).
  test('a guest claiming their bookings chooses a password once and is signed in', async () => {
    const email = address('claim')
    guest(email)
    const token = newToken()
    await plantToken(email, 'SET_PASSWORD', token, 60)

    const view = await open(`/reset?token=${token}&kind=set&next=%2Fmy`)
    try {
      await fill(view, PASSWORD_FIELD, generatePassword())
      await click(view, SUBMIT)
      await waitFor(view, `location.pathname === '/my' && ${SIGNED_IN}`, 30_000)
      expect(verifiedFlag(email)).toBe(1)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a reset on an account with a factor is challenged before it signs in', async () => {
    const email = await registerFresh('reset-mfa')
    const secret = await withFactor(email)
    const token = newToken()
    await plantToken(email, 'PASSWORD_RESET', token, 60)

    const view = await open(`/reset?token=${token}`)
    try {
      await fill(view, PASSWORD_FIELD, generatePassword())
      await click(view, SUBMIT)
      await waitFor(view, `document.querySelectorAll('${CHALLENGE}').length >= 6`)
      expect(await textOf(view)).not.toContain('Sign out')

      await fillPin(view, CHALLENGE, await nextCode(secret))
      await waitFor(view, SIGNED_IN)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

// The browser that registered holds the address sealed; the answer must not differ by branch, and
// the cookie must never stand in for a second factor or a changed address (0103, A-101 c2, A-115).
describe.skipIf(skip !== null)('the registering browser\'s cookie (0103)', () => {
  const register = (email: string): Promise<Response> =>
    send('POST', '/api/auth/register', { email, name: syntheticPerson(Math.floor(Math.random() * 1_000_000)).name, password })

  const attributes = (line: string): string[] =>
    line.split(';').slice(1).map(part => part.trim().split('=')[0]!.toLowerCase()).sort()

  test('every branch sets it with the same attributes: HttpOnly, Secure and SameSite=Lax', async () => {
    const existing = await registerFresh('cookie-existing')
    const guestAddress = address('cookie-guest')
    guest(guestAddress)

    const lines = [
      registrationCookie(await register(address('cookie-new'))),
      registrationCookie(await register(existing)),
      registrationCookie(await register(guestAddress)),
      registrationCookie(await register(`cookie-${Math.random().toString(36).slice(2)}@example.com`)),
    ]

    for (const line of lines) {
      expect(line.length).toBeGreaterThan('nnt-registered='.length)
      expect(attributes(line)).toEqual(attributes(lines[0]!))
      expect(line.toLowerCase()).toContain('samesite=lax')
    }
    expect(attributes(lines[0]!)).toEqual(expect.arrayContaining(['httponly', 'secure', 'samesite']))
  }, CASE_TIMEOUT_MS)

  test('the first confirmation signs in and spends it, so what the browser then holds signs in nobody', async () => {
    const email = address('cookie-spent')
    const cookie = registrationCookie(await register(email)).split(';')[0]!
    const first = newToken()
    await plantToken(email, 'EMAIL_VERIFY', first, 60)

    const confirmed = await send('POST', '/api/auth/verify', { token: first }, cookie)
    expect(await confirmed.json()).toMatchObject({ signedIn: true })
    expect(confirmed.headers.getSetCookie().some(line => line.startsWith('nnt-session='))).toBe(true)

    const held = registrationCookie(confirmed).split(';')[0]!
    expect(held).toBe('nnt-registered=')
    const second = newToken()
    await plantToken(email, 'EMAIL_VERIFY', second, 60)
    expect(await (await send('POST', '/api/auth/verify', { token: second }, held)).json()).toMatchObject({ signedIn: false })
  }, CASE_TIMEOUT_MS)

  test('a link bound to an address confirms without signing in, even in the registering browser', async () => {
    const email = address('cookie-bound')
    const cookie = registrationCookie(await register(email)).split(';')[0]!
    const token = newToken()
    const hash = await sha256(token)
    withDatabase((database) => {
      const { id } = database.query('SELECT id FROM users WHERE email = ?').get(email) as { id: string }
      database.query('DELETE FROM auth_tokens WHERE user_id = ? AND kind = ?').run(id, 'EMAIL_VERIFY')
      database.query('INSERT INTO auth_tokens (id, user_id, kind, token_hash, email, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(crypto.randomUUID().replaceAll('-', ''), id, 'EMAIL_VERIFY', hash, email, Math.floor(Date.now() / 1000) + 3600)
    }, false)

    const answered = await send('POST', '/api/auth/verify', { token }, cookie)
    expect(await answered.json()).toMatchObject({ signedIn: false })
    expect(answered.headers.getSetCookie().some(line => line.startsWith('nnt-session='))).toBe(false)
    expect(verifiedFlag(email)).toBe(1)
  }, CASE_TIMEOUT_MS)

  test('an account with a confirmed factor is confirmed and not signed in, even in the registering browser', async () => {
    const email = address('cookie-factor')
    const cookie = registrationCookie(await register(email)).split(';')[0]!
    markVerified(app, email)
    await withFactor(email)
    withDatabase(database => database.query('UPDATE users SET verified = 0 WHERE email = ?').run(email), false)
    const token = newToken()
    await plantToken(email, 'EMAIL_VERIFY', token, 60)

    const answered = await send('POST', '/api/auth/verify', { token }, cookie)
    expect(await answered.json()).toMatchObject({ signedIn: false })
    expect(answered.headers.getSetCookie().some(line => line.startsWith('nnt-session='))).toBe(false)
    expect(verifiedFlag(email)).toBe(1)
  }, CASE_TIMEOUT_MS)
})

// Each route that opens a challenge writes it in the batch that holds the rest, so a failed
// challenge write leaves the password and the address as they were (0001).
describe.skipIf(skip !== null)('a challenge that cannot be written leaves nothing half done (0001)', () => {
  const passwordOf = (email: string): string =>
    withDatabase(database => (database.query('SELECT password FROM users WHERE email = ?').get(email) as { password: string }).password)
  const auditCount = (email: string, action: string): number =>
    withDatabase(database => (database.query(`SELECT count(*) n FROM audit_log l JOIN users u ON l.target = 'user:' || u.id
      WHERE u.email = ? AND l.action = ?`).get(email, action) as { n: number }).n)

  test('a reset on an account with a factor sets no password when its challenge fails', async () => {
    const email = await registerFresh('atomic-reset')
    await withFactor(email)
    const before = passwordOf(email)
    const token = newToken()
    await plantToken(email, 'PASSWORD_RESET', token, 60)

    const allow = refuseChallengesFor(email)
    try {
      const answered = await send('POST', '/api/auth/password/reset', { token, password: generatePassword() })
      expect(answered.status).toBeGreaterThanOrEqual(500)
    }
    finally {
      allow()
    }
    expect(passwordOf(email)).toBe(before)
    expect(auditCount(email, 'password.reset')).toBe(0)
  }, CASE_TIMEOUT_MS)

  test('a sign-in link on an account with a factor proves nothing when its challenge fails', async () => {
    const email = await registerFresh('atomic-magic')
    await withFactor(email)
    withDatabase(database => database.query('UPDATE users SET verified = 0 WHERE email = ?').run(email), false)
    const token = newToken()
    await plantToken(email, 'MAGIC_LINK', token, 60)

    const allow = refuseChallengesFor(email)
    try {
      const answered = await send('POST', '/api/auth/magic-link/consume', { token })
      expect(answered.status).toBeGreaterThanOrEqual(500)
    }
    finally {
      allow()
    }
    expect(verifiedFlag(email)).toBe(0)
  }, CASE_TIMEOUT_MS)
})

// Issue 925: signed in, both pages rendered their full form under the signed-in header, inviting
// a second account by mistake. Issue 917 item 4: neither page had a heading at all.
describe.skipIf(skip !== null)('the two ways in are headed, and closed to somebody already through', () => {
  for (const path of ['/sign-in', '/register']) {
    test(`${path} carries exactly one h1`, async () => {
      const view = await open(path)
      try {
        await waitFor(view, 'document.querySelector(\'form\')')
        const headings = await view.evaluate<string>(`JSON.stringify(
          [...document.querySelectorAll('main h1')].map(heading => heading.innerText.trim()))`)
        const found = JSON.parse(headings) as string[]
        expect(found.length).toBe(1)
        expect(found[0]!.length).toBeGreaterThan(2)
      }
      finally {
        view.close()
      }
    }, CASE_TIMEOUT_MS)
  }

  test('a signed-in visitor opening either page is sent on rather than shown the form', async () => {
    const email = await registerFresh('already-in')
    const view = await open('/sign-in')
    try {
      await fill(view, SIGN_IN_FORM, email)
      await fill(view, PASSWORD_FIELD, password)
      await click(view, SUBMIT)
      await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')

      for (const path of ['/sign-in', '/register']) {
        await visit(view, `${app.baseURL}${path}`)
        await waitFor(view, `!location.pathname.startsWith(${JSON.stringify(path)})`)
        expect(await view.evaluate<number>('document.querySelectorAll(\'form input[type="password"]\').length')).toBe(0)
      }
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the redirect honours a next path, and refuses one pointing off this site', async () => {
    const email = await registerFresh('already-in-next')
    const view = await open('/sign-in')
    try {
      await fill(view, SIGN_IN_FORM, email)
      await fill(view, PASSWORD_FIELD, password)
      await click(view, SUBMIT)
      await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')

      await visit(view, `${app.baseURL}/sign-in?next=%2Fwhats-on`)
      await waitFor(view, 'location.pathname === "/whats-on"')

      await visit(view, `${app.baseURL}/sign-in?next=https%3A%2F%2Fexample.org%2F`)
      await waitFor(view, 'location.pathname === "/"')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
