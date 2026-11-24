// The rota grid (FH-48) in a real browser: a template applied to two picked nights makes a batch that
// shows in the grid, a shift's right-click menu offers copy and cancel, and no accessibility violations.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const manager = {
  kind: 'person',
  accountId: 'acc_rotagrid',
  name: 'Rory Grid',
  assurance: 'strong',
  reassertedAt: Date.now(),
  grants: ['core.settings.manage', 'core.modules.manage', 'core.venue.manage', 'front-of-house.duty.manage', 'front-of-house.shift.manage', 'front-of-house.shift.view'].map(grant),
}
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const stamp = Date.now() % 1_000_000
const s = { venueId: '', venue: `Grid hall ${stamp}`, template: `Grid night ${stamp}` }
const FROM = '2031-05-04'

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(manager) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }] } })
  expect((await api.put('/api/core/settings', { data: { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }], confirm: true } })).ok()).toBe(true)
  for (const id of ['front-of-house']) {
    const on = await api.put(`/api/core/modules/${id}`, { data: { on: true } })
    expect(on.ok(), `${id}: ${await on.text()}`).toBe(true)
  }
  const send = async (path: string, data: unknown) => {
    const response = await api.post(path, { data, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
    return response.json()
  }
  s.venueId = (await send('/api/core/venues', { name: s.venue })).venueId
  const duty = (await send('/api/front-of-house/duties', { name: `Steward ${stamp}`, callBeforeMinutes: 60, stayAfterMinutes: 30 })).dutyId
  await send('/api/front-of-house/rota-templates', { name: s.template, lines: [{ dutyId: duty, places: 3 }] })
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

test('a template applied to two picked nights shows in the grid, and a shift offers copy and cancel', async ({ page }) => {
  await visit(page, `/console/front-of-house/grid?venue=${s.venueId}&from=${FROM}&to=2031-05-10`)
  await noViolations(page)
  const pick = (day: string) => page.getByRole('button', { name: new RegExp(`^Pick ${s.venue}, ${day}$`) })
  await pick('Sun,? 4 May 2031').click()
  // The arrow keys move along the venue's line to the next night.
  await pick('Sun,? 4 May 2031').press('ArrowRight')
  await expect(pick('Mon,? 5 May 2031')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText('2 cells picked')).toBeVisible()
  await page.getByRole('button', { name: 'Apply a template' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^Rota template/ }).click()
  await page.getByRole('option', { name: s.template }).click()
  await dialog.getByRole('textbox', { name: 'Title' }).fill('Festival hub')
  await noViolations(page)
  if (process.env.GRID_SHOTS) await page.screenshot({ path: `${process.env.GRID_SHOTS}/grid-apply.png` })
  await dialog.getByRole('button', { name: 'Apply a template' }).click()
  await expect(page.getByText('2 draft shifts made', { exact: true })).toBeVisible()
  const shifts = page.getByRole('link', { name: /^Steward .*, 0 of 3, Draft$/ })
  await expect(shifts).toHaveCount(2)
  await noViolations(page)
  if (process.env.GRID_SHOTS) await page.screenshot({ path: `${process.env.GRID_SHOTS}/grid.png`, fullPage: true })
  await shifts.first().click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Copy to other days' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Cancel shift' })).toBeVisible()
})

test('on a phone the grid scrolls sideways inside its own box', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await visit(page, `/console/front-of-house/grid?venue=${s.venueId}&from=${FROM}&to=2031-05-10`)
  await expect(page.getByRole('table', { name: 'Rota grid' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  if (process.env.GRID_SHOTS) await page.screenshot({ path: `${process.env.GRID_SHOTS}/grid-phone.png`, fullPage: true })
})
