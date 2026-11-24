// A production's pull list in a real browser (S15, S5; INV-17, INV-18): a stage manager starts one
// from the production's Kit tab, adds what is wanted in words, matches it to an item and sends it to
// the department. Each screen has no accessibility violations.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const actor = (accountId: string, name: string, abilities: string[]) => ({ kind: 'person', accountId, name, assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(grant) })
const lead = actor('acc_kitsetup', 'Kit Setup', ['core.settings.manage', 'core.modules.manage', 'core.production.create', 'core.production.edit', 'inventory.setup.manage', 'inventory.item.edit'])
const stageManager = actor('acc_stagemanager', 'Sam Stage', ['core.production.view', 'inventory.pull-list.edit'])
const as = (who: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(who) } })
const stamp = Date.now() % 17_576
const letters = (n: number) => [Math.floor(n / 676), Math.floor(n / 26) % 26, n % 26].map(i => String.fromCharCode(65 + i)).join('')
const write = async (api: APIRequestContext, path: string, data: object) => {
  const response = await api.post(path, { data, headers: { 'idempotency-key': `e2e-${path}-${stamp}-${JSON.stringify(data).length}` } })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}
const department = `Props ${stamp}`
const title = `The Seagull ${stamp}`
let productionId = ''
// A day some way ahead, as typed into a British date field: day, month, year.
const typed = (ahead: number) => {
  const d = new Date(Date.now() + ahead * 86_400_000)
  return `${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${d.getUTCFullYear()}`
}

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(lead) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }] } })
  expect((await api.put('/api/core/modules/inventory', { data: { on: true } })).ok()).toBe(true)
  const { departmentId } = await write(api, '/api/inventory/departments', { name: department, tagPrefix: `P${letters(stamp)}`, lendsTo: 'productions' })
  const { categoryId } = await write(api, '/api/inventory/categories', { departmentId, name: `Crockery ${stamp}` })
  const { locationId } = await write(api, '/api/inventory/locations', { name: `Shelf ${stamp}` })
  await write(api, `/api/inventory/categories/${categoryId}/items`, { homeLocationId: locationId, condition: 'good', lendable: true, ownership: 'owned', tracking: 'individual', name: `Samovar ${stamp}` })
  productionId = (await write(api, '/api/core/productions', { title, kind: 'own' })).id
  await api.dispose()
})
test.use(as(stageManager))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test('a stage manager starts a pull list, matches a wanted line and sends it to the department', async ({ page }) => {
  await visit(page, `/console/programme/productions/${productionId}?tab=inventory.production`)
  await expect(page.getByRole('tab', { name: /Kit/ })).toBeVisible()
  await expect(page.getByText('No pull lists yet')).toBeVisible()
  await noViolations(page)

  await page.getByRole('button', { name: 'Start a pull list' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Department', { exact: true }).click()
  await page.getByRole('option', { name: department }).click()
  await dialog.getByRole('spinbutton').nth(3).click()
  await page.keyboard.type(typed(40))
  await dialog.getByRole('button', { name: 'Start a pull list' }).click()
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
  await expect(page.getByText('Pull list', { exact: true }).first()).toBeVisible()

  await page.getByLabel('Add what is wanted, in words').fill('Samovar')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Wanted', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Actions for Samovar' }).click()
  await page.getByRole('menuitem', { name: 'Match to an item' }).click()
  const match = page.getByRole('dialog')
  await match.getByRole('combobox').click()
  await page.getByRole('option', { name: new RegExp(`Samovar ${stamp}`) }).click()
  await match.getByRole('button', { name: 'Match to an item' }).click()
  await expect(page.getByText('Listed', { exact: true })).toBeVisible()
  await noViolations(page)

  await page.getByRole('button', { name: 'Send to the department' }).click()
  await expect(page.getByText('Requested', { exact: true }).first()).toBeVisible()
})
