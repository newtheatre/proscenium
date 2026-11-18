// Allergens on stock items in a real browser: a stock item's label is checked on the Stock tab, and a
// product whose recipe uses it answers with the item's allergens on its own page.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const manager = {
  kind: 'person',
  accountId: 'acc_barallergen',
  name: 'Ali Allergen',
  assurance: 'strong',
  reassertedAt: Date.now(),
  grants: ['core.settings.manage', 'core.modules.manage', 'bar.product.manage', 'bar.price.manage', 'bar.allergens.manage', 'bar.stock.manage', 'bar.outlet.manage'].map(grant),
}
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const stamp = Date.now() % 1_000_000
const s = { product: '', item: '' }

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(manager) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }] } })
  for (const id of ['finance', 'payments', 'bar']) {
    const on = await api.put(`/api/core/modules/${id}`, { data: { on: true } })
    expect(on.ok(), `${id}: ${await on.text()}`).toBe(true)
  }
  const send = async (method: 'post', path: string, data: unknown) => {
    const response = await api[method](path, { data, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
    return response.json()
  }
  const category = (await send('post', '/api/bar/categories', { name: `Cups ${stamp}` })).categoryId
  s.product = (await send('post', '/api/bar/products', { categoryId: category, name: `Fruit cup jug ${stamp}`, amountMinor: 1500 })).productId
  s.item = (await send('post', '/api/bar/stock/items', { name: `Fruit cup ${stamp}`, baseUnit: 'ml', packSize: 700, packName: 'bottle', countUnitSize: 700 })).stockItemId
  const product = await (await api.get(`/api/bar/products/${s.product}`)).json()
  await send('post', `/api/bar/variants/${product.product.variants[0].id}/recipe`, { lines: [{ stockItemId: s.item, quantity: 200 }] })
  // An outlet of its own, so the product is on sale and the public chart lists it.
  await send('post', '/api/bar/outlets', { name: `Allergen bar ${stamp}`, kind: 'bar' })
  await api.dispose()
})
test.use(as(manager))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
async function noViolations(page: Page) {
  await expect(page.getByRole('listbox')).toHaveCount(0)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test('a stock item\'s label is checked, and the product made from it answers with it', async ({ page }) => {
  await visit(page, `/admin/modules/bar/products/${s.product}`)
  await expect(page.getByText(`From Fruit cup ${stamp} (not checked)`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check the label' })).toHaveCount(0)

  await visit(page, '/admin/modules/bar/stock')
  await page.getByRole('button', { name: `Actions for Fruit cup ${stamp}` }).click()
  await page.getByRole('menuitem', { name: 'Check the label' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('group', { name: 'May contain' }).getByLabel('Sulphites').check()
  await noViolations(page)
  await dialog.getByRole('button', { name: 'Record the check' }).click()
  await expect(page.getByText('Allergens recorded.').first()).toBeVisible()
  await expect(page.getByText('May contain: Sulphur dioxide and sulphites').first()).toBeVisible()

  await visit(page, `/admin/modules/bar/products/${s.product}`)
  await expect(page.getByText(`From Fruit cup ${stamp}`, { exact: true })).toBeVisible()
  await expect(page.getByText('May contain: Sulphur dioxide and sulphites')).toBeVisible()
  await noViolations(page)
})

test.describe('the public chart', () => {
  test.use({ extraHTTPHeaders: {} })

  test('shows anyone what each item lists, and marks what someone avoids', async ({ page }) => {
    await visit(page, '/bar/allergens')
    await expect(page.getByRole('heading', { name: 'Allergens at the bar', level: 1 })).toBeVisible()
    await noViolations(page)
    await expect(page.getByText(`Fruit cup jug ${stamp} · Each`).first()).toBeVisible()
    await page.getByLabel('Sulphur dioxide and sulphites').check()
    await expect(page.getByText('May contain Sulphur dioxide and sulphites').first()).toBeVisible()
    await noViolations(page)
  })
})
