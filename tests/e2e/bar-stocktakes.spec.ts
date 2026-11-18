// The bar's stocktake screens in a real browser: a count is started at a location, counted (with a
// part of a bottle), submitted, given a reason for its difference and approved, which puts the level
// right. Each screen has no accessibility violations.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const manager = {
  kind: 'person',
  accountId: 'acc_barcount',
  name: 'Cass Count',
  assurance: 'strong',
  reassertedAt: Date.now(),
  grants: ['core.settings.manage', 'core.modules.manage', 'bar.product.manage', 'bar.stock.manage', 'bar.stock.receive', 'bar.stocktake.approve'].map(grant),
}
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const stamp = Date.now() % 1_000_000
const s = { store: '', spirits: '', gin: '' }

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(manager) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }] } })
  for (const id of ['finance', 'payments', 'bar']) {
    const on = await api.put(`/api/core/modules/${id}`, { data: { on: true } })
    expect(on.ok(), `${id}: ${await on.text()}`).toBe(true)
  }
  const post = async (path: string, data: unknown) => {
    const response = await api.post(path, { data, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
    return response.json()
  }
  s.store = (await post('/api/bar/stock/locations', { name: `Back store ${stamp}` })).locationId
  // Counted by category, so that stock items made by other tests are not on this count.
  s.spirits = (await post('/api/bar/categories', { name: `Spirits ${stamp}` })).categoryId
  s.gin = (await post('/api/bar/stock/items', { name: `Gin ${stamp}`, categoryId: s.spirits, baseUnit: 'ml', packSize: 4200, packName: 'case', countUnitSize: 700 })).stockItemId
  // Six bottles arrive: 4,200 ml.
  const delivery = await post('/api/bar/stock/deliveries', { locationId: s.store, supplierTermId: null, supplierRef: null, lines: [{ stockItemId: s.gin, packs: 1, looseUnits: 0, packCostMinor: null }] })
  await post(`/api/bar/stock/deliveries/${delivery.deliveryId}/receive`, {})
  await api.dispose()
})
test.use(as(manager))

async function visit(page: Page, url: string) {
  const response = await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  return response
}
async function noViolations(page: Page) {
  // A select's list stays in the page for a moment while it closes; let it go first.
  await expect(page.getByRole('listbox')).toHaveCount(0)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test('a count is started, counted, submitted and approved, and the level is put right', async ({ page }) => {
  await visit(page, '/console/bar/stocktakes')
  await page.getByRole('button', { name: 'Start a count' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Location').click()
  await page.getByRole('option', { name: `Back store ${stamp}` }).click()
  await dialog.getByLabel('What to count').click()
  await page.getByRole('option', { name: `Spirits ${stamp}` }).click()
  await noViolations(page)
  await dialog.getByRole('button', { name: 'Start counting' }).click()
  await expect(page).toHaveURL(/\/console\/bar\/stocktakes\/bstk_/)
  await expect(page.getByRole('heading', { name: `Count of Spirits ${stamp} at Back store ${stamp}` })).toBeVisible()

  // The level is shown, since counts are not blind; four and a half bottles are counted.
  const row = page.getByRole('row', { name: new RegExp(`Gin ${stamp}`) })
  await expect(row.getByRole('cell', { name: '6 bottles (4,200 ml)' })).toBeVisible()
  await page.getByLabel(`Count of Gin ${stamp}`).fill('4.5')
  // A number field takes what was typed when it loses focus.
  await page.getByLabel(`Count of Gin ${stamp}`).press('Tab')
  await noViolations(page)
  await page.getByRole('button', { name: /^Submit \d+ of \d+ counted$/ }).click()
  await expect(page.getByText('Count submitted for approval.').first()).toBeVisible()

  // The review: 1.5 bottles short.
  const review = page.getByRole('row', { name: new RegExp(`Gin ${stamp}`) })
  await expect(review.getByRole('cell', { name: '−1.5 bottles (1,050 ml)' })).toBeVisible()
  await review.getByLabel(`Why Gin ${stamp} differs`).click()
  await page.getByRole('option', { name: 'Waste not recorded' }).click()
  await noViolations(page)
  await page.getByRole('button', { name: /^Approve and change \d+ levels?$/ }).click()
  // Approving asks first, with what was found and what is missing.
  await expect(page.getByRole('dialog').getByText(/stock missing worth/)).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: /^Approve and change \d+ levels?$/ }).click()
  await expect(page.getByText(/Count approved\. \d+ levels? changed\./).first()).toBeVisible()
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible()

  await visit(page, `/console/bar/stock?location=${s.store}`)
  await expect(page.getByRole('row', { name: new RegExp(`Gin ${stamp}`) }).getByRole('cell', { name: '4.5 bottles (3,150 ml)' })).toBeVisible()
})
