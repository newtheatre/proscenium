// Booking online in a real browser: somebody who is not signed in chooses two tickets for a
// published production's performance, sees them held with a countdown on Check and pay, gives their
// name and address and reserves them to pay for at the box office, and each screen has no
// accessibility violations on the way. Then they open their booking from its link and cancel one
// of the two tickets. A buyer with paid tickets cancels one and is told what comes back.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (accountId: string, name: string, abilities: string[]) => ({ kind: 'person', accountId, name, assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(grant) })
const owner = person('acc_bookowner', 'Book Owner', ['core.settings.manage', 'core.modules.manage', 'box-office.settings.manage', 'core.vocabulary.manage'])
const manager = person('acc_bookmanager', 'Book Manager', ['core.production.create', 'core.production.edit', 'core.production.publish', 'core.performance.schedule', 'core.venue.manage', 'box-office.performance.manage', 'box-office.pricing.manage', 'payments.provider.manage'])
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const stamp = Date.now() % 1_000_000
const title = `The Booking Show ${stamp}`
let performanceId = ''

async function post(api: APIRequestContext, path: string, data: unknown, method: 'post' | 'patch' = 'post') {
  const response = await api[method](path, { data, headers: { 'idempotency-key': crypto.randomUUID() } })
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
  return response.json()
}

test.beforeAll(async ({ playwright }) => {
  const base = { baseURL: 'http://localhost:8788' }
  const settings = await playwright.request.newContext({ ...base, ...as(owner) })
  const set = async (changes: { key: string, value: unknown }[]) => {
    const response = await settings.put('/api/core/settings', { data: { changes, confirm: true } })
    expect(response.ok(), await response.text()).toBe(true)
  }
  await set([{ key: 'core.rate-limits.default', value: { count: 10000, per: '1m' } }, { key: 'core.rate-limits.write', value: { count: 10000, per: '1m' } }])
  await set([{ key: 'core.locale.time-zone', value: 'Europe/London' }])
  for (const id of ['finance', 'payments', 'box-office']) expect((await settings.put(`/api/core/modules/${id}`, { data: { on: true } })).ok()).toBe(true)
  await set([{ key: 'box-office.reservations.confirm-email', value: false }, { key: 'box-office.checkout.payment-timing', value: 'buyer-chooses' }])
  const categories = await (await settings.get('/api/core/vocabularies/core.production-category')).json()
  await settings.dispose()

  const api = await playwright.request.newContext({ ...base, ...as(manager) })
  const production = await post(api, '/api/core/productions', { title, kind: 'own' })
  await post(api, `/api/core/productions/${production.id}`, { summary: 'A show to book for.', categoryTermId: categories.terms[0].id, advisoriesConfirmedNone: true }, 'patch')
  const venue = await post(api, '/api/core/venues', { name: `Booking Theatre ${stamp}` })
  const performance = await post(api, `/api/core/productions/${production.id}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: Date.now() + 2 * 86_400_000, capacity: 100 })
  await post(api, `/api/core/performances/${performance.id}/schedule`, {})
  performanceId = performance.id
  const type = await post(api, '/api/box-office/ticket-types', { name: `Online price ${stamp}` })
  const band = await post(api, `/api/box-office/productions/${production.id}/bands`, { name: 'Circle' })
  expect((await api.put(`/api/box-office/performances/${performance.id}/sales`, { data: { pools: [{ bandId: band.bandId, capacity: 20 }] } })).ok()).toBe(true)
  await post(api, `/api/box-office/productions/${production.id}/prices`, { prices: [{ bandId: band.bandId, ticketTypeId: type.ticketTypeId, amountMinor: 1000 }] })
  await post(api, '/api/payments/providers', { provider: 'cash', label: `Box office cash ${stamp}`, channels: ['desk'], mode: 'live' })
  await post(api, `/api/box-office/performances/${performance.id}/sales/open`, {})
  await post(api, `/api/core/productions/${production.id}/publish`, {})
  await api.dispose()
})

async function visit(page: Page, url: string) {
  const response = await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  return response
}

async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test('a buyer chooses tickets, sees them held, and reserves them to pay at the box office', async ({ page }) => {
  // An old link with the wrong address for the production still finds the performance.
  await visit(page, `/book/an-old-name/${performanceId}`)
  await expect(page).not.toHaveURL(/an-old-name/)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Circle' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choose your tickets' })).toBeDisabled()
  await noViolations(page)

  await page.getByRole('button', { name: 'Increment' }).click()
  await page.getByRole('button', { name: 'Increment' }).click()
  await page.getByRole('button', { name: 'Hold 2 tickets, £20.00' }).click()

  await expect(page).toHaveURL(/\/book\/basket$/)
  await expect(page.getByRole('heading', { name: 'Check and pay' })).toBeVisible()
  await expect(page.getByText(/Held for \d+:\d\d/)).toBeVisible()
  await expect(page.getByText(`2 × Circle, Online price ${stamp}`)).toBeVisible()
  await page.getByLabel('Your name').fill('Online Buyer')
  await page.getByLabel('Email address').fill(`online.buyer.${stamp}@example.org`)
  await noViolations(page)

  await page.getByRole('button', { name: 'Reserve and pay £20.00 at the box office' }).click()
  await expect(page.getByRole('heading', { name: 'Your tickets are reserved' })).toBeVisible()
  await expect(page.getByText(/Booking reference: \S+/)).toBeVisible()
  await expect(page.getByText(/Box office code: \S+/)).toBeVisible()
  await noViolations(page)

  // Manage booking, from the link: one of the two tickets is cancelled, and its seat goes back on sale.
  await page.getByRole('link', { name: 'Manage your booking' }).click()
  await expect(page.getByRole('heading', { name: 'Your booking' })).toBeVisible()
  await expect(page.getByText('To pay at the box office: £20.00')).toBeVisible()
  await noViolations(page)
  await page.getByRole('checkbox', { name: /^Ticket 1:/ }).check()
  await page.getByRole('button', { name: 'Cancel 1 ticket' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel 1 ticket' }).click()
  await expect(page.getByText('1 ticket cancelled. Its seat is back on sale.')).toBeVisible()
  // The dialog fades out; checking it half-faded would judge its contrast mid-animation.
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByText('To pay at the box office: £10.00')).toBeVisible()
  await noViolations(page)

  // The basket is spent: coming back shows nothing held.
  await visit(page, '/book/basket')
  await expect(page.getByRole('heading', { name: 'Your basket is empty' })).toBeVisible()
})

test('a link that opens no booking says so, and a used confirmation link explains itself', async ({ page }) => {
  await visit(page, '/book/order/not-a-real-link')
  await expect(page.getByRole('heading', { name: 'This link does not open a booking' })).toBeVisible()
  await visit(page, '/book/confirm/not-a-real-link')
  await noViolations(page)
  await page.getByRole('button', { name: 'Confirm my reservation' }).click()
  await expect(page.getByText(/This link does not confirm a reservation/)).toBeVisible()
})

test('a production that is not published has no booking page', async ({ page }) => {
  const response = await visit(page, '/book/nothing/perf_nothing')
  expect(response?.status()).toBe(404)
})

test('a buyer cancels paid tickets from their link when the theatre allows it, and sees what comes back', async ({ page }) => {
  // A paid online booking needs a card provider, which this build has not got; the server's side is
  // covered by the integration tests. Here the page is given the booking, as the server sends it.
  const line = (n: number) => ({ id: `orl_e2e${n}`, performanceId, bandId: 'bnd_e2e', ticketTypeId: 'tty_e2e', ticketType: `Online price ${stamp}`, amountMinor: 1000 })
  const until = Date.now() + 86_400_000
  const booking = { orderId: 'ord_e2e', reference: 'E2E-PAID', state: 'confirmed', currency: 'GBP', totalMinor: 2000, amountDueMinor: 0, releaseAt: null, lines: [line(1), line(2)], buyerCancel: { feeMinor: 150, until } }
  let asked: unknown = null
  await page.route('**/api/box-office/orders/link', route => route.fulfill({ json: booking }))
  await page.route('**/api/box-office/orders/link/cancel', (route) => {
    asked = route.request().postDataJSON()
    return route.fulfill({ json: { ...booking, totalMinor: 1000, lines: [line(2)] } })
  })
  // Opened inside the app, so the browser asks for the booking and the stand-in answers.
  await visit(page, '/book/basket')
  await page.evaluate(() => (window as unknown as { useNuxtApp: () => { $router: { push: (to: string) => Promise<void> } } }).useNuxtApp().$router.push('/book/order/paid-link'))
  await expect(page.getByRole('heading', { name: 'Your booking' })).toBeVisible()
  await expect(page.getByText('Paid', { exact: true })).toBeVisible()
  await expect(page.getByText(/You can cancel until .+ Each ticket is refunded less a fee of £1\.50\./)).toBeVisible()
  await expect(page.getByText('To change or cancel a paid booking, contact the box office.')).toHaveCount(0)
  await noViolations(page)

  await page.getByRole('checkbox', { name: /^Ticket 1:/ }).check()
  await page.getByRole('button', { name: 'Cancel 1 ticket' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('£8.50 goes back to the card you paid with.', { exact: false })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel 1 ticket' }).click()
  await expect(page.getByText('1 ticket cancelled. Its seat is back on sale.')).toBeVisible()
  await expect(page.getByText('A refund of £8.50 is on its way to the card you paid with.', { exact: false })).toBeVisible()
  expect(asked).toEqual({ lineIds: ['orl_e2e1'] })
  await expect(dialog).toBeHidden()
  await noViolations(page)
})
