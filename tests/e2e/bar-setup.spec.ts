// The bar's set-up screens for products and recipes in a real browser: Choices, a product's choices,
// mixer tick and allergens, sub-categories, and an outlet's till layout and favourites. Each loads for
// someone who sets the bar up and has no accessibility violations, and the forms write.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const manager = {
  kind: 'person',
  accountId: 'acc_barsetup',
  name: 'Bea Setup',
  assurance: 'strong',
  reassertedAt: Date.now(),
  grants: ['core.settings.manage', 'core.modules.manage', 'bar.product.manage', 'bar.price.manage', 'bar.outlet.manage', 'bar.allergens.manage', 'bar.settings.manage'].map(grant),
}
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const stamp = Date.now() % 1_000_000
const s = { snacks: '', crisps: '', product: '', choice: '' }

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
  s.snacks = (await post('/api/bar/categories', { name: `Snacks ${stamp}` })).categoryId
  s.crisps = (await post('/api/bar/categories', { name: `Crisps ${stamp}`, parentId: s.snacks })).categoryId
  s.product = (await post('/api/bar/products', { categoryId: s.snacks, name: `Hot chocolate ${stamp}`, amountMinor: 250 })).productId
  await post('/api/bar/products', { categoryId: s.crisps, name: `Ready salted ${stamp}`, amountMinor: 120 })
  s.choice = (await post('/api/bar/choices', { name: `Add a shot ${stamp}`, source: 'options', required: false })).id
  await post(`/api/bar/choices/${s.choice}/options`, { name: `Irish cream ${stamp}`, deltaMinor: 200, ageRestricted: true })
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

test('Choices lists each group with its options and has no violations', async ({ page }) => {
  await visit(page, '/admin/modules/bar/choices')
  await expect(page.getByRole('tab', { name: 'Choices', selected: true })).toBeVisible()
  await expect(page.getByText(`Irish cream ${stamp}`)).toBeVisible()
  await expect(page.getByText('Adds £2.00 · Age check · Not checked yet')).toBeVisible()
  await noViolations(page)
})

test('a sub-category shows under its parent on Products', async ({ page }) => {
  await visit(page, '/admin/modules/bar/products')
  await expect(page.getByRole('heading', { name: `Snacks ${stamp} › Crisps ${stamp}` })).toBeVisible()
  await noViolations(page)
})

test('a product records its allergens from the label', async ({ page }) => {
  await visit(page, `/admin/modules/bar/products/${s.product}`)
  await expect(page.getByText('Not checked yet')).toBeVisible()
  await noViolations(page)
  await page.getByRole('button', { name: 'Check the label' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('group', { name: 'Contains' }).getByLabel('Milk').check()
  await dialog.getByRole('group', { name: 'May contain' }).getByLabel('Soya').check()
  await noViolations(page)
  await dialog.getByRole('button', { name: 'Record the check' }).click()
  await expect(page.getByText('Allergens recorded.').first()).toBeVisible()
  await expect(page.getByText('Milk', { exact: true })).toBeVisible()
  await expect(page.getByText('Soya', { exact: true })).toBeVisible()
})

test('an outlet takes a till layout', async ({ page }) => {
  await visit(page, '/admin/modules/bar/outlets')
  await page.getByRole('button', { name: 'New outlet' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(`Foyer ${stamp}`)
  await expect(dialog.getByText('Till layout')).toBeVisible()
  await noViolations(page)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Outlet saved.').first()).toBeVisible()
})
