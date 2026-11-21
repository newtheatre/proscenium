// The bar's set-up screens for products and recipes in a real browser: Choices, a product's choices,
// mixer tick and allergens, sub-categories, and an outlet's till layout and favourites. Each loads for
// someone who sets the bar up and has no accessibility violations, and the forms write. Stock: its
// items and locations, and a size's recipe.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const manager = {
  kind: 'person',
  accountId: 'acc_barsetup',
  name: 'Bea Setup',
  assurance: 'strong',
  reassertedAt: Date.now(),
  grants: ['core.settings.manage', 'core.modules.manage', 'bar.product.manage', 'bar.price.manage', 'bar.outlet.manage', 'bar.allergens.manage', 'bar.stock.manage', 'bar.settings.manage'].map(grant),
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
  await expect(page.getByText('Adds £2.00 · Age check · Allergens: not checked yet')).toBeVisible()
  await noViolations(page)
})

test('a sub-category shows under its parent on Products', async ({ page }) => {
  await visit(page, '/admin/modules/bar/products')
  await expect(page.getByRole('heading', { name: `Snacks ${stamp} › Crisps ${stamp}` })).toBeVisible()
  await noViolations(page)
})

test('a product records its allergens from the label', async ({ page }) => {
  await visit(page, `/admin/modules/bar/products/${s.product}`)
  await expect(page.getByText('Not checked yet', { exact: true })).toBeVisible()
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
  await page.getByRole('button', { name: 'New outlet' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(`Foyer ${stamp}`)
  await expect(dialog.getByText('Till layout')).toBeVisible()
  await noViolations(page)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Outlet saved.').first()).toBeVisible()
})

test('Stock takes a location and an item, and a size takes a recipe', async ({ page }) => {
  await visit(page, '/admin/modules/bar/stock')
  await expect(page.getByRole('tab', { name: 'Stock', selected: true })).toBeVisible()
  await noViolations(page)

  await page.getByRole('button', { name: 'New location' }).click()
  let dialog = page.getByRole('dialog')
  // Saved empty, the form says what is missing beside the field.
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByText('This is needed.').first()).toBeVisible()
  await dialog.getByLabel('Name', { exact: true }).fill(`Cellar ${stamp}`)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Location saved.').first()).toBeVisible()

  await page.getByRole('button', { name: 'New stock item' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name', { exact: true }).fill(`Cocoa ${stamp}`)
  await dialog.getByLabel('Delivered as').fill('tub')
  await dialog.getByLabel('Amount in one').fill('500')
  // Once there are categories, an item needs one, so it is on some count by category.
  await dialog.getByRole('button', { name: /^Category\*?$/ }).click()
  await page.getByRole('option', { name: `Snacks ${stamp}` }).click()
  await noViolations(page)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Stock item saved.').first()).toBeVisible()
  await expect(page.getByText(`Cocoa ${stamp}`)).toBeVisible()

  // Retiring a location puts it under the divider and offers Undo, which brings it straight back.
  await page.getByRole('button', { name: `Actions for Cellar ${stamp}` }).click()
  await page.getByRole('menuitem', { name: 'Retire' }).click()
  await expect(page.getByText(`Cellar ${stamp} retired.`).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Retired locations/ })).toBeVisible()
  await page.getByRole('region', { name: /Notifications/ }).getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('list', { name: 'Locations' }).getByText(`Cellar ${stamp}`)).toBeVisible()

  await visit(page, `/admin/modules/bar/products/${s.product}`)
  await expect(page.getByText('No recipe: moves no stock')).toBeVisible()
  await page.getByRole('button', { name: 'Edit recipe of Each' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Ingredient', exact: true }).click()
  await page.getByRole('option', { name: `Cocoa ${stamp}` }).click()
  await dialog.getByLabel('Amount').fill('20')
  await noViolations(page)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Recipe saved.').first()).toBeVisible()
  await expect(page.getByText(`20 ml of Cocoa ${stamp}`)).toBeVisible()
})

test('Add a product starts from a preset, fills a row per size, and stays on the list', async ({ page }) => {
  await visit(page, '/admin/modules/bar/products')
  await page.getByRole('button', { name: 'New product' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: /Wine/ })).toBeVisible()
  await noViolations(page)
  await dialog.getByRole('button', { name: /Wine/ }).click()
  await dialog.getByRole('button', { name: 'Add product' }).click()
  await expect(dialog.getByText('This is needed.').first()).toBeVisible()
  await dialog.getByLabel('Name', { exact: true }).fill(`House red ${stamp}`)
  await dialog.getByLabel('Category').click()
  await page.getByRole('option', { name: `Snacks ${stamp}`, exact: true }).click()
  await expect(dialog.getByLabel('Size 4 name')).toHaveValue('Bottle')
  await dialog.getByLabel('Size 2 name').fill('125ml')
  await dialog.getByRole('button', { name: 'Add product' }).click()
  await expect(dialog.getByText('Another size already has this name.')).toBeVisible()
  await dialog.getByLabel('Size 2 name').fill('175ml')
  await dialog.getByLabel('Size 1 Standard price').fill('3.50')
  await dialog.getByLabel('Size 4 Standard price').fill('16.00')
  await noViolations(page)
  if (process.env.BAR_SHOTS) await page.screenshot({ path: `${process.env.BAR_SHOTS}/add-product.png`, fullPage: true })
  await dialog.getByRole('button', { name: 'Add product' }).click()
  await expect(dialog.getByText('175ml has no price on Standard, so it can\'t be sold yet.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add without prices' }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/admin\/modules\/bar\/products$/)
  const row = page.getByRole('listitem').filter({ hasText: `House red ${stamp}` })
  await expect(row.getByText('Needs a price')).toBeVisible()
  // The Open in the "Added" toast, not another row's.
  await page.getByRole('region', { name: /Notifications/ }).getByRole('link', { name: 'Open' }).click()
  await expect(page.getByRole('heading', { name: '250ml' })).toBeVisible()
})

test('a category with a usual preset opens Add a product on it', async ({ page }) => {
  await visit(page, '/admin/modules/bar/products')
  const section = page.getByRole('region', { name: `Snacks ${stamp}`, exact: true })
  await section.getByRole('button', { name: `Actions for Snacks ${stamp}` }).click()
  await page.getByRole('menuitem', { name: 'Edit category' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Usual kind of product').click()
  await page.getByRole('option', { name: 'Snack' }).click()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await section.getByRole('button', { name: 'Add a product' }).click()
  await expect(page.getByRole('dialog').getByText('Preset: Snack')).toBeVisible()
})
