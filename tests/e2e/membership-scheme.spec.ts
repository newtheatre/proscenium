// A scheme's page in Admin: lengths start from an empty state with Add length beside the heading,
// each length's Withdraw sits behind its row's menu, folds it under a divider and can be undone, and the renewal and grace
// fields sit as an even pair under the length rule.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const admin = {
  kind: 'person',
  accountId: 'acc_schemeadmin',
  name: 'Sam Scheme',
  assurance: 'strong',
  reassertedAt: Date.now(),
  grants: ['core.settings.manage', 'core.modules.manage', 'membership.scheme.view', 'membership.scheme.manage', 'membership.settings.manage'].map(grant),
}
test.use({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(admin) } })

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

async function noViolations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))))
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

// Screenshots for a review go to test-results when SCREENSHOTS is set.
async function shot(page: Page, name: string, locator = page.locator('main')) {
  if (process.env.SCREENSHOTS) await locator.screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' })
}

test('a scheme\'s lengths start empty, are added from a window and withdrawn from the row\'s menu', async ({ page, playwright }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const stamp = Date.now()
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', extraHTTPHeaders: { 'x-test-actor': JSON.stringify(admin) } })
  expect((await api.put('/api/core/modules/membership', { data: { on: true } })).ok()).toBe(true)
  const made = await api.post('/api/membership/schemes', { data: { name: `Scheme ${stamp}`, key: `scheme-${stamp}`, side: 'members', lengthRule: 'rolling' }, headers: { 'idempotency-key': crypto.randomUUID() } })
  expect(made.ok(), await made.text()).toBe(true)
  const { schemeId: id } = await made.json()
  await api.dispose()

  await visit(page, `/admin/modules/membership/schemes/${id}`)
  const lengths = page.locator('section', { has: page.getByRole('heading', { name: 'Lengths' }) })
  await expect(lengths.getByText('No lengths yet')).toBeVisible()
  await shot(page, 'lengths-empty', lengths)

  for (const [name, months] of [['1 year', '12'], ['3 years', '36']] as const) {
    await lengths.getByRole('button', { name: 'Add length' }).first().click()
    const window = page.getByRole('dialog')
    await window.getByLabel('Name').fill(name)
    await window.getByLabel('Months').fill(months)
    await window.getByRole('button', { name: 'Add length' }).click()
    await expect(window).toBeHidden()
    await expect(lengths.getByText(name, { exact: true })).toBeVisible()
  }
  await shot(page, 'lengths', lengths)

  await lengths.getByRole('button', { name: 'Actions for 3 years' }).click()
  await page.getByRole('menuitem', { name: 'Withdraw' }).click()
  // A withdrawn length folds away under its own divider.
  await lengths.getByRole('button', { name: 'Withdrawn (1)' }).click()
  await expect(lengths.getByText('Withdrawn: nobody new can choose it')).toBeVisible()
  await shot(page, 'lengths-withdrawn', lengths)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(lengths.getByRole('button', { name: 'Withdrawn (1)' })).toBeHidden()
  await expect(lengths.getByText('3 years', { exact: true })).toBeVisible()

  const details = page.locator('section', { has: page.getByRole('heading', { name: 'Details' }) })
  const renewal = details.getByLabel('Days before the end renewal opens')
  const grace = details.getByLabel('Days of grace')
  const [a, b] = [await renewal.boundingBox(), await grace.boundingBox()]
  expect(a && b && Math.abs(a.y - b.y) < 1 && Math.abs(a.width - b.width) < 1).toBe(true)
  const name = await details.getByLabel('Name').boundingBox()
  expect(name && a && Math.abs(name.width - a.width) < 2).toBe(true)
  await shot(page, 'details', details)
  await noViolations(page)
})
