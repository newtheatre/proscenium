// The desk in a real browser: Sell is the till with Box office's panel first. A seller sells
// tickets to somebody at the desk for cash, then finds a reservation by its reference and takes
// payment for it, and the screen has no accessibility violations on the way.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (accountId: string, name: string, abilities: string[]) => ({ kind: 'person', accountId, name, assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(grant) })
const owner = person('acc_deskowner', 'Desk Owner', ['core.settings.manage', 'core.modules.manage', 'box-office.settings.manage'])
const manager = person('acc_deskmanager', 'Desk Manager', ['core.production.create', 'core.production.edit', 'core.performance.schedule', 'core.venue.manage', 'box-office.performance.manage', 'box-office.pricing.manage', 'payments.provider.manage'])
const seller = person('acc_sallyseller', 'Sally Seller', ['payments.session.open', 'payments.attempt.attest', 'box-office.order.view', 'box-office.order.sell', 'box-office.order.take-payment'])
const office = person('acc_officeboss', 'Office Boss', ['box-office.order.view', 'box-office.performance.manage', 'box-office.pricing.manage', 'box-office.ticket.admit'])
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const key = () => ({ 'idempotency-key': crypto.randomUUID() })
// Names are unique to a run, so a retry in a fresh worker can set the stage again.
const stamp = Date.now() % 1_000_000
const typeName = `Desk price ${stamp}`
let reference = ''
let performanceId = ''

async function post(api: APIRequestContext, path: string, data: unknown, headers: Record<string, string> = {}) {
  const response = await api.post(path, { data, headers: { ...key(), ...headers } })
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
  await set([{ key: 'core.rate-limits.default', value: { count: 10000, per: '1m' } }])
  // The till posts a sale to the ledger, which dates it in the theatre's time zone.
  await set([{ key: 'core.locale.time-zone', value: 'Europe/London' }])
  for (const id of ['finance', 'payments', 'box-office']) expect((await settings.put(`/api/core/modules/${id}`, { data: { on: true } })).ok()).toBe(true)
  await set([{ key: 'box-office.reservations.confirm-email', value: false }, { key: 'box-office.checkout.payment-timing', value: 'buyer-chooses' }])
  await settings.dispose()

  const api = await playwright.request.newContext({ ...base, ...as(manager) })
  const production = await post(api, '/api/core/productions', { title: 'The Desk Show', kind: 'own' })
  const venue = await post(api, '/api/core/venues', { name: `Desk Theatre ${stamp}` })
  const performance = await post(api, `/api/core/productions/${production.id}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: Date.now() + 86_400_000, capacity: 100 })
  await post(api, `/api/core/performances/${performance.id}/schedule`, {})
  performanceId = performance.id
  const type = await post(api, '/api/box-office/ticket-types', { name: typeName })
  const band = await post(api, `/api/box-office/productions/${production.id}/bands`, { name: 'Stalls' })
  expect((await api.put(`/api/box-office/performances/${performance.id}/sales`, { data: { pools: [{ bandId: band.bandId, capacity: 20 }] } })).ok()).toBe(true)
  await post(api, `/api/box-office/productions/${production.id}/prices`, { prices: [{ bandId: band.bandId, ticketTypeId: type.ticketTypeId, amountMinor: 1200 }] })
  await post(api, '/api/payments/providers', { provider: 'cash', label: 'Desk cash', channels: ['desk'], mode: 'live' })
  await post(api, `/api/box-office/performances/${performance.id}/sales/open`, {})
  await api.dispose()

  // Somebody reserves one ticket online, to pay for on arrival.
  const buyer = await playwright.request.newContext(base)
  const basket = await post(buyer, '/api/box-office/baskets', { performanceId: performance.id, lines: [{ bandId: band.bandId, ticketTypeId: type.ticketTypeId, quantity: 1 }] })
  const reserved = await post(buyer, `/api/box-office/baskets/${basket.orderId}/reserve`, { expectedTotalMinor: 1200, email: 'desk.buyer@example.org', name: 'Desk Buyer' }, { 'x-basket-token': basket.token })
  expect(reserved.state).toBe('reserved')
  reference = reserved.reference
  await buyer.dispose()

  const till = await playwright.request.newContext({ ...base, ...as(seller) })
  expect([200, 409]).toContain((await till.post('/api/payments/sessions', { data: { pointLabel: 'Box office desk' }, headers: key() })).status())
  await till.dispose()
})
test.use(as(seller))

async function visit(page: Page, url: string) {
  const response = await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  return response
}

async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

async function payCash(page: Page, amount: string) {
  await page.getByRole('button', { name: `Take payment of ${amount}` }).click()
  await expect(page.getByText(`Still to pay: ${amount}`)).toBeVisible()
  await page.getByRole('radio', { name: 'Cash' }).first().check()
  await page.getByRole('button', { name: 'Cash taken' }).click()
  await expect(page.getByText(`Paid: ${amount}`, { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Take payment of £0.00' })).toBeDisabled()
}

test('Sell sells tickets at the desk for cash', async ({ page }) => {
  const response = await visit(page, '/console/box-office/sell')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: 'Sell' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sell' }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tickets' })).toBeVisible()
  const quantity = page.getByLabel(`Stalls, ${typeName}, £12.00`)
  await quantity.fill('2')
  await quantity.blur()
  await page.getByRole('checkbox', { name: 'Admit now' }).check()
  await expect(page.getByRole('button', { name: 'Take payment of £24.00' })).toBeEnabled()
  await noViolations(page)
  await payCash(page, '£24.00')
})

test('Sell finds a reservation by its reference and takes payment for it', async ({ page }) => {
  await visit(page, '/console/box-office/sell')
  await page.getByRole('tab', { name: 'Collect a reservation' }).click()
  await page.getByLabel(/^Booking reference or desk code/).fill(reference.toLowerCase())
  await page.getByRole('button', { name: 'Find' }).click()
  await expect(page.getByRole('heading', { name: `Booking ${reference}` })).toBeVisible()
  await expect(page.getByText('Reserved, not paid')).toBeVisible()
  await expect(page.getByText('To pay: £12.00')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Take payment of £12.00' })).toBeEnabled()
  await noViolations(page)
  await payCash(page, '£12.00')
  // Found again, it is paid for.
  await page.getByRole('button', { name: 'Find' }).click()
  await expect(page.getByText('Nothing to pay.')).toBeVisible()
})

test.describe('the box office console', () => {
  test.use(as(office))

  test('Orders, Performances, a set-up, its door list and Ticket types open with no accessibility violations', async ({ page }) => {
    await visit(page, '/console/box-office/orders')
    await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible()
    await page.getByRole('searchbox').first().fill(reference)
    await page.getByRole('link', { name: reference, exact: true }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: `Order ${reference}` })).toBeVisible()
    await noViolations(page)

    await visit(page, '/console/box-office/performances')
    await expect(page.getByRole('heading', { level: 1, name: 'Performances' })).toBeVisible()
    await noViolations(page)

    await visit(page, `/console/box-office/performances/${performanceId}`)
    await expect(page.getByRole('heading', { name: 'Seats to sell' })).toBeVisible()
    await expect(page.getByText('On sale', { exact: true }).first()).toBeVisible()
    await noViolations(page)

    await visit(page, `/console/box-office/performances/${performanceId}/door`)
    await expect(page.getByRole('heading', { level: 1, name: 'Door list' })).toBeVisible()
    await noViolations(page)

    await visit(page, '/console/box-office/ticket-types')
    await expect(page.getByText(typeName)).toBeVisible()
    await noViolations(page)
  })
})
