import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { finishSignIn, forgetSpentStep, grantRole, markVerified, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, fillPin, openSignedOutView, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// Issue 922: a console list keeps its row actions in view at 390px instead of forcing a
// horizontal scroll to reach them.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 60_000
const PHONE = { width: 390, height: 844 }

let app: AppUnderTest
let boxOffice: TestMember
const boxOfficePassword = generatePassword()

const adminEmail = registrableAddress('responsive-admin')
const adminPassword = generatePassword()
let adminSecret = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()

  boxOffice = await registerMember(app, 'boxoffice', boxOfficePassword)
  const officer = await registerMember(app, 'grantor', generatePassword())
  await grantRole(app, boxOffice, 'FOH_MANAGER', officer.cookie)

  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  await request(app, 'POST', '/api/auth/register', { email: adminEmail, name: person.name, password: adminPassword })
  markVerified(app, adminEmail)
  const signedIn = await request(app, 'POST', '/api/auth/sign-in', { email: adminEmail, password: adminPassword })
  const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!
  const enrolled = await (await request(app, 'POST', '/api/account/mfa/enrol', {}, cookie)).json() as { secret: string }
  adminSecret = enrolled.secret
  await request(app, 'POST', '/api/account/mfa/confirm', { code: await codeForStep(adminSecret, stepFor(new Date())) }, cookie)
  expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', adminEmail, app.databaseFile]).exitCode).toBe(0)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

// The window is not the viewport (K-102): a page wider than it forces the scroll this exists
// to remove, so the check is against the document itself rather than a single element.
async function hasNoHorizontalOverflow(view: Bun.WebView): Promise<boolean> {
  return view.evaluate<boolean>('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1')
}

async function signInAsBoxOffice(view: Bun.WebView): Promise<void> {
  // Hydrated before the address is typed: the form reveals the password only then (0103).
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', boxOffice.email)
  await fill(view, 'form input[type="password"]', boxOfficePassword)
  await click(view, 'form button[type="submit"]')
  await finishSignIn(app, view, boxOffice.email)
}

async function signInAsAdmin(view: Bun.WebView): Promise<void> {
  // Hydrated before the address is typed: the form reveals the password only then (0103).
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', adminEmail)
  await fill(view, 'form input[type="password"]', adminPassword)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, 'document.querySelectorAll(\'[data-test="mfa-challenge"] input\').length >= 6')
  forgetSpentStep(app, adminEmail)
  await fillPin(view, '[data-test="mfa-challenge"] input', await codeForStep(adminSecret, stepFor(new Date())))
  await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')
}

describe.skipIf(skip !== null)('console list tables fit a phone width (922)', () => {
  test('box office shows has no horizontal overflow at 390px', async () => {
    const view = await openSignedOutView(app.baseURL, PHONE)
    try {
      await signInAsBoxOffice(view)
      await view.navigate(`${app.baseURL}/box-office/shows`)
      await waitFor(view, 'document.querySelector(\'main\')')
      expect(await hasNoHorizontalOverflow(view)).toBe(true)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('admin/audit and admin/backups fit 390px and show a card list, not the table', async () => {
    const view = await openSignedOutView(app.baseURL, PHONE)
    try {
      await signInAsAdmin(view)

      for (const [path, tableTest, cardTest] of [
        ['/admin/audit', 'audit-table', 'audit-cards'],
        ['/admin/backups', 'drills-table', 'drills-cards'],
      ] as const) {
        await view.navigate(`${app.baseURL}${path}`)
        // The console shell renders no main of its own, so the list itself is what arrives.
        await waitFor(view, `document.querySelector('[data-test="${tableTest}"], [data-test="${cardTest}"]')`)
        expect(await hasNoHorizontalOverflow(view)).toBe(true)

        const shape = await view.evaluate<{ table: string | null, cards: string | null }>(`(() => {
          const table = document.querySelector('[data-test="${tableTest}"]')
          const cards = document.querySelector('[data-test="${cardTest}"]')
          return {
            table: table ? getComputedStyle(table).display : null,
            cards: cards ? getComputedStyle(cards).display : null,
          }
        })()`)
        expect(shape.table).toBe('none')
        expect(shape.cards === null || shape.cards !== 'none').toBe(true)
      }
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('box office shows uses the full table at 1280px', async () => {
    const view = await openSignedOutView(app.baseURL, { width: 1280, height: 800 })
    try {
      await signInAsBoxOffice(view)
      await view.navigate(`${app.baseURL}/box-office/shows`)
      await waitFor(view, 'document.querySelector(\'main\')')
      const display = await view.evaluate<string | null>(
        '(() => { const t = document.querySelector(\'[data-test="shows-table"]\'); return t ? getComputedStyle(t).display : null })()',
      )
      expect(display).not.toBe('none')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})
