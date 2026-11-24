// Training's console sessions (training-records part 5, K3 and K4): a draft session found on the list,
// published, a person given a place, and the session cancelled with a reason, each screen passing axe.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const stamp = Date.now()
const manager = { kind: 'person', accountId: `acc_trainingsessions_${stamp}`, name: 'Sol Sessions', assurance: 'strong', reassertedAt: stamp, grants: ['core.settings.manage', 'core.modules.manage', 'core.account.create', 'training.course.manage', 'training.course.view', 'training.session.manage', 'training.session.run', 'training.place.manage'].map(grant) }
const as = (actor: object) => ({ 'x-test-actor': JSON.stringify(actor) })
const course = `Fly floor ${stamp}`
const learner = `Priya Sessiontest ${stamp}`

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
  const send = async (method: 'put' | 'post', url: string, data: object) => {
    const response = await api[method](url, { data, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(response.ok(), `${url}: ${await response.text()}`).toBe(true)
    return response.json()
  }
  await send('put', '/api/core/settings', { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }, { key: 'core.rate-limits.default', value: { count: 10000, per: '1m' } }], confirm: true })
  await send('put', '/api/core/modules/training', { on: true })
  const { courseId } = await send('post', '/api/training/courses', { title: course, expires: false })
  await send('put', `/api/training/courses/${courseId}/steps`, { steps: [{ kind: 'session', title: 'Come to a session' }] })
  await send('post', `/api/training/courses/${courseId}/publish`, {})
  const startsAt = stamp + 3 * 86_400_000
  await send('post', `/api/training/courses/${courseId}/sessions`, { startsAt, endsAt: startsAt + 2 * 3_600_000, capacity: 4, placeNote: 'Meet at stage door' })
  await send('post', '/api/core/accounts', { name: learner, address: `priya.${stamp}@example.org` })
  await api.dispose()
})

test.describe('as a session manager', () => {
  test.use({ extraHTTPHeaders: as(manager) })

  test('publishes a session, gives a place and cancels it', async ({ page }) => {
    await visit(page, '/console/training/sessions')
    await expect(page.getByRole('heading', { name: 'Sessions', level: 1 })).toBeVisible()
    await noViolations(page)

    await page.getByRole('button', { name: 'New session' }).click()
    await expect(page.getByRole('dialog', { name: 'New session' })).toBeVisible()
    await noViolations(page)
    await page.getByRole('button', { name: 'Cancel' }).click()

    await page.getByRole('row', { name: new RegExp(course) }).getByRole('link').click()
    await expect(page.getByRole('heading', { name: course, level: 1 })).toBeVisible()
    await expect(page.getByText('Meet at stage door')).toBeVisible()
    await noViolations(page)

    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByText('Session published', { exact: true }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Add a person' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a person' })
    await dialog.getByRole('button', { name: /^Person/ }).click()
    await page.getByPlaceholder('Name or full email address').fill(learner)
    await page.getByRole('option', { name: new RegExp(learner) }).click()
    await noViolations(page)
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText(`${learner} has a place`).first()).toBeVisible()
    await expect(page.getByRole('main').getByText(learner)).toBeVisible()
    await noViolations(page)

    await page.getByRole('tab', { name: 'Waiting list' }).click()
    await expect(page.getByText('Nobody is waiting')).toBeVisible()

    await page.getByRole('button', { name: `More actions for ${course}` }).click()
    await page.getByRole('menuitem', { name: 'Cancel session' }).click()
    const cancel = page.getByRole('dialog')
    await expect(cancel.getByText('1 with a place and 0 waiting will be told, with your reason.')).toBeVisible()
    await noViolations(page)
    await cancel.getByLabel('Reason').fill('The trainer is unwell')
    await cancel.getByRole('button', { name: 'Cancel session' }).click()
    await expect(page.getByText('Session cancelled', { exact: true }).first()).toBeVisible()
    await page.getByRole('tab', { name: 'Places' }).click()
    await expect(page.getByText('This session is cancelled')).toBeVisible()
    await expect(page.getByText('The trainer is unwell')).toBeVisible()
  })
})
