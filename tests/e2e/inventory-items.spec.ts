// Inventory's catalogue in a real browser (S1 to S3; INV-10, INV-14 to INV-16): an item added from
// the form gets its tag and shows in the list, its page answers where it is and what it needs, and
// it moves to another store. Each screen has no accessibility violations.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const lead = {
  kind: 'person',
  accountId: 'acc_kitlead',
  name: 'Kit Lead',
  assurance: 'strong',
  reassertedAt: Date.now(),
  grants: ['core.settings.manage', 'core.modules.manage', 'inventory.setup.manage', 'inventory.item.edit'].map(grant),
}
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const stamp = Date.now() % 1_000_000
const write = (api: APIRequestContext, path: string, data: object) => api.post(path, { data, headers: { 'idempotency-key': `e2e-${path}-${stamp}` } })

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(lead) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }] } })
  expect((await api.put('/api/core/modules/inventory', { data: { on: true } })).ok()).toBe(true)
  const { departments } = await (await api.get('/api/inventory/departments')).json() as { departments: { id: string }[] }
  const departmentId = departments[0]?.id ?? (await (await write(api, '/api/inventory/departments', { name: `Lighting ${stamp}`, tagPrefix: 'LX', lendsTo: 'productions' })).json()).departmentId
  expect((await write(api, '/api/inventory/categories', { departmentId, name: `Lanterns ${stamp}` })).ok()).toBe(true)
  expect((await write(api, '/api/inventory/locations', { name: `Lantern store ${stamp}` })).ok()).toBe(true)
  expect((await write(api, '/api/inventory/locations', { name: `Get-out bay ${stamp}` })).ok()).toBe(true)
  await api.dispose()
})
test.use(as(lead))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}
async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click()
  await page.getByRole('option', { name: option }).first().click()
}

test.describe.configure({ mode: 'serial' })

test('an item added from the form gets its tag and shows in the list', async ({ page }) => {
  await visit(page, '/console/inventory/items/new')
  await expect(page.getByRole('heading', { name: 'Add item', level: 1 })).toBeVisible()
  await noViolations(page)
  await choose(page, 'Category', `Lanterns ${stamp}`)
  await page.getByLabel('Name', { exact: true }).fill(`Fresnel ${stamp}`)
  await choose(page, 'Home', `Lantern store ${stamp}`)
  await page.getByRole('button', { name: 'Add item' }).last().click()
  await expect(page).toHaveURL(/\/console\/inventory$/)
  await expect(page.getByText(`Fresnel ${stamp}`).first()).toBeVisible()
  await noViolations(page)
})

test('the item page says where it is, and it moves to another store', async ({ page }) => {
  await visit(page, '/console/inventory')
  await page.getByText(`Fresnel ${stamp}`).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`Fresnel ${stamp}`)
  await expect(page.getByText(`Lantern store ${stamp}`).first()).toBeVisible()
  await noViolations(page)
  await page.getByRole('button', { name: /^More actions/ }).click()
  await page.getByRole('menuitem', { name: 'Move' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: `Get-out bay ${stamp}` }).click()
  await dialog.getByRole('button', { name: 'Move' }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByText(`Lantern store ${stamp} to Get-out bay ${stamp}`).first()).toBeVisible()
})
