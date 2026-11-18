// Applying to the access scheme at the till: somebody who has never applied asks for a wheelchair
// space at the desk. The seller finds them in the till's own box, is told they do not qualify yet,
// fills in the access scheme application with them, and the space is then theirs to sell: a sent
// application is enough to book, with the booking flagged for staff (Matt, 2026-11-17).
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (accountId: string, name: string, abilities: string[]) => ({ kind: 'person', accountId, name, assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(grant) })
const owner = person('acc_tillaccessowner', 'Till Access Owner', ['core.settings.manage', 'core.modules.manage', 'box-office.settings.manage', 'payments.settings.manage'])
const manager = person('acc_tillaccessmanager', 'Till Access Manager', ['core.production.create', 'core.production.edit', 'core.performance.schedule', 'core.venue.manage', 'box-office.performance.manage', 'box-office.pricing.manage', 'payments.provider.manage'])
// Asking whether somebody else qualifies for a wheelchair space is the access scheme's reading ability.
const seller = person('acc_tillaccessseller', 'Till Access Seller', ['payments.session.open', 'payments.attempt.attest', 'box-office.order.view', 'box-office.order.sell', 'box-office.order.take-payment', 'core.access-profile.read'])
const reviewer = person('acc_tillaccessreviewer', 'Till Access Reviewer', ['core.access-scheme.review'])
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const stamp = Date.now() % 1_000_000
const name = `Walter Wheels ${stamp}`

async function post(api: APIRequestContext, path: string, data: unknown) {
  const response = await api.post(path, { data, headers: { 'idempotency-key': crypto.randomUUID() } })
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
  await set([{ key: 'payments.cash.enabled', value: true }])
  await settings.dispose()

  const api = await playwright.request.newContext({ ...base, ...as(manager) })
  // Listing the ticket types makes the ones Box office keeps, the Wheelchair space among them.
  expect((await api.get('/api/box-office/ticket-types')).ok()).toBe(true)
  const production = await post(api, '/api/core/productions', { title: `The Till Access Show ${stamp}`, kind: 'own' })
  const venue = await post(api, '/api/core/venues', { name: `Till Access Theatre ${stamp}` })
  const performance = await post(api, `/api/core/productions/${production.id}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: Date.now() + 3 * 86_400_000, capacity: 100 })
  await post(api, `/api/core/performances/${performance.id}/schedule`, {})
  const type = await post(api, '/api/box-office/ticket-types', { name: `Till access price ${stamp}` })
  // The theatre's usual ticket preset, if another test left one, may have made Stalls already.
  const existing = (await (await api.get(`/api/box-office/productions/${production.id}/bands`)).json()).bands.find((b: { name: string }) => b.name === 'Stalls')
  const band = existing ? { bandId: existing.id as string } : await post(api, `/api/box-office/productions/${production.id}/bands`, { name: 'Stalls' })
  expect((await api.put(`/api/box-office/performances/${performance.id}/sales`, { data: { pools: [{ bandId: band.bandId, capacity: 20 }] } })).ok()).toBe(true)
  await post(api, `/api/box-office/productions/${production.id}/prices`, { prices: [{ bandId: band.bandId, ticketTypeId: type.ticketTypeId, amountMinor: 1000 }] })
  await post(api, '/api/payments/providers', { provider: 'cash', label: `Till access cash ${stamp}`, channels: ['desk'], mode: 'live' })
  await post(api, `/api/box-office/performances/${performance.id}/sales/open`, {})
  // The performance has room for one wheelchair, so it sells a wheelchair space.
  const spaces = await api.put(`/api/box-office/performances/${performance.id}/layout`, { data: { use: 'numbers', wheelchairSpaces: 1, seatsPerSpace: 1 }, headers: { 'idempotency-key': crypto.randomUUID() } })
  expect(spaces.ok(), await spaces.text()).toBe(true)
  await api.dispose()

  // Somebody the theatre knows, who has never applied to the access scheme.
  const staff = await playwright.request.newContext({ ...base, ...as(reviewer) })
  await post(staff, '/api/core/access-scheme/people', { name, address: `walter.${stamp}@example.org` })
  await staff.dispose()

  const till = await playwright.request.newContext({ ...base, ...as(seller) })
  expect([200, 409]).toContain((await till.post('/api/payments/sessions', { data: { pointLabel: 'Till access desk' }, headers: { 'idempotency-key': crypto.randomUUID() } })).status())
  await till.dispose()
})
test.use(as(seller))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test('a seller applies to the access scheme with somebody at the till, then sells them a wheelchair space', async ({ page }) => {
  await visit(page, '/console/box-office/sell')
  const another = page.getByRole('combobox', { name: 'Another performance' })
  if (await another.isVisible()) {
    await another.click()
    await page.getByRole('option', { name: new RegExp(`Till Access Show ${stamp}`) }).click()
  }
  const space = page.getByRole('button', { name: /^Wheelchair space/ }).first()
  await space.click()
  // Not in the sale until somebody is named for it; it waits there rather than going.
  await expect(page.getByText('Not in the sale until you name who the ticket is for.')).toBeVisible()

  // Who the space is for is found in the till's own box.
  await page.getByRole('button', { name: 'Who ticket 1 is for' }).click()
  await page.getByPlaceholder('Name or email address').fill(name)
  await page.getByRole('option', { name: new RegExp(name) }).click()
  await expect(page.getByText(`${name} does not qualify, as far as we can tell`)).toBeVisible()
  await page.getByRole('button', { name: `Apply to the access scheme with ${name}` }).click()

  // The person's own form, started at what a wheelchair space is for.
  const form = page.getByRole('dialog', { name: `Access scheme application for ${name}` })
  await expect(form).toBeVisible()
  await expect(form.getByRole('checkbox', { name: 'I use a wheelchair' })).toBeChecked()
  await noViolations(page)
  await form.getByRole('button', { name: 'Send their application' }).click()
  await expect(page.getByText(`Application sent for ${name}`).first()).toBeVisible()
  await expect(form).toBeHidden()

  // Sent is enough: the space is now theirs to sell.
  await expect(page.getByText(`${name} does not qualify, as far as we can tell`)).toHaveCount(0)
  await expect(page.getByText(name, { exact: true })).toBeVisible()
  await expect(page.getByText('Not in the sale until you name who the ticket is for.')).toHaveCount(0)
  await noViolations(page)
  await expect(page.getByRole('heading', { name: 'Sale (1)' })).toBeVisible()
  await page.getByRole('button', { name: /^Cash( ·|$)/ }).first().click()
  await page.getByRole('button', { name: 'Cash taken' }).click()
  await expect(page.getByText('Paid £10.00', { exact: true })).toHaveCount(1)
})
