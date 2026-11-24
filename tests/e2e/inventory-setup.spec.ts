// Inventory's set-up screens in a real browser (S10; INV-05 to INV-08): the starting departments and
// inspection kinds, a category with its inspections, and a store with a rail inside it. Each page
// loads for someone who sets kit up and has no accessibility violations, and the forms write.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const manager = {
  kind: 'person',
  accountId: 'acc_kitsetup',
  name: 'Kit Setup',
  assurance: 'strong',
  reassertedAt: Date.now(),
  grants: ['core.settings.manage', 'core.modules.manage', 'inventory.setup.manage', 'inventory.settings.manage'].map(grant),
}
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const stamp = Date.now() % 1_000_000

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(manager) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }] } })
  const on = await api.put('/api/core/modules/inventory', { data: { on: true } })
  expect(on.ok(), await on.text()).toBe(true)
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

test('inspection kinds start from the usual four, and a new one is added from the form', async ({ page }) => {
  await visit(page, '/admin/modules/inventory/inspection-kinds')
  await expect(page.getByRole('heading', { name: 'Inspection kinds', level: 1 })).toBeVisible()
  const use = page.getByRole('button', { name: 'Use these inspection kinds' })
  if (await use.isVisible()) {
    await noViolations(page)
    await use.click()
    await expect(page.getByText('4 inspection kinds added', { exact: true }).first()).toBeVisible()
  }
  await expect(page.getByText('PAT test', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add inspection kind' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(`Rope check ${stamp}`)
  await dialog.getByLabel('Days between checks').fill('30')
  await dialog.getByRole('button', { name: 'Add inspection kind' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(`Rope check ${stamp}`, { exact: true })).toBeVisible()
  await expect(page.getByText('Every 30 days · Certificate optional').first()).toBeVisible()
  await noViolations(page)
})

test('departments start from the usual four, and a category takes its inspections', async ({ page }) => {
  await visit(page, '/admin/modules/inventory/departments')
  const use = page.getByRole('button', { name: 'Use these departments' })
  if (await use.isVisible()) {
    await noViolations(page)
    await use.click()
    await expect(page.getByText('4 departments added', { exact: true }).first()).toBeVisible()
  }
  const technical = page.getByRole('region', { name: 'Technical' })
  await expect(technical).toBeVisible()
  await technical.getByRole('button', { name: 'Actions for Technical' }).click()
  await page.getByRole('menuitem', { name: 'Add category' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a category to Technical' })
  await dialog.getByLabel('Name').fill(`Lanterns ${stamp}`)
  await dialog.getByRole('checkbox', { name: 'PAT test' }).check()
  await dialog.getByRole('button', { name: 'Add category' }).click()
  await expect(dialog).toBeHidden()
  await expect(technical.getByText(`Lanterns ${stamp}`, { exact: true })).toBeVisible()
  await expect(technical.getByText('Needs PAT test').first()).toBeVisible()
  await noViolations(page)
})

test('a store is added, then a rail inside it, shown beneath it', async ({ page }) => {
  await visit(page, '/admin/modules/inventory/locations')
  await expect(page.getByRole('heading', { name: 'Stores', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Add location' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(`Costume store ${stamp}`)
  await dialog.getByRole('button', { name: 'Add location' }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: `Actions for Costume store ${stamp}` }).click()
  await page.getByRole('menuitem', { name: 'Add a location inside' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Rail 3')
  await dialog.getByRole('button', { name: 'Add location' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: `Actions for Costume store ${stamp} › Rail 3` })).toBeVisible()
  await noViolations(page)
})
