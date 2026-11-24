// Programme planning's first slice in a real browser (PP-01, PP-02): start a season's plan from the
// Programme list, add an entry to the tray, and bring a draft production onto the board.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const owner = { kind: 'person', accountId: 'acc_e2eowner', name: 'Browser Tests', assurance: 'strong', reassertedAt: Date.now(), grants: ['core.modules.manage', 'core.settings.manage'].map(grant) }
const programmer = { kind: 'person', accountId: 'acc_planprogrammer', name: 'Pat Programmer', assurance: 'strong', reassertedAt: Date.now(), grants: ['programme-planning.plan.manage', 'core.production.view', 'core.production.create', 'core.season.manage'].map(grant) }
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const seasonName = `Planning ${RUN}`
const draftTitle = `Draft Play ${RUN}`

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ playwright }) => {
  const admin = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(owner) })
  const zone = await admin.put('/api/core/settings', { data: { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }], confirm: true } })
  expect(zone.status(), await zone.text()).toBe(200)
  const on = await admin.put('/api/core/modules/programme-planning', { data: { on: true } })
  expect(on.status(), await on.text()).toBe(200)
  await admin.dispose()
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(programmer) })
  const season = await api.post('/api/core/seasons', { data: { name: seasonName, startsOn: '2034-01-01', endsOn: '2034-06-30' } })
  expect(season.status(), await season.text()).toBe(200)
  const seasonId = (await season.json()).id as string
  const made = await api.post('/api/core/productions', { data: { title: draftTitle, kind: 'own', seasonId } })
  expect(made.status(), await made.text()).toBe(200)
  await api.dispose()
})
test.use(as(programmer))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
const noViolations = async (page: Page) => {
  await page.mouse.move(0, 0)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test('a programmer starts a plan, adds an entry and brings a draft production onto the board', async ({ page }) => {
  await visit(page, '/console/programme')
  await page.getByRole('button', { name: `Start a plan for ${seasonName}` }).click()
  await expect(page.getByRole('heading', { name: seasonName })).toBeVisible()
  await expect(page.getByText('Nothing waiting')).toBeVisible()
  await noViolations(page)

  await page.getByRole('button', { name: 'Add an entry' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Add an entry' }).click()
  await expect(dialog.getByText('This is needed.')).toBeVisible()
  await dialog.getByLabel('Working title').fill('Brass Quintet')
  await dialog.getByRole('button', { name: 'Add an entry' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Brass Quintet', { exact: true })).toBeVisible()
  await expect(page.getByText('To decide · No running time · 0 of 1 placed')).toBeVisible()

  await page.getByRole('button', { name: 'Bring a production' }).click()
  const bringing = page.getByRole('dialog')
  await bringing.getByRole('button', { name: 'Production', exact: true }).click()
  await page.getByRole('option', { name: draftTitle }).click()
  await bringing.getByRole('button', { name: 'Bring a production' }).click()
  await expect(bringing).toBeHidden()
  const rows = page.getByRole('list').filter({ hasText: 'Brass Quintet' }).getByRole('listitem')
  await expect(rows.first()).toContainText(draftTitle)
  await expect(rows.nth(1)).toContainText('Brass Quintet')
  await noViolations(page)

  await visit(page, '/console/programme')
  await expect(page.getByRole('link', { name: new RegExp(seasonName) })).toContainText('0 of 1 placed · 1 to decide')
})
