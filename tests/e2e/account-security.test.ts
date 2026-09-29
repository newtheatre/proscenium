import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { RECOVERY_CODE_COUNT } from '#shared/utils/recovery-codes'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, fillPin, openSignedOutView, signOut, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

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

function withDatabase<T>(fn: (database: Database) => T): T {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return fn(database)
  }
  finally {
    database.close()
  }
}

function secretFor(email: string): string {
  return withDatabase(database => (database.query(`
    SELECT t.secret FROM totp_secrets t JOIN users u ON u.id = t.user_id WHERE u.email = ?
  `).get(email) as { secret: string }).secret)
}

function codeCount(email: string): number {
  return withDatabase(database => (database.query(`
    SELECT count(*) n FROM recovery_codes r JOIN users u ON u.id = r.user_id WHERE u.email = ?
  `).get(email) as { n: number }).n)
}

async function registerAndSignIn(prefix: string): Promise<{ email: string, view: Bun.WebView }> {
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

// The enrolment step is spent by confirming, so anything later needs the next one.
const nextCode = (secret: string): Promise<string> => codeForStep(secret, stepFor(new Date()) + 1)

const CONFIRM = '[data-test="mfa-confirm"] input'

async function enrol(view: Bun.WebView, email: string): Promise<void> {
  await visit(view, `${app.baseURL}/account/security`)
  await click(view, '[data-test="begin"]')
  await waitFor(view, 'document.querySelector(\'[data-test="mfa-secret"]\')')
  await fillPin(view, CONFIRM, await codeForStep(secretFor(email), stepFor(new Date())))
  await waitFor(view, 'document.querySelector(\'[data-test="recovery-codes"]\')')
}

describe.skipIf(skip !== null)('managing a second factor on the account (A-109, A-110, A-112)', () => {
  test('a signed-out visitor is sent to sign in', async () => {
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/account/security`)
      await waitFor(view, 'location.pathname === "/sign-in"')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // A-112 criterion 6: begun by mistake, or the phone is in another room. The way out is on the
  // step itself, and the account is left exactly as it was.
  test('setting up an authenticator app can be stopped part way, leaving nothing behind', async () => {
    const { email, view } = await registerAndSignIn('abandon')
    try {
      await visit(view, `${app.baseURL}/account/security`)
      await click(view, '[data-test="begin"]')
      await waitFor(view, 'document.querySelector(\'[data-test="mfa-secret"]\')')

      await click(view, '[data-test="mfa-cancel"]')
      await waitFor(view, 'document.querySelector(\'[data-test="begin"]\')')
      expect(await textOf(view, 'body')).not.toContain('Scan this with your authenticator app')
      expect(codeCount(email)).toBe(0)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('enrolling shows the secret and a scannable code, then the recovery codes once', async () => {
    const { email, view } = await registerAndSignIn('enrol')
    try {
      await visit(view, `${app.baseURL}/account/security`)
      await click(view, '[data-test="begin"]')
      await waitFor(view, 'document.querySelector(\'[data-test="mfa-secret"]\')')

      expect(await textOf(view, '[data-test="mfa-secret"]')).toMatch(/[A-Z2-7]{16,}/)
      expect(await view.evaluate<string>('document.querySelector(\'[data-test="mfa-qr"]\').src')).toContain('image/svg+xml')

      await fillPin(view, CONFIRM, await codeForStep(secretFor(email), stepFor(new Date())))
      await waitFor(view, 'document.querySelector(\'[data-test="recovery-codes"]\')')

      const shown = await view.evaluate<number>('document.querySelectorAll(\'[data-test="recovery-codes"] li\').length')
      expect(shown).toBe(RECOVERY_CODE_COUNT)
      expect(codeCount(email)).toBe(RECOVERY_CODE_COUNT)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a wrong code does not activate the factor', async () => {
    const { email, view } = await registerAndSignIn('badcode')
    try {
      await visit(view, `${app.baseURL}/account/security`)
      await click(view, '[data-test="begin"]')
      await waitFor(view, 'document.querySelector(\'[data-test="mfa-secret"]\')')

      await fillPin(view, CONFIRM, '000000')
      await waitFor(view, 'document.body.innerText.includes("did not match")')
      expect(codeCount(email)).toBe(0)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the page reports an active factor and how many codes are left', async () => {
    const { email, view } = await registerAndSignIn('active')
    try {
      await enrol(view, email)
      await visit(view, `${app.baseURL}/account/security`)

      await waitFor(view, 'document.querySelector(\'[data-test="mfa-active"]\')')
      expect(await textOf(view)).toContain(String(RECOVERY_CODE_COUNT))
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // A fresh set retires the old one whole, so the screen must show a different eight.
  test('regenerating replaces the whole set', async () => {
    const { email, view } = await registerAndSignIn('regen')
    try {
      await enrol(view, email)
      const first = await view.evaluate<string[]>(
        '[...document.querySelectorAll(\'[data-test="recovery-codes"] li\')].map(item => item.innerText)',
      )

      await visit(view, `${app.baseURL}/account/security`)
      await click(view, '[data-test="regenerate"]')
      await waitFor(view, 'document.querySelector(\'[data-test="recovery-codes"]\')')

      const second = await view.evaluate<string[]>(
        '[...document.querySelectorAll(\'[data-test="recovery-codes"] li\')].map(item => item.innerText)',
      )
      expect(second).toHaveLength(RECOVERY_CODE_COUNT)
      expect(second.some(code => first.includes(code))).toBe(false)
      expect(codeCount(email)).toBe(RECOVERY_CODE_COUNT)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('an ordinary account can give up its factor', async () => {
    const { email, view } = await registerAndSignIn('remove')
    try {
      await enrol(view, email)
      await visit(view, `${app.baseURL}/account/security`)
      await click(view, '[data-test="remove"]')
      await waitFor(view, 'document.querySelector(\'[data-test="confirm-remove-authenticator-verb"]\')')
      expect(codeCount(email)).toBe(RECOVERY_CODE_COUNT)
      await click(view, '[data-test="confirm-remove-authenticator-verb"]')

      await waitFor(view, 'document.querySelector(\'[data-test="begin"]\')')
      expect(codeCount(email)).toBe(0)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // Giving it up would lock the surface rather than open it, so the screen says so (A-112).
  test('a privileged account is told why it cannot give up its factor', async () => {
    const { email, view } = await registerAndSignIn('privileged')
    try {
      await enrol(view, email)
      expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', email, app.databaseFile]).exitCode).toBe(0)

      await visit(view, `${app.baseURL}/account/security`)
      await waitFor(view, 'document.querySelector(\'[data-test="mfa-required"]\')')
      await click(view, '[data-test="remove"]')
      await click(view, '[data-test="confirm-remove-authenticator-verb"]')

      await waitFor(view, 'document.querySelector(\'[data-test="confirm-remove-authenticator-failure"]\')?.innerText.includes("requires a second factor")')
      expect(codeCount(email)).toBe(RECOVERY_CODE_COUNT)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a fresh code from the enrolled secret answers a later challenge', async () => {
    const { email, view } = await registerAndSignIn('challenge')
    try {
      await enrol(view, email)
      const secret = secretFor(email)

      await signOut(view)
      await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\') === null')

      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')

      await waitFor(view, 'document.querySelectorAll(\'[data-test="mfa-challenge"] input\').length >= 6')
      await fillPin(view, '[data-test="mfa-challenge"] input', await nextCode(secret))
      await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

// Whether the first element comes before the second in the page, which is the order a reader meets them.
const before = (first: string, second: string): string =>
  `Boolean(document.querySelector(${JSON.stringify(first)})?.compareDocumentPosition(document.querySelector(${JSON.stringify(second)})) & Node.DOCUMENT_POSITION_FOLLOWING)`

describe.skipIf(skip !== null)('the security page leads with the viewer\'s next step (issue 1344)', () => {
  test('it is headed as the settings list names it, the ways in first and your data at the foot', async () => {
    const { view } = await registerAndSignIn('ordered')
    try {
      await visit(view, `${app.baseURL}/account/security`, '[data-test="methods"]')
      // The authenticator card is a second read, so it may land after the list.
      await waitFor(view, 'document.querySelector(\'[data-test="begin"]\')')
      expect(await textOf(view, '[data-test="account-security-page"] h1')).toBe('Security')
      expect(await view.evaluate<boolean>(before('[data-test="methods"]', '[data-test="new-password"]'))).toBe(true)
      expect(await view.evaluate<boolean>(before('[data-test="methods"]', '[data-test="begin"]'))).toBe(true)
      expect(await view.evaluate<boolean>(before('[data-test="begin"]', '[data-test="export"]'))).toBe(true)
      expect(await view.evaluate<boolean>(before('[data-test="new-password"]', '[data-test="close-account"]'))).toBe(true)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a privileged password account is asked for the authenticator its role needs, straight after the ways in', async () => {
    const { email, view } = await registerAndSignIn('asked')
    try {
      expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', email, app.databaseFile, '--additional']).exitCode).toBe(0)
      await visit(view, `${app.baseURL}/account/security`, '[data-test="next-step"]')
      expect(await textOf(view, '[data-test="next-step"]')).toContain('Your role needs an authenticator app')
      expect(await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="next-step"] [data-test="begin"]'))`)).toBe(true)
      expect(await view.evaluate<boolean>(before('[data-test="methods"]', '[data-test="next-step"]'))).toBe(true)
      expect(await view.evaluate<boolean>(`!document.querySelector('[data-test="next-step"]')?.innerText.includes('Add a passkey')`)).toBe(true)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('anybody else whose browser can hold a passkey is offered one as the next step', async () => {
    const { view } = await registerAndSignIn('passkey-next')
    try {
      await visit(view, `${app.baseURL}/account/security`, '[data-test="methods"]')
      if (await view.evaluate<boolean>('typeof window.PublicKeyCredential === "function"')) {
        await waitFor(view, 'document.querySelector(\'[data-test="next-step"]\')')
        expect(await textOf(view, '[data-test="next-step"]')).toContain('Add a passkey')
        expect(await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="next-step"] [data-test="add-passkey"]'))`)).toBe(true)
      }
      else {
        expect(await view.evaluate<boolean>(`document.querySelector('[data-test="next-step"]') === null`)).toBe(true)
      }
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the address is changed from Profile, not from here', async () => {
    const { view } = await registerAndSignIn('email-on-profile')
    try {
      await visit(view, `${app.baseURL}/account/security`, '[data-test="methods"]')
      expect(await view.evaluate<boolean>(`document.querySelector('[data-test="new-email"]') === null`)).toBe(true)
      await visit(view, `${app.baseURL}/account/profile`, '[data-test="profile-form"]')
      await waitFor(view, 'document.querySelector(\'[data-test="new-email"]\')')
      expect(await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="change-email"]'))`)).toBe(true)
      // Outside the profile form, so Enter in the address cannot submit the profile.
      expect(await view.evaluate<boolean>(`document.querySelector('[data-test="profile-form"] [data-test="new-email"]') === null`)).toBe(true)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
