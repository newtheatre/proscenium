// Training's console competencies and evidence (training-records part 5, K8 and K9): a competency made,
// given a route in the routes editor and made active, and a sent certificate verified, each screen passing axe.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const stamp = Date.now()
const manager = { kind: 'person', accountId: `acc_trainingcompetency_${stamp}`, name: 'Cam Competent', assurance: 'strong', reassertedAt: stamp, grants: ['core.settings.manage', 'core.modules.manage', 'core.account.create', 'training.course.manage', 'training.course.view', 'training.competency.manage', 'training.evidence.verify'].map(grant) }
const as = (actor: object) => ({ 'x-test-actor': JSON.stringify(actor) })
const course = `Fire safety ${stamp}`
const certificate = `First aid ${stamp}`
const competency = `Fire marshal ${stamp}`
const learner = `Lee Evidence ${stamp}`

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
  const context = (actor: object) => playwright.request.newContext({ baseURL: 'http://localhost:8788', extraHTTPHeaders: as(actor) })
  const api = await context(manager)
  const send = async (on: typeof api, method: 'put' | 'post', url: string, data: object) => {
    const response = await on[method](url, { data, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(response.ok(), `${url}: ${await response.text()}`).toBe(true)
    return response.json()
  }
  await send(api, 'put', '/api/core/settings', { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }, { key: 'core.rate-limits.default', value: { count: 10000, per: '1m' } }], confirm: true })
  await send(api, 'put', '/api/core/modules/training', { on: true })
  const live = async (title: string, steps: object[]) => {
    const { courseId } = await send(api, 'post', '/api/training/courses', { title, expires: false })
    const { stepIds } = await send(api, 'put', `/api/training/courses/${courseId}/steps`, { steps })
    await send(api, 'post', `/api/training/courses/${courseId}/publish`, {})
    return { courseId, stepId: stepIds[0] as string }
  }
  await live(course, [{ kind: 'session', title: 'Come to a session' }])
  const aid = await live(certificate, [{ kind: 'certificate', title: 'Send a first aid certificate', evidenceExpiry: 'required', evidenceFile: 'optional' }])
  const { id } = await send(api, 'post', '/api/core/accounts', { name: learner, address: `lee.${stamp}@example.org` })
  const person = await context({ kind: 'person', accountId: id, name: learner, assurance: 'strong', reassertedAt: stamp, grants: [grant('training.course.view')] })
  await send(person, 'post', `/api/training/courses/${aid.courseId}/evidence`, { stepId: aid.stepId, issuer: 'St John Ambulance', issuedOn: '2026-01-10', expiresOn: '2029-01-10' })
  await api.dispose()
  await person.dispose()
})

test.describe('as a competency manager and verifier', () => {
  test.use({ extraHTTPHeaders: as(manager) })

  test('makes a competency, gives it a route and makes it active', async ({ page }) => {
    await visit(page, '/console/training/competencies')
    await expect(page.getByRole('heading', { name: 'Competencies', level: 1 })).toBeVisible()
    await noViolations(page)

    await page.getByRole('button', { name: 'New competency' }).click()
    await page.getByRole('dialog').getByLabel('Title').fill(competency)
    await noViolations(page)
    await page.getByRole('button', { name: 'Create competency' }).click()
    await expect(page.getByRole('heading', { name: competency, level: 1 })).toBeVisible()
    await expect(page.getByText('No routes yet')).toBeVisible()
    await noViolations(page)

    await page.getByRole('button', { name: 'Edit routes' }).click()
    await expect(page.getByRole('heading', { name: 'Routes', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Add a route' }).click()
    const dialog = page.getByRole('dialog', { name: 'New route' })
    await dialog.getByLabel('Name').fill('Our course')
    await dialog.getByRole('button', { name: /^What it needs/ }).click()
    await page.getByRole('option', { name: course }).click()
    await expect(dialog.getByRole('button', { name: `Remove ${course}` })).toBeVisible()
    await noViolations(page)
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('main').getByText(course, { exact: true })).toBeVisible()
    await noViolations(page)
    await page.getByRole('button', { name: 'Save routes' }).click()
    await expect(page.getByRole('heading', { name: competency, level: 1 })).toBeVisible()
    await expect(page.getByText('1. Our course')).toBeVisible()

    await page.getByRole('button', { name: `More actions for ${competency}` }).click()
    await page.getByRole('menuitem', { name: 'Make active' }).click()
    await expect(page.getByText('Competency active', { exact: true }).first()).toBeVisible()
  })

  test('verifies a certificate from the queue', async ({ page }) => {
    await visit(page, '/console/training/evidence')
    await expect(page.getByRole('heading', { name: 'Evidence to check', level: 1 })).toBeVisible()
    await noViolations(page)
    await page.getByRole('button', { name: `Check ${learner}'s evidence` }).click()
    const panel = page.getByRole('dialog', { name: `${learner}'s certificate` })
    await expect(panel.getByText('St John Ambulance')).toBeVisible()
    await noViolations(page)
    await panel.getByRole('button', { name: 'Verify' }).click()
    await expect(page.getByText(`${learner}'s evidence verified`).first()).toBeVisible()
    await expect(page.getByRole('button', { name: `Check ${learner}'s evidence` })).toHaveCount(0)
  })
})
