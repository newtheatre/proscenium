// Seating layouts and wheelchair spaces in a real browser (show walkthrough, decisions 5, 6 and 10):
// a manager gives a space a layout with two wheelchair spaces, each taking the place of two seats,
// and the performance there takes it; a wheelchair user on the access scheme then books a space
// online as a ticket of its own, and the performance's set-up shows it booked and the seats kept.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (accountId: string, name: string, abilities: string[]) => ({ kind: 'person', accountId, name, assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(grant) })
const owner = person('acc_layoutowner', 'Layout Owner', ['core.settings.manage', 'core.modules.manage', 'box-office.settings.manage', 'core.vocabulary.manage'])
const manager = person('acc_layoutmanager', 'Layout Manager', ['core.production.create', 'core.production.edit', 'core.production.publish', 'core.performance.schedule', 'core.venue.manage', 'box-office.performance.manage', 'box-office.pricing.manage', 'payments.provider.manage'])
const stamp = Date.now() % 1_000_000
const reviewer = person('acc_layoutreviewer', 'Layout Reviewer', ['core.access-scheme.review'])
let wheelchairUser = person('', 'Wren Wheeler', [])
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const title = `The Layout Show ${stamp}`
const venueName = `Layout Theatre ${stamp}`
let performanceId = ''
let slug = ''
let productionId = ''

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
  const needs = await (await settings.get('/api/core/vocabularies/core.access-need')).json()
  await settings.dispose()

  const api = await playwright.request.newContext({ ...base, ...as(manager) })
  const production = await post(api, '/api/core/productions', { title, kind: 'own' })
  slug = production.slug
  productionId = production.id
  await post(api, `/api/core/productions/${production.id}`, { summary: 'A show with wheelchair spaces.', categoryTermId: categories.terms[0].id, effectsConfirmedNone: true, advisoriesConfirmedNone: true }, 'patch')
  const venue = await post(api, '/api/core/venues', { name: venueName })
  // Three days ahead, so the seats of unbooked spaces are still kept back.
  const performance = await post(api, `/api/core/productions/${production.id}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: Date.now() + 3 * 86_400_000, capacity: 100 })
  await post(api, `/api/core/performances/${performance.id}/schedule`, {})
  performanceId = performance.id
  const type = await post(api, '/api/box-office/ticket-types', { name: `Layout price ${stamp}` })
  // The theatre's usual ticket preset, if another test left one, may have made Stalls already.
  const existing = (await (await api.get(`/api/box-office/productions/${production.id}/bands`)).json()).bands.find((b: { name: string }) => b.name === 'Stalls')
  const band = existing ? { bandId: existing.id as string } : await post(api, `/api/box-office/productions/${production.id}/bands`, { name: 'Stalls' })
  expect((await api.put(`/api/box-office/performances/${performance.id}/sales`, { data: { pools: [{ bandId: band.bandId, capacity: 20 }] } })).ok()).toBe(true)
  await post(api, `/api/box-office/productions/${production.id}/prices`, { prices: [{ bandId: band.bandId, ticketTypeId: type.ticketTypeId, amountMinor: 1000 }] })
  await post(api, '/api/payments/providers', { provider: 'cash', label: `Layout cash ${stamp}`, channels: ['desk'], mode: 'live' })
  await post(api, `/api/box-office/performances/${performance.id}/sales/open`, {})
  const published = await post(api, `/api/core/productions/${production.id}/publish`, {})
  slug = published.slug ?? slug
  await api.dispose()

  // The wheelchair user has applied to the access scheme, by phone, saying they stay in their
  // wheelchair; not yet decided, which is enough to book a space. A context made here takes the
  // file's `use` options, so it names its own actor.
  const staff = await playwright.request.newContext({ ...base, ...as(reviewer) })
  const made = await post(staff, '/api/core/access-scheme/people', { name: 'Wren Wheeler', address: `wren.${stamp}@example.org` })
  const stays = needs.terms.find((term: { slug: string }) => term.slug === 'wheelchair-stays')
  await post(staff, `/api/core/access-scheme/${made.accountId}/application`, { needs: [{ term: stays.id }], companions: 0 })
  await staff.dispose()
  wheelchairUser = person(made.accountId, 'Wren Wheeler', [])
})
test.use(as(manager))

async function visit(page: Page, url: string) {
  const response = await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  return response
}

async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test('a manager gives a space a seating layout, and its performance takes the wheelchair spaces', async ({ page }) => {
  // Someone who manages performances but not Admin is given the screen in the console's settings window.
  await visit(page, '/admin/modules/box-office/seating-layouts')
  await expect(page.getByRole('dialog', { name: 'Box office settings' }).getByRole('heading', { name: 'Seating layouts', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'New layout' }).click()
  const dialog = page.getByRole('dialog', { name: 'New layout' })
  await dialog.getByRole('combobox', { name: 'Space' }).click()
  await page.getByRole('option', { name: new RegExp(venueName) }).click()
  await dialog.getByRole('textbox', { name: 'Name' }).fill('End-on')
  await expect(dialog.getByRole('spinbutton', { name: 'Wheelchair spaces' })).toHaveValue('2')
  await expect(dialog.getByRole('spinbutton', { name: 'Seats each space takes the place of' })).toHaveValue('2')
  await noViolations(page)
  await dialog.getByRole('button', { name: 'Add layout' }).click()
  await expect(page.getByText('End-on added', { exact: true })).toBeVisible()
  await expect(dialog).toBeHidden()
  const row = page.getByRole('listitem').filter({ hasText: 'End-on' })
  await expect(row.getByText('2 wheelchair spaces, each in place of 2 seats')).toBeVisible()
  await expect(row.getByText('Usual')).toBeVisible()
  await noViolations(page)

  // The performance there uses the space's usual layout without anyone choosing it.
  await visit(page, `/console/box-office/performances/${performanceId}`)
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Wheelchair spaces', exact: true }) })
  await expect(section.getByText('The space\'s usual layout, End-on: 2 wheelchair spaces, each in place of 2 seats')).toBeVisible()
  await expect(section.getByText('0 of 2 booked')).toBeVisible()
  await expect(section.getByText(/^4 seats until /)).toBeVisible()
  await noViolations(page)
  // Its own choice is with the rest of what can differ from the run, folded until asked for.
  await page.getByRole('button', { name: 'Show', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'As the run' })).toBeChecked()
  await noViolations(page)
})

test('a wheelchair user books a space online, and the performance counts it', async ({ browser, page }) => {
  const context = await browser.newContext({ baseURL: 'http://localhost:8788', ...as(wheelchairUser) })
  const buyer = await context.newPage()
  await visit(buyer, `/book/${slug}/${performanceId}`)
  await expect(buyer.getByRole('heading', { name: title })).toBeVisible()
  // The wheelchair space is a ticket of its own, at the lowest price the buyer can have.
  const spaces = buyer.locator('section').filter({ has: buyer.getByRole('heading', { name: 'Wheelchair spaces' }) })
  await expect(spaces.getByRole('spinbutton', { name: 'Tickets, £10.00' })).toBeVisible()
  await noViolations(buyer)
  await spaces.getByRole('button', { name: 'Add a ticket' }).click()
  await buyer.getByRole('button', { name: 'Continue with 1 ticket, £10.00' }).click()
  await expect(buyer.getByText('1 × Wheelchair space')).toBeVisible()
  await buyer.getByRole('button', { name: 'Reserve and pay £10.00 at the box office' }).click()
  await expect(buyer.getByRole('heading', { name: 'Your tickets are reserved' })).toBeVisible()
  await context.close()

  // Booking the space took it and the two seats it stands in place of; two more are kept for the other.
  await visit(page, `/console/box-office/performances/${performanceId}`)
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Wheelchair spaces', exact: true }) })
  await expect(section.getByText('1 of 2 booked')).toBeVisible()
  await expect(section.getByText(/^2 seats until /)).toBeVisible()
  await expect(page.getByText('2 taken')).toBeVisible()
})

test('the run types its own numbers on the Tickets tab, and one performance overrides them', async ({ page }) => {
  await visit(page, `/console/programme/productions/${productionId}?tab=box-office.production`)
  const run = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Wheelchair spaces', exact: true }) })
  await expect(run.getByRole('radio', { name: /Each space's usual layout/ })).toBeChecked()
  await run.getByRole('radio', { name: 'Numbers typed in' }).check()
  await run.getByRole('spinbutton', { name: 'Wheelchair spaces' }).fill('3')
  await run.getByRole('spinbutton', { name: 'Seats each space takes the place of' }).fill('1')
  await noViolations(page)
  await run.getByRole('button', { name: 'Save wheelchair spaces' }).click()
  await expect(page.getByText('Wheelchair spaces saved', { exact: true })).toBeVisible()

  // The performance follows the run; then this night has its own.
  await visit(page, `/console/box-office/performances/${performanceId}`)
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Wheelchair spaces', exact: true }) })
  await expect(section.getByText('3 wheelchair spaces, each in place of 1 seat')).toBeVisible()
  await expect(section.getByText('1 of 3 booked')).toBeVisible()
  await page.getByRole('button', { name: 'Show', exact: true }).click()
  await page.getByRole('radio', { name: 'Numbers typed in' }).check()
  await page.getByRole('spinbutton', { name: 'Wheelchair spaces' }).fill('2')
  // The page's one Save saves it with anything else that changed.
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(section.getByText('1 of 2 booked')).toBeVisible()
  await expect(section.getByText(/^This night's own: 2 wheelchair spaces/)).toBeVisible()
  await noViolations(page)

  // The Tickets tab says one night has its own.
  await visit(page, `/console/programme/productions/${productionId}?tab=box-office.production`)
  await expect(page.getByText('1 performance has wheelchair spaces of its own, which this leaves as they are.')).toBeVisible()
})

test('staff put the seats kept for unbooked spaces on sale early, and keep them back again', async ({ page }) => {
  await visit(page, `/console/box-office/performances/${performanceId}`)
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Wheelchair spaces', exact: true }) })
  await expect(section.getByText(/^2 seats until /)).toBeVisible()
  await section.getByRole('button', { name: 'Put kept seats on sale now' }).click()
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
  await expect(dialog).toBeVisible()
  await noViolations(page)
  await dialog.getByRole('button', { name: /Put on sale/ }).click()
  await expect(section.getByText(/^None: let go early, /)).toBeVisible()
  await section.getByRole('button', { name: 'Keep the seats back again' }).click()
  await expect(section.getByText(/^2 seats until /)).toBeVisible()
  await noViolations(page)
})
