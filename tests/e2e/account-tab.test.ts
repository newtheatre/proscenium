import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, finishSignIn, grantRole, registerMember } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import { putOnTheTill, tabCodeOf } from '#tests/helpers/bar'
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
  await grantRole(app, barManager, 'FOH_MANAGER', officer.cookie)
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

async function aSellableProduct(pricePence: number, ageRestricted = false): Promise<{ variantId: string }> {
  const categoryAnswered = await send('POST', '/api/admin/bar/categories', { name: named('Spirits') })
  const { id: categoryId } = await categoryAnswered.json() as { id: string }
  const productAnswered = await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId, ageRestricted })
  const { id: productId } = await productAnswered.json() as { id: string }
  const variantAnswered = await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' })
  const { id: variantId } = await variantAnswered.json() as { id: string }
  await send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence, effectiveFrom: today() })
  await putOnTheTill(send, productId)
  return { variantId }
}

const charge = async (venueId: string, variantId: string, pricePence: number, holder: TestMember): Promise<Response> =>
  send('POST', '/api/till/sale', { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: pricePence, tabHolderId: holder.id, tabCode: await tabCodeOf(app.baseURL, holder.cookie) }, barManager.cookie)

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
    await finishSignIn(app, view, member.email)

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

    expect((await charge(venueId, variantId, 650, holder)).status).toBe(200)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', holder.email)
    await fill(view, 'form input[type="password"]', password)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, holder.email)

    await visit(view, `${app.baseURL}/account/bar-tab`, `[data-test="account-tab-page"]`)
    expect(await textOf(view, '[data-test="account-tab-outstanding"]')).toContain('£6.50')
    expect(await textOf(view, '[data-test="account-tab-charges"]')).toContain('£6.50')

    // Tonight's code is what the bar asks for before charging this tab (F-108 criterion 6).
    const code = (await tabCodeOf(app.baseURL, holder.cookie))!
    expect((await textOf(view, '[data-test="account-tab-code-text"]')).trim().replace('-', '')).toBe(code)
    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="account-tab-code-qr"]')`)).toBe(true)
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

    const charged = await charge(venueId, variantId, 500, holder)
    expect(charged.status).toBe(200)
    const { entryId } = await charged.json() as { entryId: string }

    expect((await settle(venueId, holder.id, [entryId], 500)).status).toBe(200)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', holder.email)
    await fill(view, 'form input[type="password"]', password)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, holder.email)

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

    const charged = await charge(venueId, variantId, 500, holder)
    expect(charged.status).toBe(200)
    const { entryId } = await charged.json() as { entryId: string }

    expect((await voidCharge(entryId, 'Rung up against the wrong holder')).status).toBe(200)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', holder.email)
    await fill(view, 'form input[type="password"]', password)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, holder.email)

    await visit(view, `${app.baseURL}/account/bar-tab`, `[data-test="account-tab-page"]`)
    expect(await textOf(view, '[data-test="account-tab-outstanding"]')).toContain('£0.00')
    expect(await textOf(view, `[data-test="charge-${entryId}"]`)).toContain('Voided')
    view.close()
  }, 120_000)
})

describe.skipIf(skip !== null)('a holder adds to their own tab with nobody on the till (F-108 criterion 7)', () => {
  const addToOwnTab = (venueId: string, variantId: string, expectedTotalPence: number, as: string): Promise<Response> =>
    send('POST', '/api/account/tab/charge', { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence }, as)

  async function message(response: Response): Promise<string> {
    const body = await response.json() as { statusMessage?: string, message?: string }
    return body.statusMessage ?? body.message ?? ''
  }

  function latestEntry(): { tender: string, actor_id: string, tab_debtor_id: string | null } | undefined {
    const database = new Database(app.databaseFile, { readonly: true })
    try {
      return database.query('SELECT tender, actor_id, tab_debtor_id FROM ledger_entries ORDER BY rowid DESC LIMIT 1').get() as never
    }
    finally {
      database.close()
    }
  }

  test('a holder\'s own addition posts as a tab charge, the holder both serving and owing', async () => {
    const { venueId } = programme(`self-tab-${crypto.randomUUID().slice(0, 6)}`)
    const holder = await registerMember(app, 'self-tab-holder', generatePassword())
    const { variantId } = await aSellableProduct(450)
    await openTill(venueId)
    await authorise([holder.id])
    await setCap(2000)

    const bar = await send('GET', '/api/account/tab/bar', undefined, holder.cookie)
    expect(bar.status).toBe(200)
    const offered = await bar.json() as { bars: { venueId: string }[], catalogue: { products: { variants: { id: string }[] }[] } }
    expect(offered.bars.map(one => one.venueId)).toContain(venueId)
    expect(offered.catalogue.products.flatMap(product => product.variants.map(variant => variant.id))).toContain(variantId)

    const answered = await addToOwnTab(venueId, variantId, 450, holder.cookie)
    expect(answered.status).toBe(200)
    expect(latestEntry()).toMatchObject({ tender: 'TAB', actor_id: holder.id, tab_debtor_id: holder.id })
  })

  test('somebody who holds no tab is refused, and so is a bar whose till is shut', async () => {
    const { venueId } = programme(`self-tab-refused-${crypto.randomUUID().slice(0, 6)}`)
    const holder = await registerMember(app, 'self-tab-shut', generatePassword())
    const outsider = await registerMember(app, 'self-tab-outsider', generatePassword())
    const { variantId } = await aSellableProduct(450)
    await authorise([holder.id])

    const notAHolder = await addToOwnTab(venueId, variantId, 450, outsider.cookie)
    expect(notAHolder.status).toBe(403)
    expect(await message(notAHolder)).toContain('not authorised to run a tab')

    const shut = await addToOwnTab(venueId, variantId, 450, holder.cookie)
    expect(shut.status).toBe(409)
    expect(await message(shut)).toContain('till is not open tonight')
  })

  test('a restricted drink is left to the bar, and is not offered', async () => {
    const { venueId } = programme(`self-tab-c25-${crypto.randomUUID().slice(0, 6)}`)
    const holder = await registerMember(app, 'self-tab-c25', generatePassword())
    const { variantId } = await aSellableProduct(500, true)
    await openTill(venueId)
    await authorise([holder.id])
    await setCap(2000)

    const offered = await (await send('GET', '/api/account/tab/bar', undefined, holder.cookie)).json() as { catalogue: { products: { variants: { id: string }[] }[] } }
    expect(offered.catalogue.products.flatMap(product => product.variants.map(variant => variant.id))).not.toContain(variantId)

    const answered = await addToOwnTab(venueId, variantId, 500, holder.cookie)
    expect(answered.status).toBe(409)
    expect(await message(answered)).toContain('Challenge 25')
  })

  test('the cap holds, and the holder cannot wave it for themselves', async () => {
    const { venueId } = programme(`self-tab-cap-${crypto.randomUUID().slice(0, 6)}`)
    const holder = await registerMember(app, 'self-tab-cap', generatePassword())
    const { variantId } = await aSellableProduct(1500)
    await openTill(venueId)
    await authorise([holder.id])
    await setCap(2000)

    expect((await addToOwnTab(venueId, variantId, 1500, holder.cookie)).status).toBe(200)
    const over = await addToOwnTab(venueId, variantId, 1500, holder.cookie)
    // The holder is the one charging, so the cap's own-tab refusal answers, never an override (0116).
    expect(over.status).toBe(403)
    expect(await message(over)).toContain('nobody overrides the cap on their own tab')
  })

  test('the screen adds a drink and the balance follows', async () => {
    const { venueId } = programme(`self-tab-screen-${crypto.randomUUID().slice(0, 6)}`)
    const password = generatePassword()
    const holder = await registerMember(app, 'self-tab-screen', password)
    const { variantId } = await aSellableProduct(350)
    await openTill(venueId)
    await authorise([holder.id])
    await setCap(5000)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', holder.email)
    await fill(view, 'form input[type="password"]', password)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, holder.email)

    await visit(view, `${app.baseURL}/account/bar-tab`, `[data-test="self-tab"]`)
    // Several bars may be open in a shared test database, so this one is picked when offered.
    await view.evaluate(`document.querySelector('[data-test="self-tab-bar-${venueId}"]')?.click()`)
    await click(view, `[data-test="self-tab-more-${variantId}"]`)
    await waitFor(view, `document.querySelector('[data-test="self-tab-charge"]')?.textContent.includes('£3.50')`)
    await click(view, '[data-test="self-tab-charge"]')
    await waitFor(view, `document.querySelector('[data-test="self-tab-added"]')`)
    await waitFor(view, `document.querySelector('[data-test="account-tab-outstanding"]')?.textContent.includes('£3.50')`)
    view.close()
  }, 120_000)
})
