// The bar's everyday stock screens in a real browser: a delivery is drafted and received into a
// location, Stock shows the level in each location, and stock is written off and moved from a row.
// Each screen has no accessibility violations.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const manager = {
  kind: 'person',
  accountId: 'acc_barstock',
  name: 'Sam Stock',
  assurance: 'strong',
  reassertedAt: Date.now(),
  grants: ['core.settings.manage', 'core.modules.manage', 'bar.stock.manage', 'bar.stock.receive', 'bar.stock.waste'].map(grant),
}
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const stamp = Date.now() % 1_000_000
const s = { bar: '', cellar: '', cola: '' }

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
  s.bar = (await post('/api/bar/stock/locations', { name: `Foyer bar ${stamp}` })).locationId
  s.cellar = (await post('/api/bar/stock/locations', { name: `Cellar ${stamp}` })).locationId
  s.cola = (await post('/api/bar/stock/items', { name: `Cola can ${stamp}`, baseUnit: 'each', packSize: 24, packName: 'case', countUnitSize: 1 })).stockItemId
  await api.dispose()
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

test.describe.configure({ mode: 'serial' })

test('a delivery is drafted, then received into its location', async ({ page }) => {
  await visit(page, '/console/bar/deliveries')
  await page.getByRole('link', { name: 'Record a delivery' }).first().click()
  await expect(page).toHaveURL(/\/console\/bar\/deliveries\/new/)
  await page.getByLabel('Into').click()
  await page.getByRole('option', { name: `Cellar ${stamp}` }).click()
  await page.getByLabel('Delivery note number').fill(`DN-${stamp}`)
  await page.getByRole('button', { name: 'Add an item' }).click()
  await page.getByRole('option', { name: `Cola can ${stamp}` }).click()
  await page.getByLabel(`Packs of Cola can ${stamp}`).fill('2')
  await page.getByLabel(`Loose units of Cola can ${stamp}`).fill('6')
  await expect(page.getByRole('cell', { name: '54 each' })).toBeVisible()
  await noViolations(page)
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page).toHaveURL(/\/console\/bar\/deliveries\/bdlv_/)
  await expect(page.getByText('Draft', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: `Receive 1 lines into Cellar ${stamp}` }).click()
  await expect(page.getByText(`Delivery received into Cellar ${stamp}.`).first()).toBeVisible()
  await expect(page.getByText('A received delivery is final.', { exact: false })).toBeVisible()
  await noViolations(page)
})

test('Stock shows each location, and a row writes stock off and moves it', async ({ page }) => {
  await visit(page, '/console/bar/stock')
  const row = page.getByRole('row', { name: new RegExp(`Cola can ${stamp}`) })
  await expect(row.getByRole('cell', { name: '54 each' }).first()).toBeVisible()
  await noViolations(page)

  await row.getByRole('button', { name: `Actions for Cola can ${stamp}` }).click()
  await page.getByRole('menuitem', { name: 'Write off' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Location').click()
  await page.getByRole('option', { name: `Cellar ${stamp}` }).click()
  await dialog.getByLabel('How much').fill('2')
  await dialog.getByLabel('Why').click()
  await page.getByRole('option', { name: 'Broken or spilled' }).click()
  await noViolations(page)
  await dialog.getByRole('button', { name: 'Write off' }).click()
  await expect(page.getByText(`Cola can ${stamp} written off.`).first()).toBeVisible()

  await row.getByRole('button', { name: `Actions for Cola can ${stamp}` }).click()
  await page.getByRole('menuitem', { name: 'Move' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('From').click()
  await page.getByRole('option', { name: `Cellar ${stamp}` }).click()
  await dialog.getByLabel('To', { exact: true }).click()
  await page.getByRole('option', { name: `Foyer bar ${stamp}` }).click()
  await dialog.getByLabel('How much').fill('24')
  await dialog.getByRole('button', { name: 'Move' }).click()
  await expect(page.getByText(`Cola can ${stamp} moved.`).first()).toBeVisible()
  await expect(row.getByRole('cell', { name: '52 each' })).toBeVisible()

  await row.getByRole('button', { name: `Actions for Cola can ${stamp}` }).click()
  await page.getByRole('menuitem', { name: 'History' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByText(`Moved in · Foyer bar ${stamp}`)).toBeVisible()
  await expect(dialog.getByText('Broken or spilled', { exact: false })).toBeVisible()
  await noViolations(page)
})
