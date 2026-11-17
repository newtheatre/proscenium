// Console forms that write through routes requiring an Idempotency-Key, submitted in a real browser
// with nothing added by the test: the app's own fetch gives every write a key, so a screen never
// fails with "This request needs an Idempotency-Key header". Adding a ticket type was the report;
// a band and prices on a performance's set-up go through the same kind of route. A price for one
// performance only shows where it comes from and can be handed back to the production's.
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
  await api.dispose()
})
test.use(as(manager))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

test('Add a ticket type, then a band and its prices on a performance, all from the console forms', async ({ page }) => {
  await visit(page, '/console/box-office/ticket-types')
  await page.getByLabel(/^Name/).fill(typeName)
  await page.getByRole('button', { name: 'Add ticket type' }).click()
  await expect(page.getByText(`${typeName} added`).first()).toBeVisible()
  await expect(page.getByText('This request needs an Idempotency-Key header.')).toHaveCount(0)

  await visit(page, `/console/box-office/performances/${performanceId}`)
  await page.getByRole('textbox', { name: /^Name/ }).fill('Circle')
  await page.getByRole('button', { name: 'Add band' }).click()
  await expect(page.getByText('Band added').first()).toBeVisible()
  await page.getByLabel(typeName).fill('12.00')
  await page.getByRole('button', { name: 'Save prices' }).click()
  await expect(page.getByText('Prices saved').first()).toBeVisible()
  await expect(page.getByText('This request needs an Idempotency-Key header.')).toHaveCount(0)

  // This performance alone gets its own price, which shows on both views and can be handed back.
  await page.getByRole('radio', { name: 'This performance only' }).check()
  await expect(page.getByText('Same as all performances.')).toBeVisible()
  await page.getByLabel(typeName).fill('8.00')
  await page.getByRole('button', { name: 'Save prices' }).click()
  await expect(page.getByText('This performance only. All performances: £12.00.')).toBeVisible()
  await page.getByRole('radio', { name: 'All performances' }).check()
  await expect(page.getByLabel(typeName)).toHaveValue(/12\.00/)
  await expect(page.getByText('This performance has its own price: £8.00.')).toBeVisible()
  await page.getByRole('radio', { name: 'This performance only' }).check()
  await page.getByRole('button', { name: 'Use the price for all performances' }).click()
  await expect(page.getByText('This performance now uses the price for all performances').first()).toBeVisible()
  await expect(page.getByText('Same as all performances.')).toBeVisible()
  await expect(page.getByLabel(typeName)).toHaveValue(/12\.00/)
})
