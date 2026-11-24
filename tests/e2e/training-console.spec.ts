// Training's console for a course manager (training-records part 5, K1 and K2): a course made from
// the list, its steps written in the step editor, published, and its tabs, each screen passing axe.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const stamp = Date.now()
const manager = { kind: 'person', accountId: `acc_trainingconsole_${stamp}`, name: 'Morgan Manager', assurance: 'strong', reassertedAt: stamp, grants: ['core.settings.manage', 'core.modules.manage', 'training.course.manage', 'training.course.view', 'training.session.manage'].map(grant) }
const as = (actor: object) => ({ 'x-test-actor': JSON.stringify(actor) })
const title = `Sound desk ${stamp}`

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

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', extraHTTPHeaders: as(manager) })
  for (const [url, data] of [['/api/core/settings', { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }, { key: 'core.rate-limits.default', value: { count: 10000, per: '1m' } }], confirm: true }], ['/api/core/modules/training', { on: true }]] as const) {
    const response = await api.put(url, { data, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(response.ok(), `${url}: ${await response.text()}`).toBe(true)
  }
  await api.dispose()
})

test.describe('as a course manager', () => {
  test.use({ extraHTTPHeaders: as(manager) })

  async function addStep(page: Page, kind: string, name: string) {
    await page.getByRole('button', { name: 'Add a step' }).click()
    await page.getByRole('combobox', { name: 'Kind' }).click()
    await page.getByRole('option', { name: kind }).click()
    await page.getByRole('dialog').getByLabel('Title').fill(name)
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText(name)).toBeVisible()
  }

  test('makes a course, writes its steps and publishes it', async ({ page }) => {
    await visit(page, '/console/training/courses')
    await expect(page.getByRole('heading', { name: 'Courses', level: 1 })).toBeVisible()
    await noViolations(page)

    await page.getByRole('button', { name: 'New course' }).click()
    await page.getByRole('dialog').getByLabel('Title').fill(title)
    await noViolations(page)
    await page.getByRole('button', { name: 'Create course' }).click()
    await expect(page).toHaveURL(/\/console\/training\/courses\/tcrs_/)
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
    await expect(page.getByText('No steps yet')).toBeVisible()
    await noViolations(page)

    await visit(page, `${new URL(page.url()).pathname}/steps`)
    await expect(page.getByRole('heading', { name: 'Steps of version 1', level: 1 })).toBeVisible()
    await addStep(page, 'Shown to a trainer', 'Run a show from the desk')
    await addStep(page, 'Reading', 'Read the desk guide')
    await noViolations(page)
    await page.getByRole('button', { name: 'Save steps' }).click()
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
    await expect(page.getByText('1. Run a show from the desk')).toBeVisible()

    await page.getByRole('button', { name: 'Publish' }).click()
    await noViolations(page)
    await page.getByRole('button', { name: 'Publish version 1' }).click()
    await expect(page.getByText('Version 1 published', { exact: true })).toBeVisible()
    await expect(page.getByText('Live', { exact: true }).first()).toBeVisible()

    await page.getByRole('tab', { name: 'Trainers' }).click()
    await expect(page.getByText('No trainers yet')).toBeVisible()
    await noViolations(page)

    await visit(page, '/console/training/courses')
    await expect(page.getByRole('link', { name: new RegExp(title) }).first()).toBeVisible()
  })
})
