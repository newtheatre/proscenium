// Training's members' area for a learner (training-records part 5, M1 to M5): a course found in the
// catalogue, opened, and a place taken on its session, each screen passing axe.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const stamp = Date.now()
const manager = { kind: 'person', accountId: 'acc_trainingscreens_manager', name: 'Tara Trainer', assurance: 'strong', reassertedAt: stamp, grants: ['core.settings.manage', 'core.modules.manage', 'training.course.manage', 'training.course.view', 'training.session.manage'].map(grant) }
const learner = { kind: 'person', accountId: `acc_trainingscreens_${stamp}`, name: 'Lee Learner', assurance: 'strong', reassertedAt: stamp, facts: ['core.member'], grants: ['training.course.view', 'training.place.book'].map(grant) }
const as = (actor: object) => ({ 'x-test-actor': JSON.stringify(actor) })
const title = `Till ${stamp}`

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

let slug = ''
test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', extraHTTPHeaders: as(manager) })
  await ok(api, 'put', '/api/core/settings', { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }, { key: 'core.rate-limits.default', value: { count: 10000, per: '1m' } }], confirm: true })
  for (const id of ['forms', 'occupancy', 'training']) await ok(api, 'put', `/api/core/modules/${id}`, { on: true })
  const { courseId } = await ok(api, 'post', '/api/training/courses', { title, summary: 'Taking payments on the till.', expires: true, validFor: 365 * 86_400 })
  await ok(api, 'put', `/api/training/courses/${courseId}/steps`, { steps: [{ kind: 'session', title: 'Come to a till session' }, { kind: 'reading', title: 'Read the till guide', materialUrl: 'https://example.org/till' }] })
  await ok(api, 'post', `/api/training/courses/${courseId}/publish`, {})
  const startsAt = stamp + 3 * 86_400_000
  const { sessionId } = await ok(api, 'post', `/api/training/courses/${courseId}/sessions`, { startsAt, endsAt: startsAt + 7_200_000, capacity: 4 })
  await ok(api, 'post', `/api/training/sessions/${sessionId}/publish`, {})
  slug = (await (await api.get(`/api/training/courses/${courseId}`)).json()).course.slug
  await api.dispose()
})

test.describe('as a learner', () => {
  test.use({ extraHTTPHeaders: as(learner) })

  test('finds a course, opens it and takes a place on its session', async ({ page }) => {
    await visit(page, '/members/training')
    await expect(page.getByRole('heading', { name: 'Training', level: 1 })).toBeVisible()
    await noViolations(page)

    await visit(page, '/members/training/courses')
    const row = page.getByRole('link', { name: new RegExp(title) })
    await expect(row).toContainText('In person, Online')
    await noViolations(page)

    await row.click()
    await expect(page).toHaveURL(new RegExp(`/members/training/courses/${slug}$`))
    await expect(page.getByText('Read the till guide')).toBeVisible()
    await noViolations(page)

    await page.getByRole('link', { name: 'Sign up for a session' }).first().click()
    await expect(page.getByText('4 places left')).toBeVisible()
    await noViolations(page)
    await page.getByRole('button', { name: 'Sign up' }).click()
    await expect(page.getByText('You have a place').first()).toBeVisible()

    await visit(page, '/members/training')
    await expect(page.getByText(new RegExp(`You are on ${title}`))).toBeVisible()
    await visit(page, '/members/training/mine')
    await expect(page.getByText('No training records yet')).toBeVisible()
    await noViolations(page)
  })
})
