// The console's settings window opens what belongs to the page it is opened from: on Productions,
// the programme's settings and seasons, and nothing of People's. Seasons folds archived seasons
// under a divider, searches from an icon, and every change can be undone from its toast.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const programmer = {
  kind: 'person',
  accountId: 'acc_settingswindow',
  name: 'Wyn Window',
  assurance: 'strong',
  reassertedAt: Date.now(),
  grants: ['core.production.view', 'core.programme.configure', 'core.season.manage', 'core.closure.manage', 'core.identity-settings.manage'].map(grant),
}
test.use({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(programmer) } })

async function visit(page: Page, url: string) {
  const response = await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  return response
}

async function noViolations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))))
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test('the cog on Productions opens the programme\'s settings and seasons, and nothing of People\'s', async ({ page }) => {
  await visit(page, '/console/programme/productions')
  await page.getByRole('link', { name: 'Programme settings' }).click()
  const window = page.getByRole('dialog')
  await expect(window.getByRole('heading', { name: 'Programme settings' })).toBeVisible()
  await expect(window.getByRole('tab', { name: 'Seasons' })).toBeVisible()
  await expect(window.getByRole('tab', { name: 'People' })).toHaveCount(0)
  await expect(window.getByRole('tab', { name: 'Closures' })).toHaveCount(0)
  await visit(page, '/console/programme/calendar')
  await page.getByRole('link', { name: 'Programme settings' }).click()
  await expect(page.getByRole('dialog').getByRole('tab', { name: 'Closures' })).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('tab', { name: 'Seasons' })).toHaveCount(0)
})

test('Seasons folds archived seasons away, searches from its icon, and undoes from the toast', async ({ page, playwright }) => {
  const stamp = Date.now()
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', extraHTTPHeaders: { 'x-test-actor': JSON.stringify(programmer) } })
  for (const [name, state] of [[`Old ${stamp}`, 'archived'], [`Now ${stamp}`, 'published']] as const) {
    const { id } = await (await api.post('/api/core/seasons', { data: { name, startsOn: '2030-01-01', endsOn: '2030-06-30' } })).json()
    await api.post(`/api/core/seasons/${id}/state`, { data: { to: 'published' } })
    if (state === 'archived') await api.post(`/api/core/seasons/${id}/state`, { data: { to: 'archived' } })
  }
  await api.dispose()
  await visit(page, '/console/programme/productions?settings=core.productions&screen=/admin/modules/core/seasons')
  const window = page.getByRole('dialog')
  await expect(window.getByText(`Now ${stamp}`)).toBeVisible()
  await expect(window.getByText(`Old ${stamp}`)).toBeHidden()
  await window.getByRole('button', { name: /^Archived \(\d+\)$/ }).click()
  await expect(window.getByText(`Old ${stamp}`)).toBeVisible()
  await noViolations(page)

  // The search opens from its icon and narrows the list.
  await window.getByRole('button', { name: 'Search seasons' }).click()
  await window.getByRole('searchbox', { name: 'Search seasons' }).fill(`Now ${stamp}`)
  await expect(window.getByText(`Old ${stamp}`)).toHaveCount(0)

  // Archiving says so with an Undo, which puts the season back.
  await window.getByRole('button', { name: `Actions for Now ${stamp}` }).click()
  await page.getByRole('menuitem', { name: 'Archive' }).click()
  // The toast sits outside the window, which hides the rest of the page from the accessibility tree.
  await page.locator('button', { hasText: 'Undo' }).click()
  await expect(page.locator('li', { hasText: 'Undone' }).first()).toBeVisible()
  await window.getByRole('searchbox', { name: 'Search seasons' }).fill('')
  await window.getByRole('searchbox', { name: 'Search seasons' }).blur()
  await expect(window.getByRole('list', { name: 'Seasons' }).getByText(`Now ${stamp}`)).toBeVisible()
})
