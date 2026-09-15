import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-109 criterion 1: the holder's own account shows every charge itemised, with the live
// outstanding balance, through the real screen rather than the API alone.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let barManager: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  barManager = await registerMember(app, 'account-tab-manager', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: barManager.id, role: 'BAR_MANAGER' }, officer.cookie)
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

function programme(suffix: string): { venueId: string } {
  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix })
    return { venueId: made.venueId }
  }
  finally {
    database.close()
  }
}

const today = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

const setCap = (pence: number): Promise<Response> => send('PUT', '/api/admin/config/BAR_TAB_CAP_PENCE', { value: pence })
const authorise = (userIds: string[]): Promise<Response> => send('PUT', '/api/admin/config/BAR_AUTHORISED_TAB_HOLDERS', { value: userIds })

// The manager's own bar.write already satisfies the officer bypass, so opening the till for them
// needs no confirmed shift.
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

const settle = (venueId: string, holderId: string, entryIds: string[], expectedTotalPence: number): Promise<Response> =>
  send('POST', '/api/till/tab-settlements', { venueId, holderId, entryIds, expectedTotalPence }, barManager.cookie)

const voidCharge = (entryId: string, reason: string): Promise<Response> =>
  send('POST', `/api/admin/bar/tab-charges/${entryId}/void`, { reason }, barManager.cookie)

describe.skipIf(skip !== null)('a holder reads their own tab, itemised and live (F-109 criterion 1)', () => {
  test('nothing charged reads as nothing owed, not a blank screen', async () => {
    const password = generatePassword()
    const member = await registerMember(app, 'account-tab-empty', password)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', member.email)
    await fill(view, 'form input[type="password"]', password)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/account/bar-tab`, `[data-test="account-tab-page"]`)
    expect(await textOf(view, '[data-test="account-tab-outstanding"]')).toContain('£0.00')
    expect(await textOf(view, '[data-test="account-tab-charges"]')).toContain('Nothing has ever been charged')
    view.close()
  }, 120_000)

  test('a charge shows itemised, and the balance is live', async () => {
    const { venueId } = programme(`account-tab-${crypto.randomUUID().slice(0, 6)}`)
    const password = generatePassword()
    const holder = await registerMember(app, 'account-tab-holder', password)
    const { variantId } = await aSellableProduct(650)
    await openTill(venueId)
    await authorise([holder.id])
    await setCap(2000)

    expect((await charge(venueId, variantId, 650, holder.id)).status).toBe(200)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', holder.email)
    await fill(view, 'form input[type="password"]', password)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/account/bar-tab`, `[data-test="account-tab-page"]`)
    expect(await textOf(view, '[data-test="account-tab-outstanding"]')).toContain('£6.50')
    expect(await textOf(view, '[data-test="account-tab-charges"]')).toContain('£6.50')
    view.close()
  }, 120_000)

  test('a settled charge reads Settled, and no longer counts against the outstanding balance', async () => {
    const { venueId } = programme(`account-tab-settled-${crypto.randomUUID().slice(0, 6)}`)
    const password = generatePassword()
    const holder = await registerMember(app, 'account-tab-settled', password)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId)
    await authorise([holder.id])
    await setCap(2000)

    const charged = await charge(venueId, variantId, 500, holder.id)
    expect(charged.status).toBe(200)
    const { entryId } = await charged.json() as { entryId: string }

    expect((await settle(venueId, holder.id, [entryId], 500)).status).toBe(200)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', holder.email)
    await fill(view, 'form input[type="password"]', password)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/account/bar-tab`, `[data-test="account-tab-page"]`)
    expect(await textOf(view, '[data-test="account-tab-outstanding"]')).toContain('£0.00')
    expect(await textOf(view, `[data-test="charge-${entryId}"]`)).toContain('Settled')
    view.close()
  }, 120_000)

  test('a voided charge reads Voided, and no longer counts against the outstanding balance', async () => {
    const { venueId } = programme(`account-tab-voided-${crypto.randomUUID().slice(0, 6)}`)
    const password = generatePassword()
    const holder = await registerMember(app, 'account-tab-voided', password)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId)
    await authorise([holder.id])
    await setCap(2000)

    const charged = await charge(venueId, variantId, 500, holder.id)
    expect(charged.status).toBe(200)
    const { entryId } = await charged.json() as { entryId: string }

    expect((await voidCharge(entryId, 'Rung up against the wrong holder')).status).toBe(200)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', holder.email)
    await fill(view, 'form input[type="password"]', password)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/account/bar-tab`, `[data-test="account-tab-page"]`)
    expect(await textOf(view, '[data-test="account-tab-outstanding"]')).toContain('£0.00')
    expect(await textOf(view, `[data-test="charge-${entryId}"]`)).toContain('Voided')
    view.close()
  }, 120_000)
})
