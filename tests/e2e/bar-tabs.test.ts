import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-109: the console register every holder still carrying a tab balance, itemised, with void
// behind a mandatory reason, the manager's own call and never the till's.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let barManager: TestMember
let member: TestMember
const barManagerPassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  barManager = await registerMember(app, 'tabs-console-manager', barManagerPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: barManager.id, role: 'BAR_MANAGER' }, officer.cookie)
  member = await registerMember(app, 'tabs-console-ordinary', generatePassword())
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = officer.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`

function programme(suffix: string): { venueId: string, performanceId: string } {
  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix })
    return { venueId: made.venueId, performanceId: made.performanceId }
  }
  finally {
    database.close()
  }
}

const today = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

const setCap = (pence: number): Promise<Response> => send('PUT', '/api/admin/config/BAR_TAB_CAP_PENCE', { value: pence })
const authorise = (userIds: string[]): Promise<Response> => send('PUT', '/api/admin/config/BAR_AUTHORISED_TAB_HOLDERS', { value: userIds })

// The manager's own bar.write already satisfies the officer bypass, so opening the till for them
// needs no confirmed shift, unlike ordinary bar staff.
const openTill = (venueId: string): Promise<Response> => send('POST', '/api/till', { venueId }, barManager.cookie)

async function aSellableProduct(pricePence: number): Promise<{ variantId: string }> {
  const categoryAnswered = await send('POST', '/api/admin/bar/categories', { name: named('Spirits') })
  const { id: categoryId } = await categoryAnswered.json() as { id: string }
  const productAnswered = await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId })
  const { id: productId } = await productAnswered.json() as { id: string }
  const variantAnswered = await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' })
  const { id: variantId } = await variantAnswered.json() as { id: string }
  await send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence, effectiveFrom: today() })
  await send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })
  return { variantId }
}

const charge = (venueId: string, variantId: string, pricePence: number, tabHolderId: string): Promise<Response> =>
  send('POST', '/api/till/sale', { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: pricePence, tabHolderId }, barManager.cookie)

describe.skipIf(skip !== null)('the tab register lists every holder still carrying a balance (F-109 criterion 6)', () => {
  test('a charge appears in the register, and the itemised tab shows what it was for', async () => {
    const { venueId } = programme(`tabs-console-${crypto.randomUUID().slice(0, 6)}`)
    const holder = await registerMember(app, 'tabs-console-holder', generatePassword())
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId)
    await authorise([holder.id])
    await setCap(2000)

    expect((await charge(venueId, variantId, 500, holder.id)).status).toBe(200)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barManagerPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/bar/tabs`, `[data-test="view-tab-${holder.id}"]`)
    expect(await textOf(view, '[data-test="bar-tabs-table"]')).toContain('£5.00')

    await click(view, `[data-test="view-tab-${holder.id}"]`)
    await waitFor(view, `document.querySelector('[data-test="tab-charges"]')`)
    expect(await textOf(view, '[data-test="tab-charges"]')).toContain('£5.00')
    view.close()
  }, 120_000)

  test('voiding a charge behind a reason clears it from the balance, and a blank reason is refused', async () => {
    const { venueId } = programme(`tabs-void-${crypto.randomUUID().slice(0, 6)}`)
    const holder = await registerMember(app, 'tabs-console-void', generatePassword())
    const { variantId } = await aSellableProduct(700)
    await openTill(venueId)
    await authorise([holder.id])
    await setCap(2000)

    expect((await charge(venueId, variantId, 700, holder.id)).status).toBe(200)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barManagerPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/bar/tabs`, `[data-test="view-tab-${holder.id}"]`)
    await click(view, `[data-test="view-tab-${holder.id}"]`)
    await waitFor(view, `document.querySelector('[data-test="tab-charges"]')`)

    const entryTest = await view.evaluate<string>(
      `document.querySelector('[data-test="tab-charges"] [data-test^="charge-"]').getAttribute('data-test')`,
    )
    await click(view, `[data-test^="void-"]`)
    await waitFor(view, `document.querySelector('[data-test="confirm-void"]')`)

    // A void needs a reason on the record: submitting blank is refused, not silently accepted.
    await click(view, '[data-test="confirm-void"]')
    await waitFor(view, `document.querySelector('[data-test="void-failure"]')`)

    await fill(view, '[data-test="void-reason"]', 'Rung up against the wrong holder')
    await click(view, '[data-test="confirm-void"]')
    await waitFor(view, `document.querySelector('[data-test="${entryTest}"]').textContent.includes('Voided')`)

    view.close()

    // The credit nets the balance to nothing: the holder no longer carries any outstanding tab.
    const after = await send('GET', `/api/admin/bar/tabs/${holder.id}`)
    const body = await after.json() as { tab: { outstandingPence: number } }
    expect(body.tab.outstandingPence).toBe(0)
  }, 120_000)
})

describe.skipIf(skip !== null)('who may read and change the register (F-111 criterion 5)', () => {
  test('an ordinary member reads nothing', async () => {
    expect((await send('GET', '/api/admin/bar/tabs', undefined, member.cookie)).status).toBe(403)
  })

  test('a signed-out caller is refused', async () => {
    expect([401, 403]).toContain((await send('GET', '/api/admin/bar/tabs', undefined, '')).status)
  })
})
