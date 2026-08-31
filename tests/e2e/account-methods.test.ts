import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, openSignedOutView, skipReason, startApp, textOf, visit, waitFor, fill } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// A-113: an account follows how somebody actually signs in, and never locks them out.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest

const password = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

function read<T>(statement: string, ...parameters: unknown[]): T {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(statement).get(...parameters as never[]) as T
  }
  finally {
    database.close()
  }
}

async function signedIn(prefix: string): Promise<{ email: string, cookie: string, view: Bun.WebView }> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress(prefix)
  await fetch(`${app.baseURL}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, name: person.name, password }),
  })
  markVerified(app, email)

  const answered = await fetch(`${app.baseURL}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const cookie = (answered.headers.get('set-cookie') ?? '').split(';')[0]!

  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', email)
  await fill(view, 'form input[type="password"]', password)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, 'document.querySelector(\'[data-test="sign-out"]\')')
  return { email, cookie, view }
}

const send = (method: string, path: string, cookie: string, body?: unknown): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

// A removal re-seals the session into a new cookie, so a caller that keeps the old one is holding
// a session the epoch has just ended. A browser follows it; so does this.
function follow(response: Response, cookie: string): string {
  const set = response.headers.get('set-cookie')
  return set ? set.split(';')[0]! : cookie
}

// A second way in, so the removal path has something it is allowed to remove. Enrolling one for
// real is A-105; what is under test here is the refusal, not the enrolment.
function giveAPasskey(email: string, id: string): void {
  const userId = read<{ id: string }>('SELECT id FROM users WHERE email = ?', email).id
  write(
    `INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, backed_up, label, created_at)
     VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
    id, userId, `cred-${id}`, 'public-key', 'Test key', Math.floor(Date.now() / 1000),
  )
}

interface Listing { methods: { kind: string, id: string, addedAt: number | null, lastUsedAt: number | null, removable: boolean }[] }

describe.skipIf(skip !== null)('managing sign-in methods (A-113)', () => {
  test('the listing says when each method was added and last used', async () => {
    const { cookie, view } = await signedIn('methods-list')
    try {
      const { methods } = await (await send('GET', '/api/account/methods', cookie)).json() as Listing
      const password = methods.find(method => method.kind === 'password')

      expect(methods).toHaveLength(1)
      expect(password?.addedAt).toBeGreaterThan(0)
      // Signing in is the only thing that has used it, and that happened a moment ago.
      expect(password?.lastUsedAt).toBeGreaterThan(0)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the only way into an account cannot be removed', async () => {
    const { cookie, view } = await signedIn('methods-last')
    try {
      const refused = await send('DELETE', '/api/account/methods/password', cookie)
      expect(refused.status).toBe(409)
      expect(await refused.text()).toContain('only way')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the screen does not offer a removal it would refuse', async () => {
    const { view } = await signedIn('methods-screen')
    try {
      await visit(view, `${app.baseURL}/account/security`, '[data-test="methods"]')
      expect(await textOf(view, '[data-test="methods"]')).toContain('Password')
      const buttons = await view.evaluate(`document.querySelectorAll('[data-test^="remove-method-"]').length`)
      expect(buttons).toBe(0)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a method goes once a second one exists, and the account is told', async () => {
    const { email, cookie, view } = await signedIn('methods-remove')
    try {
      giveAPasskey(email, 'pk-remove-test')

      const listed = await (await send('GET', '/api/account/methods', cookie)).json() as Listing
      expect(listed.methods.every(method => method.removable)).toBe(true)

      const removed = await send('DELETE', '/api/account/methods/password', cookie)
      expect(removed.status).toBe(200)

      const after = await (await send('GET', '/api/account/methods', follow(removed, cookie))).json() as Listing
      expect(after.methods.map(method => method.kind)).toEqual(['passkey'])

      // Criterion 4: a removal nobody asked for has to be noticeable somewhere else.
      const sent = read<{ n: number }>(
        `SELECT count(*) n FROM notification_log l JOIN users u ON u.id = l.user_id
         WHERE u.email = ? AND l.type = 'account.method-removed'`, email)
      expect(sent.n).toBe(1)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('removing one keeps this session usable, having ended the others', async () => {
    const { email, cookie, view } = await signedIn('methods-reseal')
    try {
      giveAPasskey(email, 'pk-reseal-test')
      const before = read<{ e: number }>('SELECT session_epoch e FROM users WHERE email = ?', email).e

      const removed = await send('DELETE', '/api/account/methods/password', cookie)

      expect(read<{ e: number }>('SELECT session_epoch e FROM users WHERE email = ?', email).e).toBe(before + 1)
      // Re-sealed against the new epoch, so the person who did it is not signed out by it, while
      // the cookie they held a moment ago is.
      expect((await send('GET', '/api/account/methods', follow(removed, cookie))).status).toBe(200)
      expect((await send('GET', '/api/account/methods', cookie)).status).toBe(401)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a Workspace address is refused a password, and told to use Google', async () => {
    const { email, cookie, view } = await signedIn('methods-workspace')
    try {
      // The CHECK refuses a password on such an address, so the account is moved without one.
      write('UPDATE users SET email = ?, password = NULL, password_set_at = NULL, google_sub = ?, google_linked_at = ? WHERE email = ?',
        `methods-workspace-${Date.now()}@newtheatre.org.uk`, `sub-${Date.now()}`, Math.floor(Date.now() / 1000), email)

      const refused = await send('PUT', '/api/account/password', cookie, { password })
      expect(refused.status).toBe(400)
      expect(await refused.text()).toContain('Google')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})
