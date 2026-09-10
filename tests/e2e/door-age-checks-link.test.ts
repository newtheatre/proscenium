import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-118 criterion 4's own door half, unbuilt until a door screen existed to link into (#457):
// the register is now reachable standalone from /tonight/door, the same as from /tonight itself.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let admin: TestMember
let doorPassword: string
let door: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  doorPassword = generatePassword()
  door = await registerMember(app, 'door-age-link', doorPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: door.id, role: 'FOH_MANAGER' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    tonightsPerformance(sqliteTarget(database), { suffix: 'door-age-link' })
  }
  finally {
    database.close()
  }
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

describe.skipIf(skip !== null)('the Challenge 25 register is reachable from the door (E-118 criterion 4)', () => {
  test('a link on /tonight/door points at /tonight/age-checks', async () => {
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', door.email)
      await fill(view, 'form input[type="password"]', doorPassword)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

      await visit(view, `${app.baseURL}/tonight/door`, '[data-test="link-age-checks"]')
      const href = await view.evaluate<string>(
        `document.querySelector('[data-test="link-age-checks"]').getAttribute('href')`,
      )
      expect(href).toBe('/tonight/age-checks')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
