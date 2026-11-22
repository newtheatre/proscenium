// Console forms that write through routes requiring an Idempotency-Key, submitted in a real browser
// with nothing added by the test: the app's own fetch gives every write a key, so a screen never
// fails with "This request needs an Idempotency-Key header". Adding a ticket type was the report;
// a section and prices on a run's tickets go through the same kind of route. A price for one
// night only shows where it comes from and can be handed back to the run's. A night's page saves
// everything that changed with one Save, and one Undo puts it all back.
import { test, expect, type Page } from '@playwright/test'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (accountId: string, name: string, abilities: string[]) => ({ kind: 'person', accountId, name, assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(grant) })
const owner = person('acc_writesowner', 'Writes Owner', ['core.settings.manage', 'core.modules.manage'])
const manager = person('acc_writesmanager', 'Writes Manager', ['core.production.create', 'core.production.edit', 'core.performance.schedule', 'core.venue.manage', 'box-office.performance.manage', 'box-office.pricing.manage'])
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const base = { baseURL: 'http://localhost:8788' }
const stamp = Date.now() % 1_000_000
const typeName = `Writes price ${stamp}`
let performanceId = ''
let productionId = ''

test.beforeAll(async ({ playwright }) => {
  const settings = await playwright.request.newContext({ ...base, ...as(owner) })
  expect((await settings.put('/api/core/settings', { data: { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }], confirm: true } })).ok()).toBe(true)
  for (const id of ['finance', 'payments', 'box-office']) expect((await settings.put(`/api/core/modules/${id}`, { data: { on: true } })).ok()).toBe(true)
  await settings.dispose()
  // The stage is set through the API, which states its keys; the forms under test send none of their own.
  const api = await playwright.request.newContext({ ...base, ...as(manager) })
  const post = async (path: string, data: unknown) => {
    const response = await api.post(path, { data, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
    return response.json()
  }
  const production = await post('/api/core/productions', { title: `The Writes Show ${stamp}`, kind: 'own' })
  const venue = await post('/api/core/venues', { name: `Writes Theatre ${stamp}` })
  const performance = await post(`/api/core/productions/${production.id}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: Date.now() + 86_400_000, capacity: 100 })
  await post(`/api/core/performances/${performance.id}/schedule`, {})
  performanceId = performance.id
  productionId = production.id
  await api.dispose()
})
test.use(as(manager))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

test('Add a ticket type, then a section and its prices on the run\'s tickets, all from the console forms', async ({ page }) => {
  await visit(page, '/admin/modules/box-office/ticket-types')
  await page.getByRole('button', { name: 'New ticket type' }).click()
  const adding = page.getByRole('dialog', { name: 'Add a ticket type' })
  await adding.getByLabel(/^Name/).fill(typeName)
  await adding.getByRole('button', { name: 'Add ticket type' }).click()
  await expect(page.getByText(`${typeName} added`).first()).toBeVisible()
  await expect(page.getByText('This request needs an Idempotency-Key header.')).toHaveCount(0)

  // The run's tickets, reached from Ticket set-up, are where sections and the run's prices are kept.
  await visit(page, `/console/box-office/performances/run/${productionId}`)
  // With one price throughout the sections are put away until the house is split.
  const split = page.getByRole('button', { name: 'Price parts of the house differently' })
  if (await split.isVisible()) await split.click()
  await page.getByRole('textbox', { name: /^Name/ }).fill('Circle')
  await page.getByRole('button', { name: 'Add section' }).click()
  await expect(page.getByText('Section added').first()).toBeVisible()
  // The theatre's usual ticket preset may have given the show sections of its own already.
  const circle = page.getByRole('group', { name: 'Circle', exact: true })
  await circle.getByLabel(typeName).fill('12.00')
  await page.getByRole('button', { name: 'Save prices' }).click()
  await expect(page.getByText('Prices saved').first()).toBeVisible()
  await expect(page.getByText('This request needs an Idempotency-Key header.')).toHaveCount(0)

  // One night alone gets its own price, which says where it comes from and can be handed back.
  // Circle is named on the box only when the show has other sections too.
  await visit(page, `/console/box-office/performances/${performanceId}`)
  await page.getByRole('button', { name: 'Show', exact: true }).click()
  const own = page.getByRole('spinbutton', { name: new RegExp(`^(Circle, )?${typeName} price$`) })
  await expect(own).toHaveValue(/12\.00/)
  await own.fill('8.00')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('This night only. The run: £12.00.')).toBeVisible()
  await expect(page.getByText('This night has its own price for 1 ticket.')).toBeVisible()
  await page.getByRole('button', { name: 'Use the run\'s price' }).click()
  await expect(own).toHaveValue(/12\.00/)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('This night only. The run: £12.00.')).toHaveCount(0)
  await expect(page.getByText('Nothing differs: this night follows the run.')).toBeVisible()

  // A change to the run's prices set for later waits for its date, is listed meanwhile, and can be cancelled.
  await visit(page, `/console/box-office/performances/run/${productionId}`)
  await page.getByRole('radio', { name: 'From a later date' }).check()
  await page.getByRole('button', { name: 'Set prices for later' }).click()
  await expect(page.getByText('This is needed.').first()).toBeVisible()
  const setup = await (await page.request.get(`/api/box-office/performances/${performanceId}/sales`)).json()
  const band = setup.bands.find((b: { name: string }) => b.name === 'Circle')
  const type = setup.priceLayers.find((l: { bandId: string }) => l.bandId === band.id)
  const from = Date.now() + 7 * 86_400_000
  expect((await page.request.post(`/api/box-office/productions/${productionId}/prices`, { data: { prices: [{ bandId: band.id, ticketTypeId: type.ticketTypeId, amountMinor: 1500 }], from }, headers: { 'idempotency-key': crypto.randomUUID() } })).ok()).toBe(true)
  await visit(page, `/console/box-office/performances/run/${productionId}`)
  await expect(page.getByRole('heading', { name: 'Price changes to come' })).toBeVisible()
  // Circle is named only when the show has other sections too (from the theatre's usual preset, if one is set).
  await expect(page.getByText(new RegExp(`^(Circle, )?${typeName}: £15\\.00 from`))).toBeVisible()
  await page.getByRole('button', { name: new RegExp(`^Cancel the change to ${typeName}(, Circle)? on`) }).click()
  await expect(page.getByText('Price change cancelled').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Price changes to come' })).toHaveCount(0)
  // The night's page tells of the run's change to come rather than listing it as its own.
})

test('One Save on a night\'s page saves its seats and a limit together, and one Undo puts both back', async ({ page }) => {
  const read = async () => (await (await page.request.get(`/api/box-office/performances/${performanceId}/sales`)).json()) as { pools: { capacity: number }[], sales: { maxPerOrder: number | null } | null, defaults: { maxPerOrder: number } }
  const seats = (r: { pools: { capacity: number }[] }) => r.pools.reduce((sum, p) => sum + p.capacity, 0)
  const before = await read()
  await visit(page, `/console/box-office/performances/${performanceId}`)
  // A limit left to the theatre shows the theatre's number, not an empty box.
  await expect(page.getByText('Theatre default').first()).toBeVisible()
  await page.getByRole('button', { name: 'Change most tickets in one order' }).click()
  await expect(page.getByRole('spinbutton', { name: 'Most tickets in one order' })).toHaveValue(String(before.defaults.maxPerOrder))
  await page.getByRole('button', { name: 'Show', exact: true }).click()
  // A number box commits from its buttons; typing alone does not. The seats are the last number boxes on the page.
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Increment' }).last().click()
  await expect(page.getByText('There are changes not saved yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()
  const saved = await read()
  expect(seats(saved)).toBe(seats(before) + 3)
  expect(saved.sales?.maxPerOrder).toBe(before.defaults.maxPerOrder)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Undone').first()).toBeVisible()
  const undone = await read()
  expect(seats(undone)).toBe(seats(before))
  expect(undone.sales?.maxPerOrder ?? null).toBe(before.sales?.maxPerOrder ?? null)
  // Copying a set-up by hand is gone: a date added to a run takes the run's set-up by itself.
  await expect(page.getByRole('button', { name: 'Copy set-up' })).toHaveCount(0)
})

test('A show with one price throughout is set up without sections, until the house is split', async ({ page }) => {
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
    return response.json()
  }
  const production = await post('/api/core/productions', { title: `The Single Price Show ${stamp}`, kind: 'own' })
  const venue = await post('/api/core/venues', { name: `Single Price Theatre ${stamp}` })
  // A draft date takes no preset, so the show starts with no sections at all.
  const performance = await post(`/api/core/productions/${production.id}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: Date.now() + 86_400_000, capacity: 100 })

  // The night's page sends a newcomer to the run's tickets, where the seats are set.
  await visit(page, `/console/box-office/performances/${performance.id}`)
  await page.getByRole('link', { name: 'The run\'s tickets' }).first().click()
  await expect(page).toHaveURL(new RegExp(`/console/box-office/performances/run/${production.id}$`))
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  await expect(page.getByRole('heading', { name: 'Sections' })).toHaveCount(0)
  const seats = page.getByRole('spinbutton', { name: 'Seats', exact: true })
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Increment' }).first().click()
  await expect(seats).toHaveValue('3')
  await page.getByRole('button', { name: 'Save seats for the run' }).click()
  await expect(page.getByText('Seats saved for 1 performance').first()).toBeVisible()
  await expect(seats).toHaveValue('3')
  // One price for each ticket type, with no section named on the box or round it.
  await expect(page.getByRole('group', { name: 'All seats' })).toHaveCount(0)
  await page.getByRole('spinbutton', { name: `${typeName} price`, exact: true }).fill('10.00')
  await page.getByRole('button', { name: 'Save prices' }).click()
  await expect(page.getByText('Prices saved').first()).toBeVisible()

  // Splitting the house shows the one section, named, ready for another to be added beside it.
  await page.getByRole('button', { name: 'Price parts of the house differently' }).click()
  await expect(page.getByRole('heading', { name: 'Sections' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'All seats' }).getByRole('spinbutton', { name: `All seats, ${typeName} price` })).toHaveValue(/10\.00/)
})
