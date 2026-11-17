// The programme calendar (C-13) in a real browser: month, week, day and list views show a performance
// and a closure, a show after midnight sits on the evening before, each view has no accessibility
// violations in light and dark, and a phone gets the list.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const manager = {
  kind: 'person',
  accountId: 'acc_calendarmanager',
  name: 'Cal Endar',
  assurance: 'strong',
  reassertedAt: Date.now(),
  grants: ['core.production.view', 'core.production.create', 'core.performance.schedule', 'core.venue.manage', 'core.closure.manage'].map(grant),
}
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const MONTH = '2031-03'
let productionId = ''
let venueId = ''

test.beforeAll(async ({ playwright }) => {
  const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const owner = { kind: 'person', accountId: 'acc_calendarowner', name: 'Calendar Owner', assurance: 'strong', reassertedAt: Date.now(), grants: [grant('core.settings.manage')] }
  const settings = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(owner) })
  await settings.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }] } })
  expect((await settings.put('/api/core/settings', { data: { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }], confirm: true } })).ok()).toBe(true)
  await settings.dispose()
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(manager) })
  const production = await (await api.post('/api/core/productions', { data: { title: `The Calendar Play ${RUN}`, kind: 'own' } })).json()
  productionId = production.id
  const venue = await (await api.post('/api/core/venues', { data: { name: `Calendar Hall ${RUN}` } })).json()
  venueId = venue.venueId
  for (const startsAt of ['2031-03-14T19:30:00Z', '2031-03-15T00:30:00Z']) {
    const added = await api.post(`/api/core/productions/${productionId}/performances`, { data: { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: Date.parse(startsAt), endsAt: Date.parse(startsAt) + 3_600_000 } })
    expect(added.ok(), await added.text()).toBe(true)
  }
  expect((await api.post('/api/core/closures', { data: { venueId: venue.venueId, title: 'Deep clean', allDay: true, from: '2031-03-20', to: '2031-03-21' } })).ok()).toBe(true)
  await api.dispose()
})
test.use(as(manager))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}
const blocks = (page: Page) => page.getByRole('link', { name: /The Calendar Play/ })

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`the calendar, ${scheme}`, () => {
    test.use({ colorScheme: scheme })

    test('the month shows both shows on the 14th and the closure over two days', async ({ page }) => {
      await visit(page, `/console/programme/calendar?venue=${venueId}&day=${MONTH}-10`)
      await expect(page.getByRole('heading', { name: 'March 2031' })).toBeVisible()
      await expect(blocks(page)).toHaveCount(2)
      await expect(page.getByText(/Deep clean/).filter({ visible: true })).toHaveCount(2)
      await noViolations(page)
    })

    test('the day view puts the 00:30 show on the evening before, in its space', async ({ page }) => {
      await visit(page, `/console/programme/calendar?venue=${venueId}&view=day&day=${MONTH}-14`)
      const both = blocks(page)
      await expect(both).toHaveCount(2)
      await expect(both.nth(1)).toContainText('00:30')
      await expect(both.first()).toContainText('Draft')
      await noViolations(page)
      await visit(page, `/console/programme/calendar?venue=${venueId}&view=day&day=${MONTH}-15`)
      await expect(blocks(page)).toHaveCount(0)
    })

    test('the week and the list hold the same items', async ({ page }) => {
      await visit(page, `/console/programme/calendar?venue=${venueId}&view=week&day=${MONTH}-14`)
      await expect(blocks(page)).toHaveCount(2)
      await noViolations(page)
      await visit(page, `/console/programme/calendar?venue=${venueId}&view=list&day=${MONTH}-10`)
      await expect(blocks(page)).toHaveCount(2)
      await noViolations(page)
      await page.screenshot({ path: `test-results/calendar-list-${scheme}.png`, fullPage: true })
    })
  })
}

test('a phone gets the list for the month, and a block opens its production', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await visit(page, `/console/programme/calendar?venue=${venueId}&day=${MONTH}-10`)
  await expect(page.getByRole('heading', { name: /14 Mar 2031/ })).toBeVisible()
  await blocks(page).first().click()
  await expect(page).toHaveURL(new RegExp(`/console/programme/productions/${productionId}`))
})
