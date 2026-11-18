// The desk in a real browser: Sell is the till with Box office's panel first. A seller sells
// tickets to somebody at the desk for cash, then finds a reservation by its reference and takes
// payment for it, and the screen has no accessibility violations on the way.
import { test, expect, type APIRequestContext, type ConsoleMessage, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (accountId: string, name: string, abilities: string[]) => ({ kind: 'person', accountId, name, assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(grant) })
const owner = person('acc_deskowner', 'Desk Owner', ['core.settings.manage', 'core.modules.manage', 'box-office.settings.manage', 'payments.settings.manage'])
const manager = person('acc_deskmanager', 'Desk Manager', ['core.production.create', 'core.production.edit', 'core.performance.schedule', 'core.venue.manage', 'box-office.performance.manage', 'box-office.pricing.manage', 'payments.provider.manage', 'box-office.pass.manage'])
const seller = person('acc_sallyseller', 'Sally Seller', ['payments.session.open', 'payments.attempt.attest', 'box-office.order.view', 'box-office.order.sell', 'box-office.order.take-payment'])
const office = person('acc_officeboss', 'Office Boss', ['payments.session.open', 'payments.attempt.attest', 'box-office.order.view', 'box-office.performance.manage', 'box-office.pricing.manage', 'box-office.ticket.admit', 'box-office.order.exchange', 'box-office.report.export', 'box-office.promo.manage'])
const producer = person('acc_compproducer', 'Pat Producer', ['box-office.comp.request'])
const canceller = person('acc_deskcanceller', 'Cass Canceller', ['box-office.order.view', 'box-office.order.cancel', 'box-office.order.refund'])
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
let unfinished = ''
let cancelling = ''
const premiumName = `Premium ${stamp}`
let premium = { bandId: '', ticketTypeId: '' }
let performanceId = ''
const passName = `Desk season pass ${stamp}`
let passCode = ''

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
  // The theatre's usual ticket preset, if another test left one, may have made Stalls already.
  const existing = (await (await api.get(`/api/box-office/productions/${production.id}/bands`)).json()).bands.find((b: { name: string }) => b.name === 'Stalls')
  const band = existing ? { bandId: existing.id as string } : await post(api, `/api/box-office/productions/${production.id}/bands`, { name: 'Stalls' })
  expect((await api.put(`/api/box-office/performances/${performance.id}/sales`, { data: { pools: [{ bandId: band.bandId, capacity: 20 }] } })).ok()).toBe(true)
  const dearer = await post(api, '/api/box-office/ticket-types', { name: premiumName })
  premium = { bandId: band.bandId, ticketTypeId: dearer.ticketTypeId }
  await post(api, `/api/box-office/productions/${production.id}/prices`, { prices: [{ bandId: band.bandId, ticketTypeId: type.ticketTypeId, amountMinor: 1200 }, { bandId: band.bandId, ticketTypeId: dearer.ticketTypeId, amountMinor: 1500 }] })
  await post(api, '/api/payments/providers', { provider: 'cash', label: 'Desk cash', channels: ['desk'], mode: 'live' })
  await post(api, `/api/box-office/performances/${performance.id}/sales/open`, {})
  // A season pass covering the show, on sale at the box office, and one already given and paid for.
  const passType = await post(api, '/api/box-office/pass-types', { name: passName, covers: 'productions', productionIds: [production.id], perShow: 'once', onSale: true, prices: [{ name: 'Adult', amountMinor: 3000 }] })
  const passPriceId = (await (await api.get('/api/box-office/pass-types')).json()).rows.find((t: { id: string }) => t.id === passType.id).prices[0].id
  passCode = (await post(api, `/api/box-office/pass-types/${passType.id}/passes`, { passPriceId, settled: true })).code
  await api.dispose()

  // Each reservation is made by its own guest buyer, in a browser of their own. One person may only
  // reserve so many tickets for a performance. A context made here takes the file's `use` options,
  // so without clearing the headers every buyer would be the seller signed in, one person.
  const basketFor = async (quantity: number) => {
    const buyer = await playwright.request.newContext({ ...base, extraHTTPHeaders: {} })
    const basket = await post(buyer, '/api/box-office/baskets', { performanceId: performance.id, lines: [{ bandId: band.bandId, ticketTypeId: type.ticketTypeId, quantity }] })
    return { buyer, basket }
  }
  const reserve = async (held: Awaited<ReturnType<typeof basketFor>>, who: string) => {
    const { buyer, basket } = held
    const reserved = await post(buyer, `/api/box-office/baskets/${basket.orderId}/reserve`, { expectedTotalMinor: basket.totalMinor, email: `desk.${who.toLowerCase()}.${stamp}@example.org`, name: `Desk ${who}` }, { 'x-basket-token': basket.token })
    await buyer.dispose()
    expect(reserved.state).toBe('reserved')
    return reserved.reference as string
  }
  // Somebody reserves one ticket online, to pay for on arrival.
  reference = await reserve(await basketFor(1), 'Buyer')
  // And another, to pay for and then exchange for a dearer ticket.
  swapping = await reserve(await basketFor(1), 'Swapper')
  // And three for a group who will pay separately.
  group = await reserve(await basketFor(3), 'Group')
  // And two for a couple who turn up wanting something different; their basket is made before the next one's.
  const couple = await basketFor(2)
  unfinished = await reserve(await basketFor(1), 'Unfinished')
  amending = await reserve(couple, 'Couple')
  // And two that are cancelled from the order page.
  cancelling = await reserve(await basketFor(2), 'Cancelling')

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

/** The receipt's first way to pay, which carries the total. */
const payButton = (page: Page, amount: string) => page.getByRole('button', { name: new RegExp(` · ${amount.replace('.', '\\.')}$`) })
/** Paying by cash from the receipt: one press makes the sale and asks for the cash. Other browser tests may have added a cash drawer too. */
const cash = (page: Page) => page.getByRole('button', { name: /^Cash( ·|$)/ }).first()

async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

async function payCash(page: Page, amount: string, afterSale?: () => Promise<void>) {
  await cash(page).click()
  await expect(page.getByText(`Still to pay: ${amount}`)).toBeVisible()
  await page.getByRole('button', { name: 'Cash taken' }).click()
  // The till says so once.
  await expect(page.getByText(`Paid ${amount}`, { exact: true })).toHaveCount(1)
  // The sale stays on screen, with its booking, until the next customer.
  await expect(page.getByRole('heading', { name: /^Booking / })).toBeVisible()
  await afterSale?.()
  await page.getByRole('button', { name: 'Next customer' }).click()
  await expect(page.getByText('Nothing added yet.')).toBeVisible()
}

test('Sell sells tickets at the desk for cash', async ({ page }) => {
  const response = await visit(page, '/console/box-office/sell')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: 'Sell' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sell' }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tickets' })).toBeVisible()
  // A tile for each kind of ticket; each tap adds one, and the receipt holds how many.
  // The show has one price throughout, so its one section goes unnamed.
  const tile = page.getByRole('button', { name: new RegExp(`^${typeName}\\s*£12\\.00\\s*add one$`) })
  // How many are left shows beside the performance, and counts what the sale holds only once sold.
  const left = page.getByText(/^\d+ left$/)
  const before = Number((await left.textContent())!.match(/(\d+) left/)![1])
  await tile.click()
  await tile.click()
  await page.getByRole('checkbox', { name: 'Admit now' }).check()
  await expect(payButton(page, '£24.00')).toBeEnabled()
  await noViolations(page)
  await payCash(page, '£24.00', async () => {
    // The tickets print from the sale: a page of their own, one ticket to a block, each with its code.
    const reference = (await page.getByRole('heading', { name: /^Booking / }).textContent())!.replace(/^Booking /, '').trim()
    const [printout] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: 'Print tickets' }).click()])
    await expect(printout.getByRole('heading', { level: 1, name: `Tickets for ${reference}` })).toBeVisible()
    const tickets = printout.getByRole('list', { name: 'Tickets' }).getByRole('listitem')
    await expect(tickets).toHaveCount(2)
    await expect(tickets.first()).toContainText('The Desk Show')
    await expect(tickets.first()).toContainText(typeName)
    await expect(tickets.first()).toContainText(`Booking ${reference}`)
    await expect(printout.getByRole('img', { name: `Ticket code ${reference}-1` })).toBeVisible()
    await expect(printout.getByRole('img', { name: `Ticket code ${reference}-2` })).toBeVisible()
    await noViolations(printout)
    // On paper only the tickets show: the buttons stay on screen.
    await printout.emulateMedia({ media: 'print' })
    await expect(printout.getByRole('button', { name: 'Print' })).toBeHidden()
    await expect(tickets).toHaveCount(2)
    await printout.close()
  })
  // Back for the next customer, the panel shows what is left after the sale without a reload.
  await expect(tile).toBeVisible()
  await expect(left).toHaveText(`${before - 2} left`)
})

test('Sell books a pass\'s entry from the find box without the till, and sells a new pass with a booking', async ({ page }) => {
  await visit(page, '/console/box-office/sell')
  // A pass typed in the find box adds its entry for tonight: there is nothing to pay, so it is booked from the panel.
  await page.getByRole('textbox', { name: 'Booking reference, desk code, name or pass' }).fill(passCode.toLowerCase())
  await page.getByRole('button', { name: 'Find' }).click()
  await expect(page.getByText(`${passName} · No holder named`)).toBeVisible()
  await expect(page.getByText('Added 1 entry for tonight on the pass.')).toBeVisible()
  await noViolations(page)
  await page.getByRole('button', { name: 'Book the entry' }).click()
  await expect(page.getByText(/^Booked as /)).toBeVisible()
  // The same pass again is turned away for this performance, saying why; nothing joins the sale.
  await page.getByRole('textbox', { name: 'Booking reference, desk code, name or pass' }).fill(passCode)
  await page.getByRole('button', { name: 'Find' }).click()
  await expect(page.getByText('This pass already has a ticket for this performance.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss' }).first().click()
  // A new pass sold with tonight's entry: the pass's price is the sale.
  await page.getByRole('button', { name: 'Sell a pass' }).click()
  await expect(page.getByRole('checkbox', { name: 'Use one entry tonight' })).toBeChecked()
  await page.getByRole('button', { name: 'Add to sale' }).click()
  await expect(page.getByText(`New ${passName}, Adult, with 1 entry tonight · No holder named`)).toBeVisible()
  await expect(payButton(page, '£30.00')).toBeEnabled()
  await noViolations(page)
  await payCash(page, '£30.00', async () => {
    // Nobody was named for it, so its code is shown to hand over.
    await expect(page.getByRole('list', { name: 'Passes' })).toContainText(`${passName}, Adult · No holder named`)
    await expect(page.getByRole('list', { name: 'Passes' })).toContainText(/PASS-[A-Z0-9]{4}-[A-Z0-9]{4}/)
  })
})

test('Sell finds a reservation by its reference and takes payment for it', async ({ page }) => {
  await visit(page, '/console/box-office/sell')
  await page.getByLabel(/^Booking reference, desk code or name/).fill(reference.toLowerCase())
  await page.getByRole('button', { name: 'Find' }).click()
  await expect(page.getByRole('heading', { name: `Booking ${reference}` })).toBeVisible()
  await expect(page.getByText('Reserved, not paid')).toBeVisible()
  await expect(page.getByText('To pay: £12.00')).toBeVisible()
  await expect(payButton(page, '£12.00')).toBeEnabled()
  await noViolations(page)
  await payCash(page, '£12.00')
  // Found again, it is paid for.
  await page.getByRole('button', { name: 'Find' }).click()
  await expect(page.getByText('Nothing to pay.')).toBeVisible()
})

test('a payment left by a reload is picked up again, and another till can cancel it to take the booking', async ({ page, browser }) => {
  await visit(page, '/console/box-office/sell')
  await page.getByLabel(/^Booking reference, desk code or name/).fill(unfinished)
  await page.getByRole('button', { name: 'Find' }).click()
  await cash(page).click()
  await expect(page.getByText('Still to pay: £12.00')).toBeVisible()
  // Reloaded mid-payment: the till carries on with the same payment.
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  await expect(page.getByText('A payment of £12.00 was not finished').first()).toBeVisible()
  await expect(page.getByText('Still to pay: £12.00')).toBeVisible()

  // Someone at another till finds the booking waiting on it, and cancels that payment to take it themselves.
  const officeContext = await browser.newContext(as(office))
  const other = await officeContext.newPage()
  await visit(other, '/console/box-office/sell')
  await other.getByLabel(/^Booking reference, desk code or name/).fill(unfinished)
  await other.getByRole('button', { name: 'Find' }).click()
  await expect(other.getByText('A payment was started and not finished')).toBeVisible()
  await noViolations(other)
  await other.getByRole('button', { name: 'Cancel that payment' }).click()
  await expect(other.getByText('Reserved, not paid')).toBeVisible()
  await expect(payButton(other, '£12.00')).toBeEnabled()
  await officeContext.close()
})

test('Sell splits a reservation so one of a group pays for their own tickets', async ({ page }) => {
  await visit(page, '/console/box-office/sell')
  await page.getByLabel(/^Booking reference, desk code or name/).fill(group)
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

  await page.getByLabel(/^Booking reference, desk code or name/).fill(group)
  await page.getByRole('button', { name: 'Find' }).click()
  await expect(page.getByText('To pay: £24.00')).toBeVisible()
})

test('Sell takes the difference on an exchange for a dearer ticket', async ({ page, browser, playwright }) => {
  await visit(page, '/console/box-office/sell')
  await page.getByLabel(/^Booking reference, desk code or name/).fill(swapping)
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
  await expect(payButton(page, '£3.00')).toBeEnabled()
  await noViolations(page)
  await payCash(page, '£3.00')

  await page.getByLabel(/^Booking reference, desk code or name/).fill(swapping)
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
  await expect(payButton(page, '£6.00')).toBeEnabled()
  await expect(page.getByRole('tab', { name: /^Gallery programmes/ })).toContainText('1')
  await noViolations(page)
  // On a phone the till fits the screen: nothing scrolls sideways, however long a performance's name.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: 'Tickets', exact: true }).click()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  await context.close()
})

test('the till in live mode collects a reservation, changed to who came, and takes payment', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 }) // a tablet held upright, as at a desk
  await visit(page, '/live/till')
  await page.getByLabel(/^Booking reference, desk code or name/).fill(amending)
  await page.getByRole('button', { name: 'Find' }).click()
  await expect(page.getByText('To pay: £24.00')).toBeVisible()
  // One of them wants the dearer seat, and the other could not come.
  await page.getByRole('combobox', { name: 'Kind of ticket for line 1' }).click()
  await page.getByRole('option', { name: new RegExp(premiumName) }).click()
  await expect(page.getByText('To pay: £27.00')).toBeVisible()
  await page.getByRole('button', { name: `Remove ${typeName}` }).click()
  await expect(page.getByText('To pay: £15.00')).toBeVisible()
  await expect(payButton(page, '£15.00')).toBeEnabled()
  await noViolations(page)
  await cash(page).click()
  await page.getByRole('button', { name: 'Cash taken' }).click()
  await page.getByRole('button', { name: 'Next customer' }).click()
  await expect(page.getByText('Nothing to pay.')).toBeVisible()
  // Below 900px in live mode the receipt is a sheet: open it to see it is empty.
  await page.getByRole('button', { name: 'Sale (0)' }).click()
  await expect(page.getByText('Nothing added yet.')).toBeVisible()
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
    await expect(page.getByRole('heading', { level: 1, name: 'Ticket set-up' })).toBeVisible()
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

    // The report is drawn the same on the server and in the browser: no hydration mismatch.
    const mismatches: string[] = []
    const listen = (message: ConsoleMessage) => {
      if (/hydrat/i.test(message.text())) mismatches.push(message.text())
    }
    page.on('console', listen)
    await visit(page, '/console/box-office/reports/sales')
    await expect(page.getByRole('heading', { level: 1, name: 'Sales report' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Download as CSV' })).toBeVisible()
    page.off('console', listen)
    expect(mismatches).toEqual([])
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

  test('a ticket preset is made with typed prices, with sections, and made the theatre\'s usual', async ({ page }) => {
    const name = `Preset ${stamp}`
    // The theatre's usual preset is put back after, so shows set up by later tests start as before.
    const usual = (await (await page.request.get('/api/box-office/ticket-presets')).json()).usual as string | null
    await visit(page, '/admin/modules/box-office/ticket-presets')
    // Someone without Admin sees it in the settings window over the console.
    await expect(page.getByRole('heading', { name: 'Ticket presets' }).first()).toBeVisible()
    await page.getByRole('button', { name: 'New preset' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'New preset' })
    await dialog.getByLabel('Name').fill(name)
    await dialog.getByRole('spinbutton', { name: `Price of ${typeName}` }).fill('12')
    await dialog.getByRole('switch', { name: 'Different prices for parts of the house' }).click()
    await dialog.getByRole('textbox', { name: 'Name of section 2' }).fill('Balcony')
    await dialog.getByRole('spinbutton', { name: `Price of ${typeName} in Balcony` }).fill('8')
    await noViolations(page)
    await dialog.getByRole('button', { name: 'Save preset' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(`Stalls: ${typeName} £12.00; Balcony: ${typeName} £8.00`, { exact: false })).toBeVisible()
    await page.getByRole('button', { name: `Actions for ${name}` }).click()
    await page.getByRole('menuitem', { name: 'Make it the theatre\'s usual' }).click()
    await expect(page.getByText('The theatre\'s usual').first()).toBeVisible()
    await noViolations(page)
    const restored = await page.request.put('/api/core/settings', { data: { changes: [{ key: 'box-office.presets.usual', value: usual }], confirm: true }, headers: key() })
    expect(restored.ok(), await restored.text()).toBe(true)
  })

  test('a promo code is made, limited and retired, and Undo brings it back', async ({ page }) => {
    const code = `SAVE${stamp}`
    await visit(page, '/console/box-office/codes')
    await expect(page.getByRole('heading', { level: 1, name: 'Promo codes' })).toBeVisible()
    await page.getByRole('button', { name: 'New code' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'New code' })
    // A character a code cannot hold is named beside the field; a space is left out, and the form says so.
    await dialog.getByLabel('Code').fill('half price!')
    await dialog.getByRole('button', { name: 'Save code' }).click()
    await expect(dialog.getByText('Use only letters, numbers, hyphens and underscores.')).toBeVisible()
    await dialog.getByLabel('Code').fill(`${code.slice(0, 4).toLowerCase()} ${code.slice(4)}`)
    await expect(dialog.getByText(`Saved as ${code}`, { exact: false })).toBeVisible()
    await dialog.getByRole('spinbutton', { name: 'Percentage off' }).fill('15')
    await dialog.getByRole('spinbutton', { name: 'Uses in all' }).fill('40')
    await noViolations(page)
    await dialog.getByRole('button', { name: 'Save code' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(`${code} added.`).first()).toBeVisible()
    await expect(page.getByText('15% off · 0 of 40 used')).toBeVisible()
    await page.getByRole('button', { name: `Actions for ${code}` }).click()
    await page.getByRole('menuitem', { name: 'Retire' }).click()
    await expect(page.getByRole('button', { name: /^Retired codes \(\d+\)$/ })).toBeVisible()
    await expect(page.getByText(code, { exact: true })).toBeHidden()
    // The newest toast is the retiring's.
    await page.locator('button', { hasText: 'Undo' }).last().click()
    await expect(page.getByText(code, { exact: true })).toBeVisible()
    await expect(page.getByText('15% off · 0 of 40 used')).toBeVisible()
    await noViolations(page)
  })
})

test.describe('cancelling from the order page', () => {
  test.use(as(canceller))

  test('a reservation offers one Cancel reservation, whose dialogue lists each ticket with no accessibility violations', async ({ page }) => {
    await visit(page, '/console/box-office/orders')
    await page.getByRole('searchbox').first().fill(cancelling)
    await page.getByRole('link', { name: cancelling, exact: true }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: `Order ${cancelling}` })).toBeVisible()
    // Alike tickets are one row, and the payments say nothing has been paid yet.
    await expect(page.getByText(`2 × Stalls, ${typeName}`)).toBeVisible()
    await expect(page.getByText('Nothing paid yet. £24.00 to pay when it is collected.')).toBeVisible()
    await page.getByRole('button', { name: /More actions/ }).click()
    await expect(page.getByRole('menuitem', { name: 'Release reservation' })).toHaveCount(0)
    await page.getByRole('menuitem', { name: 'Cancel reservation' }).click()
    const dialog = page.getByRole('dialog', { name: 'Cancel reservation' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('checkbox', { name: /^Ticket 1, Stalls/ })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: /^Ticket 2, Stalls/ })).toBeChecked()
    await noViolations(page)
    // Leaving one out cancels the other alone.
    await dialog.getByRole('checkbox', { name: /^Ticket 2, Stalls/ }).click()
    await dialog.getByRole('button', { name: 'Cancel reservation' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Reservation cancelled').first()).toBeVisible()
    await expect(page.getByText('1 ticket cancelled', { exact: false })).toBeVisible()
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
    // The form is behind the page's one button, in a dialog.
    await asking.getByRole('button', { name: 'Ask for complimentary tickets' }).first().click()
    const form = asking.getByRole('dialog', { name: 'Ask for complimentary tickets' })
    await form.getByRole('combobox', { name: 'Performance' }).click()
    await asking.getByRole('option', { name: /The Desk Show/ }).first().click()
    await form.getByRole('combobox', { name: 'Why' }).click()
    await asking.getByRole('option', { name: 'Press' }).click()
    await form.getByLabel('Their name').fill('Rita Reviewer')
    await form.getByLabel('Their email address').fill(`rita.${stamp}@example.org`)
    await noViolations(asking)
    await form.getByRole('button', { name: 'Send request' }).click()
    await expect(form).toBeHidden()
    await expect(asking.getByText('Request sent').first()).toBeVisible()
    await expect(asking.getByText('For Rita Reviewer').first()).toBeVisible()
    await askingContext.close()

    const decidingContext = await browser.newContext(as(approver))
    const deciding = await decidingContext.newPage()
    await visit(deciding, '/console/box-office/comps')
    await expect(deciding.getByRole('heading', { name: 'Waiting for a decision' })).toBeVisible()
    await noViolations(deciding)
    await deciding.getByRole('button', { name: 'Approve and send' }).first().click()
    // The approver is told who was sent what, and finds it again under Decided by you.
    await expect(deciding.getByText('Sent 1 complimentary ticket to Rita Reviewer').first()).toBeVisible()
    await deciding.getByRole('button', { name: /^Decided by you \(\d+\)$/ }).click()
    await expect(deciding.getByText(/For Rita Reviewer/).first()).toBeVisible()
    await noViolations(deciding)
    await decidingContext.close()
  })
})
