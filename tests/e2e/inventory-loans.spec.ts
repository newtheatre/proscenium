// Lending kit in a real browser (S4, S5; INV-19, INV-21): a department lead lends two items to a
// visiting company from the form, the loan page shows them promised, and the loans list has it
// under Approved. Each screen has no accessibility violations.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const lead = {
  kind: 'person',
  accountId: 'acc_kitlender',
  name: 'Kit Lender',
  assurance: 'strong',
  reassertedAt: Date.now(),
  grants: ['core.settings.manage', 'core.modules.manage', 'inventory.setup.manage', 'inventory.item.edit', 'inventory.loan.approve'].map(grant),
}
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const stamp = Date.now() % 17_576
const letters = (n: number) => [Math.floor(n / 676), Math.floor(n / 26) % 26, n % 26].map(i => String.fromCharCode(65 + i)).join('')
const write = async (api: APIRequestContext, path: string, data: object) => {
  const response = await api.post(path, { data, headers: { 'idempotency-key': `e2e-${path}-${stamp}-${JSON.stringify(data).length}` } })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}
const name = `Wardrobe ${stamp}`
// A day some way ahead, as typed into a British date field: day, month, year.
const typed = (ahead: number) => {
  const d = new Date(Date.now() + ahead * 86_400_000)
  return `${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${d.getUTCFullYear()}`
}

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(lead) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }] } })
  expect((await api.put('/api/core/modules/inventory', { data: { on: true } })).ok()).toBe(true)
  const { departmentId } = await write(api, '/api/inventory/departments', { name, tagPrefix: `W${letters(stamp)}`, lendsTo: 'anyone' })
  const { categoryId } = await write(api, '/api/inventory/categories', { departmentId, name: `Coats ${stamp}` })
  const { locationId } = await write(api, '/api/inventory/locations', { name: `Rail ${stamp}` })
  const details = { homeLocationId: locationId, condition: 'good', lendable: true, ownership: 'owned', tracking: 'individual' }
  await write(api, `/api/inventory/categories/${categoryId}/items`, { ...details, name: `Frock coat ${stamp}` })
  await write(api, `/api/inventory/categories/${categoryId}/items`, { ...details, name: `Top hat ${stamp}` })
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

test.describe.configure({ mode: 'serial' })

test('a lead lends two items to a visiting company, and the loan shows them promised', async ({ page }) => {
  await visit(page, '/console/inventory/loans/new')
  await expect(page.getByRole('heading', { name: 'Lend kit', level: 1 })).toBeVisible()
  await noViolations(page)
  const department = page.getByLabel('Department', { exact: true })
  if (await department.isVisible()) {
    await department.click()
    await page.getByRole('option', { name }).click()
  }
  await page.getByLabel('Borrower', { exact: true }).fill('Albany Players')
  await page.getByLabel('Their email address').fill('props@albany.example')
  await page.getByLabel('Items').click()
  await page.getByRole('option', { name: new RegExp(`Frock coat ${stamp}`) }).click()
  await page.getByRole('option', { name: new RegExp(`Top hat ${stamp}`) }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('spinbutton').first().click()
  await page.keyboard.type(`${typed(20)}${typed(24)}`)
  await page.getByRole('button', { name: 'Lend', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Albany Players', level: 1 })).toBeVisible()
  await expect(page.getByText('Promised')).toHaveCount(2)
  await noViolations(page)
})

test('the loans list has it under Approved', async ({ page }) => {
  await visit(page, '/console/inventory/loans')
  await page.getByRole('tab', { name: /Approved/ }).click()
  await expect(page.getByText('Albany Players').first()).toBeVisible()
  await noViolations(page)
})
