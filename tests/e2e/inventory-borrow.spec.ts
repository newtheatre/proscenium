// Borrow kit in a real browser (S12 to S14; INV-20, INV-27): a member adds a costume to a request,
// sends it, finds it under My loans and cancels it. Each screen has no accessibility violations.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const actor = (accountId: string, name: string, abilities: string[]) => ({ kind: 'person', accountId, name, assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(grant) })
const lead = actor('acc_kitwardrobe', 'Wardrobe Lead', ['core.settings.manage', 'core.modules.manage', 'inventory.setup.manage', 'inventory.item.edit'])
const borrower = actor('acc_kitborrower', 'Bea Borrower', ['inventory.loan.request'])
const as = (who: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(who) } })
const stamp = Date.now() % 17_576
const letters = (n: number) => [Math.floor(n / 676), Math.floor(n / 26) % 26, n % 26].map(i => String.fromCharCode(65 + i)).join('')
const write = async (api: APIRequestContext, path: string, data: object) => {
  const response = await api.post(path, { data, headers: { 'idempotency-key': `e2e-${path}-${stamp}-${JSON.stringify(data).length}` } })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}
const department = `Costume ${stamp}`
// A day some way ahead, as typed into a British date field: day, month, year.
const typed = (ahead: number) => {
  const d = new Date(Date.now() + ahead * 86_400_000)
  return `${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${d.getUTCFullYear()}`
}

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(lead) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }] } })
  expect((await api.put('/api/core/modules/inventory', { data: { on: true } })).ok()).toBe(true)
  const { departmentId } = await write(api, '/api/inventory/departments', { name: department, tagPrefix: `C${letters(stamp)}`, lendsTo: 'members' })
  const { categoryId } = await write(api, '/api/inventory/categories', { departmentId, name: `Gowns ${stamp}` })
  const { locationId } = await write(api, '/api/inventory/locations', { name: `Wardrobe ${stamp}` })
  await write(api, `/api/inventory/categories/${categoryId}/items`, { homeLocationId: locationId, condition: 'good', lendable: true, ownership: 'owned', tracking: 'individual', name: `Ball gown ${stamp}` })
  await api.dispose()
})
test.use(as(borrower))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test('a member asks to borrow a gown, sees it under My loans and cancels it', async ({ page }) => {
  await visit(page, '/members/kit')
  await expect(page.getByRole('heading', { name: 'Borrow kit', level: 1 })).toBeVisible()
  await page.getByRole('spinbutton').first().click()
  await page.keyboard.type(`${typed(10)}${typed(12)}`)
  await expect(page.getByText('Free then').first()).toBeVisible()
  await noViolations(page)
  await page.getByRole('button', { name: `Add Ball gown ${stamp} to the request` }).click()
  await page.getByRole('link', { name: 'Request 1 item' }).click()

  await expect(page.getByRole('heading', { name: 'Request kit', level: 1 })).toBeVisible()
  await page.getByLabel('What it is for').fill('Society ball')
  await noViolations(page)
  await page.getByRole('button', { name: 'Send the request' }).click()

  await expect(page.getByRole('heading', { name: 'My loans', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(department) }).click()
  await expect(page.getByText('Requested', { exact: false }).first()).toBeVisible()
  await noViolations(page)
  await page.getByRole('button', { name: 'Cancel request' }).click()
  await expect(page.getByText('Cancelled', { exact: false }).first()).toBeVisible()
})
