// The desk in a real browser: Sell is the till with Box office's panel first. A seller sells
// tickets to somebody at the desk for cash, then finds a reservation by its reference and takes
// payment for it, and the screen has no accessibility violations on the way.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (accountId: string, name: string, abilities: string[]) => ({ kind: 'person', accountId, name, assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(grant) })
const owner = person('acc_deskowner', 'Desk Owner', ['core.settings.manage', 'core.modules.manage', 'box-office.settings.manage', 'payments.settings.manage'])
const manager = person('acc_deskmanager', 'Desk Manager', ['core.production.create', 'core.production.edit', 'core.performance.schedule', 'core.venue.manage', 'box-office.performance.manage', 'box-office.pricing.manage', 'payments.provider.manage'])
const seller = person('acc_sallyseller', 'Sally Seller', ['payments.session.open', 'payments.attempt.attest', 'box-office.order.view', 'box-office.order.sell', 'box-office.order.take-payment'])
const office = person('acc_officeboss', 'Office Boss', ['payments.session.open', 'payments.attempt.attest', 'box-office.order.view', 'box-office.performance.manage', 'box-office.pricing.manage', 'box-office.ticket.admit', 'box-office.order.exchange', 'box-office.report.export'])
const producer = person('acc_compproducer', 'Pat Producer', ['box-office.comp.request'])
const approver = person('acc_compapprover', 'Alex Approver', ['box-office.comp.request', 'box-office.comp.approve'])
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const key = () => ({ 'idempotency-key': crypto.randomUUID() })
// Names are unique to a run, so a retry in a fresh worker can set the stage again.
const stamp = Date.now() % 1_000_000
const typeName = `Desk price ${stamp}`
let reference = ''
let swapping = ''
let group = ''
let amending = ''
const premiumName = `Premium ${stamp}`
let premium = { bandId: '', ticketTypeId: '' }
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
  await set([{ key: 'payments.cash.enabled', value: true }]) // these sell for cash, which a theatre turns on
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
  const dearer = await post(api, '/api/box-office/ticket-types', { name: premiumName })
  premium = { bandId: band.bandId, ticketTypeId: dearer.ticketTypeId }
  await post(api, `/api/box-office/productions/${production.id}/prices`, { prices: [{ bandId: band.bandId, ticketTypeId: type.ticketTypeId, amountMinor: 1200 }, { bandId: band.bandId, ticketTypeId: dearer.ticketTypeId, amountMinor: 1500 }] })
  await post(api, '/api/payments/providers', { provider: 'cash', label: 'Desk cash', channels: ['desk'], mode: 'live' })
  await post(api, `/api/box-office/performances/${performance.id}/sales/open`, {})
  await api.dispose()

  // Somebody reserves one ticket online, to pay for on arrival.
  const buyer = await playwright.request.newContext(base)
  const basket = await post(buyer, '/api/box-office/baskets', { performanceId: performance.id, lines: [{ bandId: band.bandId, ticketTypeId: type.ticketTypeId, quantity: 1 }] })
  const reserved = await post(buyer, `/api/box-office/baskets/${basket.orderId}/reserve`, { expectedTotalMinor: 1200, email: 'desk.buyer@example.org', name: 'Desk Buyer' }, { 'x-basket-token': basket.token })
  expect(reserved.state).toBe('reserved')
  reference = reserved.reference
  // And another, to pay for and then exchange for a dearer ticket.
  const second = await post(buyer, '/api/box-office/baskets', { performanceId: performance.id, lines: [{ bandId: band.bandId, ticketTypeId: type.ticketTypeId, quantity: 1 }] })
  swapping = (await post(buyer, `/api/box-office/baskets/${second.orderId}/reserve`, { expectedTotalMinor: 1200, email: 'desk.swapper@example.org', name: 'Desk Swapper' }, { 'x-basket-token': second.token })).reference
  // And three for a group who will pay separately.
  const third = await post(buyer, '/api/box-office/baskets', { performanceId: performance.id, lines: [{ bandId: band.bandId, ticketTypeId: type.ticketTypeId, quantity: 3 }] })
  group = (await post(buyer, `/api/box-office/baskets/${third.orderId}/reserve`, { expectedTotalMinor: 3600, email: 'desk.group@example.org', name: 'Desk Group' }, { 'x-basket-token': third.token })).reference
  // And two for a couple who turn up wanting something different.
  const fourth = await post(buyer, '/api/box-office/baskets', { performanceId: performance.id, lines: [{ bandId: band.bandId, ticketTypeId: type.ticketTypeId, quantity: 2 }] })
  amending = (await post(buyer, `/api/box-office/baskets/${fourth.orderId}/reserve`, { expectedTotalMinor: 2400, email: 'desk.couple@example.org', name: 'Desk Couple' }, { 'x-basket-token': fourth.token })).reference
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

test('Sell splits a reservation so one of a group pays for their own tickets', async ({ page }) => {
  await visit(page, '/console/box-office/sell')
  await page.getByRole('tab', { name: 'Collect a reservation' }).click()
  await page.getByLabel(/^Booking reference or desk code/).fill(group)
  await page.getByRole('button', { name: 'Find' }).click()
  await expect(page.getByText('To pay: £36.00')).toBeVisible()
  await page.getByRole('button', { name: 'Pay for some of these' }).click()
  const boxes = page.getByRole('checkbox', { name: /, £12\.00$/ })
  await expect(boxes).toHaveCount(3)
  await boxes.nth(0).check()
  await expect(page.getByRole('button', { name: 'Pay for 1 separately' })).toBeEnabled()
  await noViolations(page)
  await page.getByRole('button', { name: 'Pay for 1 separately' }).click()
  await expect(page.getByText(`The rest stay reserved on ${group}, £24.00 still to pay.`)).toBeVisible()
  await expect(page.getByRole('heading', { name: `Booking ${group}` })).toHaveCount(0)
  await expect(page.getByText('To pay: £12.00')).toBeVisible()
  await payCash(page, '£12.00')

  await page.getByLabel(/^Booking reference or desk code/).fill(group)
  await page.getByRole('button', { name: 'Find' }).click()
  await expect(page.getByText('To pay: £24.00')).toBeVisible()
})

test('Sell takes the difference on an exchange for a dearer ticket', async ({ page, browser, playwright }) => {
  await visit(page, '/console/box-office/sell')
  await page.getByRole('tab', { name: 'Collect a reservation' }).click()
  await page.getByLabel(/^Booking reference or desk code/).fill(swapping)
  await page.getByRole('button', { name: 'Find' }).click()
  await payCash(page, '£12.00')

  // Whoever sold a booking does not exchange it themselves: someone else in the office does, at their own till.
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(office) })
  const found = await (await api.get(`/api/box-office/desk/orders?q=${swapping}`)).json()
  expect([200, 409]).toContain((await api.post('/api/payments/sessions', { data: { pointLabel: 'Office till' }, headers: key() })).status())
  await api.dispose()
  const booking = found.orders[0]
  const exchange = { orderId: booking.orderId, reference: swapping, performanceId, lines: [{ lineId: booking.lines[0].id, ...premium }], expectedDifferenceMinor: 300 }
  const officeContext = await browser.newContext(as(office))
  page = await officeContext.newPage()
  await visit(page, `/console/box-office/sell?exchange=${encodeURIComponent(JSON.stringify(exchange))}`)
  await expect(page.getByRole('heading', { name: `Exchange on booking ${swapping}` })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Take payment of £3.00' })).toBeEnabled()
  await noViolations(page)
  await payCash(page, '£3.00')

  await page.getByRole('tab', { name: 'Collect a reservation' }).click()
  await page.getByLabel(/^Booking reference or desk code/).fill(swapping)
  await page.getByRole('button', { name: 'Find' }).click()
  await expect(page.getByText(premiumName)).toBeVisible()
  await officeContext.close()
})

test('the till in live mode shows each panel as a tab over one basket', async ({ browser }) => {
  // The gallery's sample panel stands in for the bar, so this seller has two panels.
  const context = await browser.newContext(as({ ...seller, grants: [...seller.grants, grant('gallery.sample.view')] }))
  const page = await context.newPage()
  await visit(page, '/live/till')
  await expect(page.getByRole('heading', { level: 1, name: 'Till' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Tickets', exact: true })).toHaveAttribute('aria-selected', 'true') // the first panel shows until another is picked
  await page.getByRole('tab', { name: 'Gallery programmes' }).click()
  await page.getByLabel('Programmes sold').fill('2')
  await page.getByLabel('Programmes sold').blur()
  await expect(page.getByRole('button', { name: 'Take payment of £6.00' })).toBeEnabled()
  await expect(page.getByRole('tab', { name: /^Gallery programmes/ })).toContainText('1')
  await noViolations(page)
  await context.close()
})

test('the till in live mode collects a reservation, changed to who came, and takes payment', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 }) // a tablet held upright, as at a desk
  await visit(page, '/live/till')
  await page.getByRole('tab', { name: 'Collect a reservation' }).click()
  await page.getByLabel(/^Booking reference or desk code/).fill(amending)
  await page.getByRole('button', { name: 'Find' }).click()
  await expect(page.getByText('To pay: £24.00')).toBeVisible()
  // One of them wants the dearer seat, and the other could not come.
  await page.getByRole('combobox', { name: 'Kind of ticket for line 1' }).click()
  await page.getByRole('option', { name: new RegExp(premiumName) }).click()
  await expect(page.getByText('To pay: £27.00')).toBeVisible()
  await page.getByRole('button', { name: `Remove ${typeName}` }).click()
  await expect(page.getByText('To pay: £15.00')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Take payment of £15.00' })).toBeEnabled()
  await noViolations(page)
  await page.getByRole('button', { name: 'Take payment of £15.00' }).click()
  await page.getByRole('radio', { name: 'Cash' }).first().check()
  await page.getByRole('button', { name: 'Cash taken' }).click()
  await expect(page.getByText('Nothing to pay.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Take payment of £0.00' })).toBeDisabled()
})

test.describe('the box office console', () => {
  test.use(as(office))

  test('Orders, Performances, a set-up, its door list (admitting by name), the sales report and Ticket types open with no accessibility violations', async ({ page }) => {
    await visit(page, '/console/box-office/orders')
    await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible()
    await page.getByRole('searchbox').first().fill(reference)
    await page.getByRole('link', { name: reference, exact: true }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: `Order ${reference}` })).toBeVisible()
    await noViolations(page)
    // The exchange dialogue opens from the order's actions, and shows its options without violations.
    await page.getByRole('button', { name: /More actions/ }).click()
    await page.getByRole('menuitem', { name: 'Exchange tickets' }).click()
    await expect(page.getByRole('dialog', { name: 'Exchange tickets' })).toBeVisible()
    await noViolations(page)
    // Choosing a performance gives each ticket its own choice, starting from what it is now.
    await page.getByLabel(/^New performance/).click()
    await page.getByRole('option').first().click()
    await expect(page.getByRole('group', { name: 'New seats and ticket type for each ticket' })).toBeVisible()
    // Its own performance, with each ticket starting as it is, is nothing to exchange.
    await expect(page.getByRole('alert').filter({ hasText: 'already for that performance, seats and ticket type' })).toBeVisible()
    await noViolations(page)
    await page.keyboard.press('Escape')

    await visit(page, '/console/box-office/performances')
    await expect(page.getByRole('heading', { level: 1, name: 'Performances' })).toBeVisible()
    await noViolations(page)

    await visit(page, `/console/box-office/performances/${performanceId}`)
    await expect(page.getByRole('heading', { name: 'Seats to sell' })).toBeVisible()
    await expect(page.getByText('On sale', { exact: true }).first()).toBeVisible()
    await noViolations(page)

    // The Bulk cancellation screen, as the core's refusal to cancel links to it.
    await visit(page, `/console/box-office/performances/${performanceId}/change?for=cancel`)
    await expect(page.getByRole('heading', { name: 'What happens to them' })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Refund everyone/ })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Keep the bookings/ })).toHaveCount(0)
    await noViolations(page)

    await visit(page, `/console/box-office/performances/${performanceId}/door`)
    await expect(page.getByRole('heading', { level: 1, name: 'Door list' })).toBeVisible()
    await noViolations(page)
    // The reservation was paid for at the desk: its buyer is admitted from the list by name.
    await page.getByRole('button', { name: `Admit one ticket for ${reference}` }).click()
    await expect(page.getByText('1 admitted').first()).toBeVisible()
    await expect(page.getByRole('button', { name: `Admit one ticket for ${reference}` })).toHaveCount(0)

    await visit(page, '/console/box-office/reports/sales')
    await expect(page.getByRole('heading', { level: 1, name: 'Sales report' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Download as CSV' })).toBeVisible()
    await noViolations(page)

    await visit(page, '/admin/modules/box-office/ticket-types')
    await expect(page.getByText(typeName)).toBeVisible()
    await noViolations(page)
  })

  test('a retired ticket type folds away under Retired, and Undo brings it back', async ({ page }) => {
    const spare = `Spare ${stamp}`
    expect((await page.request.post('/api/box-office/ticket-types', { data: { name: spare }, headers: key() })).ok()).toBe(true)
    await visit(page, '/admin/modules/box-office/ticket-types')
    await page.getByRole('button', { name: `Actions for ${spare}` }).click()
    await page.getByRole('menuitem', { name: 'Retire' }).click()
    await expect(page.getByRole('button', { name: /^Retired \(\d+\)$/ })).toBeVisible()
    await expect(page.getByText(spare, { exact: true })).toBeHidden()
    await page.locator('button', { hasText: 'Undo' }).click()
    await expect(page.getByText(spare, { exact: true })).toBeVisible()
    // The search finds a type by name.
    await page.getByRole('button', { name: 'Search ticket types' }).click()
    await page.getByRole('searchbox', { name: 'Search ticket types' }).fill(spare)
    await expect(page.getByText(typeName, { exact: true })).toBeHidden()
    await expect(page.getByText(spare, { exact: true })).toBeVisible()
    await noViolations(page)
  })
})

test.describe('complimentary tickets', () => {
  // Box office keeps its own Complimentary ticket type, so nothing has to be added first.
  test('a producer asks for tickets and an approver approves and sends them, with no accessibility violations', async ({ browser }) => {
    const askingContext = await browser.newContext(as(producer))
    const asking = await askingContext.newPage()
    await visit(asking, '/console/box-office/comps')
    await expect(asking.getByRole('heading', { level: 1, name: 'Complimentary tickets' })).toBeVisible()
    await noViolations(asking)
    await asking.getByRole('combobox', { name: 'Performance' }).click()
    await asking.getByRole('option', { name: /The Desk Show/ }).first().click()
    await asking.getByRole('combobox', { name: 'Why' }).click()
    await asking.getByRole('option', { name: 'Press' }).click()
    await asking.getByLabel('Their name').fill('Rita Reviewer')
    await asking.getByLabel('Their email address').fill(`rita.${stamp}@example.org`)
    await asking.getByRole('button', { name: 'Send request' }).click()
    await expect(asking.getByText('Request sent').first()).toBeVisible()
    await expect(asking.getByText('For Rita Reviewer').first()).toBeVisible()
    await askingContext.close()

    const decidingContext = await browser.newContext(as(approver))
    const deciding = await decidingContext.newPage()
    await visit(deciding, '/console/box-office/comps')
    await expect(deciding.getByRole('heading', { name: 'Waiting for a decision' })).toBeVisible()
    await noViolations(deciding)
    await deciding.getByRole('button', { name: 'Approve and send' }).first().click()
    await expect(deciding.getByText('Approved, and the tickets sent').first()).toBeVisible()
    await decidingContext.close()
  })
})
