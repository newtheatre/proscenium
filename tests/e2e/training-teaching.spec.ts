// Training's teaching pages for a trainer (training-records part 5, M7 to M9): a session marked with a
// walk-in and closed, then a practical step signed off, each screen passing axe.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const stamp = Date.now()
const manager = { kind: 'person', accountId: 'acc_trainingteach_manager', name: 'Mo Manager', assurance: 'strong', reassertedAt: stamp, grants: ['core.settings.manage', 'core.modules.manage', 'training.course.manage', 'training.course.view', 'training.session.manage'].map(grant) }
const trainer = { kind: 'person', accountId: `acc_trainingteach_${stamp}`, name: 'Terry Trainer', assurance: 'strong', reassertedAt: stamp, facts: ['core.member'], grants: ['training.course.view', 'training.sign-off.record', 'training.session.run'].map(grant) }
const as = (actor: object) => ({ 'x-test-actor': JSON.stringify(actor) })
const title = `Fly floor ${stamp}`
const walkIn = `Wendy Walkin ${stamp}`
// The session starts a few seconds after it is made, since only a started session can be marked.
const startsAt = stamp + 20_000

async function ok(api: APIRequestContext, method: 'post' | 'put', url: string, data: object) {
  const response = await api[method](url, { data, headers: { 'idempotency-key': crypto.randomUUID() } })
  expect(response.ok(), `${url}: ${await response.text()}`).toBe(true)
  return await response.json()
}

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', extraHTTPHeaders: as(manager) })
  await ok(api, 'put', '/api/core/settings', { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }, { key: 'core.rate-limits.default', value: { count: 10000, per: '1m' } }], confirm: true })
  await ok(api, 'put', '/api/core/modules/training', { on: true })
  const { courseId } = await ok(api, 'post', '/api/training/courses', { title, summary: 'Working the fly floor safely.', expires: false })
  await ok(api, 'put', `/api/training/courses/${courseId}/steps`, { steps: [{ kind: 'session', title: 'Come to a fly floor session' }, { kind: 'practical', title: 'Fly a piece under supervision' }] })
  await ok(api, 'post', `/api/training/courses/${courseId}/publish`, {})
  const { sessionId } = await ok(api, 'post', `/api/training/courses/${courseId}/sessions`, { startsAt, endsAt: startsAt + 3_600_000, capacity: 4 })
  await ok(api, 'post', `/api/training/sessions/${sessionId}/publish`, {})
  await api.dispose()
})

test.describe.serial('as a trainer', () => {
  test.use({ extraHTTPHeaders: as(trainer) })

  test('marks a session with a walk-in and closes its attendance', async ({ page }) => {
    await visit(page, '/members/training/teaching')
    await expect(page.getByRole('heading', { name: 'Teaching', level: 1 })).toBeVisible()
    await expect(page.getByText(title).first()).toBeVisible()
    await noViolations(page)

    await page.waitForTimeout(Math.max(0, startsAt - Date.now() + 1_000))
    await visit(page, '/members/training/teaching')
    await page.getByRole('region', { name: 'Sessions to mark' }).getByRole('link', { name: new RegExp(title) }).click()
    await expect(page.getByText('Nobody has a place. Add whoever came.')).toBeVisible()
    await noViolations(page)

    await page.getByRole('button', { name: 'Add someone' }).click()
    await page.getByRole('radio', { name: 'They have no account' }).check()
    await page.getByLabel('Name').fill(walkIn)
    await noViolations(page)
    await page.getByRole('button', { name: 'Add and mark here' }).click()
    await expect(page.getByText(`${walkIn} added and marked here`, { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Close attendance' }).click()
    await expect(page).toHaveURL(/\/members\/training\/teaching$/)
  })

  test('signs the walk-in off on the practical step', async ({ page }) => {
    await visit(page, '/members/training/teaching/sign-off')
    await expect(page.getByRole('heading', { name: 'Sign someone off', level: 1 })).toBeVisible()
    await page.getByRole('combobox', { name: 'Course' }).click()
    await page.getByRole('option', { name: title }).click()
    await page.getByRole('button', { name: 'Person' }).click()
    await page.getByPlaceholder('Name or full email address').fill(walkIn)
    await page.getByRole('option', { name: new RegExp(walkIn) }).click()
    await page.getByRole('checkbox', { name: /Fly a piece under supervision/ }).check()
    await noViolations(page)
    await page.getByRole('button', { name: `Sign off 1 step for ${walkIn}` }).click()
    await expect(page.getByText(`Signed off 1 step for ${walkIn}`, { exact: true })).toBeVisible()
  })
})
