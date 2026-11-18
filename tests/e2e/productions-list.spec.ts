// The productions list and "New production": the list says when each production is on and where,
// and a new production starts in the season on now (or the next to come), and says it was created.
import { test, expect, type Page } from '@playwright/test'

const grant = (ability: string) => ({ ability, via: 'test' })
const producer = { kind: 'person', accountId: 'acc_listproducer', name: 'Lee Producer', assurance: 'strong', reassertedAt: Date.now(), grants: ['core.production.view', 'core.production.create', 'core.production.edit', 'core.season.manage'].map(grant) }
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })

let seasonName = ''
test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(producer) })
  const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  seasonName = `Season now ${RUN}`
  const year = new Date().getFullYear()
  await api.post('/api/core/seasons', { data: { name: seasonName, startsOn: `${year - 1}-01-01`, endsOn: `${year + 1}-12-31` } })
  await api.dispose()
})
test.use(as(producer))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

test('the list shows dates, the next performance and the space, and a new production starts in a season', async ({ page }) => {
  await visit(page, '/console/programme/productions')
  for (const heading of ['Dates', 'Next performance', 'Space', 'State']) await expect(page.getByRole('columnheader', { name: heading })).toBeVisible()

  await page.getByRole('button', { name: 'New production' }).click()
  const panel = page.getByRole('dialog', { name: 'New production' })
  await panel.getByRole('textbox', { name: /^Title/ }).fill(`The Seasoned Play ${Date.now().toString(36)}`)
  // Some season covering today is chosen for it; it can be changed.
  await expect(panel.getByRole('combobox', { name: /^Season/ })).not.toHaveText('No season')
  await panel.getByRole('button', { name: 'Create production' }).click()
  await expect(page.getByText('Production created', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/console\/programme\/productions\/.+/)
})
