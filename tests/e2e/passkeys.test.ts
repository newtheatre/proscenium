import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, signOut, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// A-105, driven through a real ceremony: Chrome's virtual authenticator signs for us, so what is
// under test is the two endpoints and the rules around them rather than a mock of them.

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

function read<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    // bun:sqlite answers null for no row; undefined reads better against toBeDefined.
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

// A platform authenticator that holds discoverable credentials and verifies its user, which is
// what criteria 1 and 3 ask a real one for.
async function giveAnAuthenticator(view: Bun.WebView, verifies = true): Promise<void> {
  await view.cdp('WebAuthn.enable')
  await view.cdp('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: verifies,
      automaticPresenceSimulation: true,
    },
  })
}

async function signedInView(prefix: string): Promise<{ email: string, view: Bun.WebView }> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress(prefix)
  await fetch(`${app.baseURL}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, name: person.name, password }),
  })
  markVerified(app, email)

  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', email)
  await fill(view, 'form input[type="password"]', password)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')
  return { email, view }
}

async function enrol(view: Bun.WebView): Promise<void> {
  await visit(view, `${app.baseURL}/account/security`, '[data-test="methods"]')
  await click(view, '[data-test="add-passkey"]')
}

function passkeyOf(email: string): { counter: number, lastUsedAt: number | null, backedUp: number } | undefined {
  return read(`
    SELECT p.counter, p.last_used_at AS lastUsedAt, p.backed_up AS backedUp
    FROM passkeys p JOIN users u ON u.id = p.user_id WHERE u.email = ?`, email)
}

describe.skipIf(skip !== null)('signing in with a passkey (A-105)', () => {
  test('one is enrolled from a signed-in session and appears as a way in', async () => {
    const { email, view } = await signedInView('passkey-enrol')
    try {
      await giveAnAuthenticator(view)
      await enrol(view)
      await waitFor(view, `document.querySelector('[data-test="methods"]').innerText.includes('passkey')`, 30_000)

      expect(passkeyOf(email)).toBeDefined()
      // Criterion 5 through A-113: two ways in now, so either may go.
      const removable = await view.evaluate(`document.querySelectorAll('[data-test^="remove-method-"]').length`)
      expect(removable).toBe(2)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // The browser refuses before a request is made, the ceremony asking for user verification. The
  // server's own refusal is the belt to those braces, and is unit tested.
  test('an authenticator that does not verify the person enrols nothing', async () => {
    const { email, view } = await signedInView('passkey-unverified')
    try {
      await giveAnAuthenticator(view, false)
      await enrol(view)
      await waitFor(view, `document.querySelectorAll('[role="alert"], [data-sonner-toast]').length > 0`, 30_000)
      expect(passkeyOf(email)).toBeUndefined()
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('it signs somebody in on its own, with no second step and no address typed', async () => {
    const { email, view } = await signedInView('passkey-signin')
    try {
      await giveAnAuthenticator(view)
      await enrol(view)
      await waitFor(view, `document.querySelector('[data-test="methods"]').innerText.includes('passkey')`, 30_000)

      await signOut(view)
      await waitFor(view, 'location.pathname === "/"')

      await visit(view, `${app.baseURL}/sign-in`, '[data-test="passkey-sign-in"]')
      await click(view, '[data-test="passkey-sign-in"]')

      // No challenge screen in between: a passkey is a complete sign-in (criterion 2).
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`, 30_000)
      const challenged = await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="mfa-challenge"]'))`)
      expect(challenged).toBe(false)

      const signIns = read<{ n: number }>(
        `SELECT count(*) n FROM audit_log l JOIN users u ON u.id = l.actor_id
         WHERE u.email = ? AND l.action = 'session.started.passkey'`, email)
      expect(signIns?.n).toBe(1)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the signature counter is recorded on every use (criterion 4)', async () => {
    const { email, view } = await signedInView('passkey-counter')
    try {
      await giveAnAuthenticator(view)
      await enrol(view)
      await waitFor(view, `document.querySelector('[data-test="methods"]').innerText.includes('passkey')`, 30_000)
      expect(passkeyOf(email)?.lastUsedAt).toBeNull()

      await signOut(view)
      await waitFor(view, 'location.pathname === "/"')
      await visit(view, `${app.baseURL}/sign-in`, '[data-test="passkey-sign-in"]')
      await click(view, '[data-test="passkey-sign-in"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`, 30_000)

      const after = passkeyOf(email)
      expect(after?.lastUsedAt).toBeGreaterThan(0)
      expect(after?.counter).toBeGreaterThan(0)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a challenge is single use, so a replayed response finds nothing', async () => {
    const answered = await fetch(`${app.baseURL}/api/auth/passkey/authenticate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verify: false }),
    })
    const { attemptId } = await answered.json() as { attemptId: string }
    expect(read<{ n: number }>('SELECT count(*) n FROM passkey_challenges WHERE id = ?', attemptId)?.n).toBe(1)

    // Taken rather than read: verifying anything against it removes it, right or wrong.
    await fetch(`${app.baseURL}/api/auth/passkey/authenticate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verify: true, attemptId, response: { id: 'nope', rawId: 'nope', type: 'public-key', response: {}, clientExtensionResults: {} } }),
    })
    expect(read<{ n: number }>('SELECT count(*) n FROM passkey_challenges WHERE id = ?', attemptId)?.n).toBe(0)
  }, CASE_TIMEOUT_MS)
})
