// My availability (AV-04) in a real browser: drag down a day to paint it, tap where a stretch starts
// and ends with the keyboard, paint a whole day from its heading, and add a change for some dates.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const owner = { kind: 'person', accountId: 'acc_e2eowner', name: 'Browser Tests', assurance: 'strong', reassertedAt: Date.now(), grants: ['core.modules.manage', 'core.settings.manage'].map(ability => ({ ability, via: 'test' })) }
const member = { kind: 'person', accountId: `acc_avail${Date.now() % 1_000_000}`, name: 'Ada Available', assurance: 'strong', reassertedAt: Date.now(), grants: [] }
const output = fileURLToPath(new URL('../../.output', import.meta.url))
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
// A Monday three to four weeks ahead, so every day in view can be painted.
const monday = new Date(Date.now() + (21 + ((8 - new Date().getUTCDay()) % 7)) * 86_400_000).toISOString().slice(0, 10)
const WEEK = `/members/availability?from=${monday}`

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
const noViolations = async (page: Page) => {
  await page.mouse.move(0, 0)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}
const cell = (page: Page, day: string, from: string) => page.getByRole('gridcell', { name: new RegExp(`^${day}.*, ${from} to `) })

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ playwright }) => {
  // A member: an account holding a role that opens the members' area, written as the Admin screens would.
  const id = member.accountId.slice(4)
  const at = Date.now() - 60_000
  const sql = [
    `INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES ('${member.accountId}', '${member.name}', 'self', ${at}, ${at})`,
    `INSERT INTO core_roles (id, key, name, fixed, opens_members_area, needs_managed_identity, expiry_rule, created_at) VALUES ('rol_${id}', 'avail-${id}', 'Availability tests', 0, 1, 0, 'none', ${at})`,
    `INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, granted_by, granted_at) VALUES ('grt_${id}', '${member.accountId}', 'rol_${id}', 'site', ${at}, 'acc_e2eowner', ${at})`,
  ].join('; ')
  execFileSync('bunx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', '../.wrangler/e2e', '--config', 'server/wrangler.json', '--command', sql], { cwd: output, stdio: 'pipe' })
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(owner) })
  const zone = await api.put('/api/core/settings', { data: { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }], confirm: true } })
  expect(zone.status(), await zone.text()).toBe(200)
  const response = await api.put('/api/core/modules/availability', { data: { on: true } })
  expect(response.status(), await response.text()).toBe(200)
  await api.dispose()
})

test.describe('a member', () => {
  test.use(as(member))

  test('paints a stretch by dragging down a day', async ({ page }) => {
    await visit(page, WEEK)
    await expect(page.getByRole('heading', { level: 1, name: 'My availability' })).toBeVisible()
    await page.getByRole('tab', { name: 'Busy' }).click()
    const start = cell(page, 'Tue', '18:00')
    const end = cell(page, 'Tue', '19:30')
    await start.scrollIntoViewIfNeeded()
    await start.hover()
    await page.mouse.down()
    await end.hover()
    await page.mouse.up()
    await expect(cell(page, 'Tue', '19:30')).toHaveAccessibleName(/Busy$/)
    await expect(cell(page, 'Tue', '20:00')).toHaveAccessibleName(/Not known$/)
    await noViolations(page)
  })

  test('paints with the keyboard: Enter where it starts, arrows, Enter where it ends', async ({ page }) => {
    await visit(page, WEEK)
    await page.getByRole('tab', { name: 'Maybe' }).click()
    const start = cell(page, 'Wed', '10:00')
    await start.scrollIntoViewIfNeeded()
    await start.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(cell(page, 'Wed', '10:30')).toHaveAccessibleName(/Maybe$/)
  })

  test('paints a whole day from its heading, and clears part of it', async ({ page }) => {
    await visit(page, WEEK)
    await page.getByRole('tab', { name: 'Free' }).click()
    await page.getByRole('button', { name: /^Paint all of Thu/ }).click()
    await expect(cell(page, 'Thu', '12:00')).toHaveAccessibleName(/Free$/)
    await page.getByRole('tab', { name: 'Clear' }).click()
    await cell(page, 'Thu', '12:00').click()
    await cell(page, 'Thu', '12:00').click()
    await expect(cell(page, 'Thu', '12:00')).toHaveAccessibleName(/Not known$/)
    await expect(cell(page, 'Thu', '12:30')).toHaveAccessibleName(/Free$/)
  })

  test('adds a change for some dates with a shared reason', async ({ page }) => {
    await visit(page, WEEK)
    await page.getByRole('button', { name: 'Add a change' }).click()
    const panel = page.getByRole('dialog', { name: 'Add a change' })
    await panel.getByRole('textbox', { name: 'Reason' }).fill('Exams')
    await panel.getByRole('checkbox', { name: /Share the reason/ }).check()
    await noViolations(page)
    await panel.getByRole('button', { name: 'Save change' }).click()
    await expect(page.getByText('Change saved', { exact: true })).toBeVisible()
    await expect(page.getByRole('list').filter({ hasText: 'Exams' })).toContainText('Reason shared')
  })
})
