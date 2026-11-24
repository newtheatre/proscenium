// The kit desk in a real browser (S6; INV-22, INV-23): a loan opened by its number, its item checked
// out, then taken back in Return mode. The desk has no accessibility violations.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const lead = {
  kind: 'person',
  accountId: 'acc_kitdesk',
  name: 'Desk Volunteer',
  assurance: 'strong',
  reassertedAt: Date.now(),
  grants: ['core.settings.manage', 'core.modules.manage', 'inventory.setup.manage', 'inventory.item.edit', 'inventory.loan.approve', 'inventory.loan.issue'].map(grant),
}
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const stamp = Date.now() % 17_576
const letters = (n: number) => [Math.floor(n / 676), Math.floor(n / 26) % 26, n % 26].map(i => String.fromCharCode(65 + i)).join('')
const write = async (api: APIRequestContext, path: string, data: object) => {
  const response = await api.post(path, { data, headers: { 'idempotency-key': `e2e-${path}-${stamp}-${JSON.stringify(data).length}` } })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}
// Started yesterday, so the desk may hand it out whatever the hour (L11).
const dayFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
let loanId = ''

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(lead) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }] } })
  expect((await api.put('/api/core/modules/inventory', { data: { on: true } })).ok()).toBe(true)
  const { departmentId } = await write(api, '/api/inventory/departments', { name: `Lighting ${stamp}`, tagPrefix: `L${letters(stamp)}`, lendsTo: 'anyone' })
  const { categoryId } = await write(api, '/api/inventory/categories', { departmentId, name: `Lanterns ${stamp}` })
  const { locationId } = await write(api, '/api/inventory/locations', { name: `Cage ${stamp}` })
  const { itemIds } = await write(api, `/api/inventory/categories/${categoryId}/items`, { homeLocationId: locationId, condition: 'good', lendable: true, ownership: 'owned', tracking: 'individual', name: `Fresnel ${stamp}` })
  loanId = (await write(api, '/api/inventory/loans', { departmentId, kind: 'outside', borrowerName: 'Albany Players', borrowerEmail: 'props@albany.example', startsOn: dayFromNow(-1), dueBackOn: dayFromNow(6), itemIds })).loanId
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

test('the desk checks a lantern out and takes it back', async ({ page }) => {
  await visit(page, '/console/inventory/desk')
  await expect(page.getByText('Scan to start')).toBeVisible()
  await noViolations(page)
  const scan = page.getByLabel('Scan a label, or type a tag or loan number')
  await scan.fill(loanId)
  await scan.press('Enter')
  await expect(page.getByText(`Lighting ${stamp}`, { exact: false })).toBeVisible()
  await page.getByRole('checkbox', { name: new RegExp(`Fresnel ${stamp}`) }).check()
  await noViolations(page)
  await page.getByRole('button', { name: 'Check out 1 item' }).click()
  await expect(page.getByText('Nothing waiting to go out')).toBeVisible()

  await page.getByRole('radio', { name: 'Return' }).check()
  await page.getByRole('checkbox', { name: new RegExp(`Fresnel ${stamp}`) }).check()
  await page.getByRole('button', { name: 'Take back 1 item' }).click()
  await expect(page.getByText('Nothing out on this loan')).toBeVisible()
})
