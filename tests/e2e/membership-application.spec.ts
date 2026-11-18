// Applying with a scheme's application form (MEM-03, MEM-12, MEM-16): the scheme's page in Admin
// attaches the form, My membership sends the applicant to the scheme's join page, where the form is
// answered below the length, and sending it leaves an application waiting for the theatre's decision.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const stamp = Date.now()
const admin = { kind: 'person', accountId: 'acc_applyadmin', name: 'Ada Admin', assurance: 'strong', reassertedAt: stamp, grants: ['core.settings.manage', 'core.modules.manage', 'membership.scheme.view', 'membership.scheme.manage', 'forms.form.create', 'forms.form.edit', 'forms.form.publish'].map(grant) }
const member = { kind: 'person', accountId: `acc_apply_${stamp}`, name: 'Ap Plicant', assurance: 'strong', reassertedAt: stamp, grants: [] }
const as = (actor: object) => ({ 'x-test-actor': JSON.stringify(actor) })
const key = () => ({ 'idempotency-key': crypto.randomUUID() })

async function ok(api: APIRequestContext, method: 'post' | 'put' | 'patch' | 'get', url: string, data?: object) {
  const response = await api[method](url, { data, headers: method === 'post' ? key() : {} })
  expect(response.ok(), `${url}: ${await response.text()}`).toBe(true)
  return await response.json()
}

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
async function axe(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))))
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}
// Screenshots for a review go to test-results when SCREENSHOTS is set.
async function shot(page: Page, name: string) {
  if (process.env.SCREENSHOTS) await page.locator('main').screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' })
}

const workflow = {
  stages: [
    { key: 'received', name: 'Received', kind: 'pending' },
    { key: 'in_review', name: 'With the committee', kind: 'in_review' },
    { key: 'approved', name: 'Approved', kind: 'approved' },
    { key: 'declined', name: 'Declined', kind: 'declined' },
  ],
  transitions: [
    { key: 'start_review', from: 'received', to: 'in_review', label: 'Start review', who: 'staff' },
    { key: 'approve', from: 'in_review', to: 'approved', label: 'Approve', who: 'staff' },
    { key: 'decline', from: 'in_review', to: 'declined', label: 'Decline', who: 'staff' },
  ],
}
const definition = { format: 1, pages: [{ id: 'page-1', title: 'About you', items: [{ kind: 'question', id: 'why', key: 'why', type: 'text.long', label: 'Why do you want to join?', dataClass: 'free-text', required: true }] }], workflow }

let schemeId = ''
let schemeKey = ''
test.beforeAll(async ({ playwright, baseURL }) => {
  const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: as(admin) })
  await ok(api, 'put', '/api/core/settings', { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }], confirm: true })
  await ok(api, 'put', '/api/core/modules/membership', { on: true })
  schemeKey = `committee-${stamp}`
  ;({ schemeId } = await ok(api, 'post', '/api/membership/schemes', { name: `Committee ${stamp}`, key: schemeKey, side: 'members', lengthRule: 'rolling', needsApproval: true }))
  await ok(api, 'post', `/api/membership/schemes/${schemeId}/options`, { name: '1 year', count: 12 })
  const { formId } = await ok(api, 'post', '/api/forms/forms', { title: `Joining the committee ${stamp}` })
  await ok(api, 'patch', `/api/forms/forms/${formId}`, { retentionDays: 365 })
  const { draft } = await ok(api, 'get', `/api/forms/forms/${formId}`)
  const saved = await ok(api, 'put', `/api/forms/forms/${formId}/draft`, { definition, editRevision: draft.editRevision })
  await ok(api, 'post', `/api/forms/forms/${formId}/publish`, { editRevision: saved.editRevision })
  await ok(api, 'put', `/api/forms/slots/membership.application/${schemeId}/${formId}`, { audience: 'signed_in', opensAt: null, closesAt: null, responseCap: null, onePerPerson: false, status: 'active' })
  await ok(api, 'post', `/api/membership/schemes/${schemeId}/state`, { to: 'open' })
  await api.dispose()
})

test('the scheme\'s page shows its application form under its own heading', async ({ page }) => {
  await page.setExtraHTTPHeaders(as(admin))
  await page.setViewportSize({ width: 1280, height: 900 })
  await visit(page, `/admin/modules/membership/schemes/${schemeId}`)
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Application form' }) })
  await expect(section.getByText(`Joining the committee ${stamp}`)).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Approve applicants' })).toBeChecked()
  await shot(page, 'scheme-application-form')
})

test('an applicant answers the form on the join page and waits for the theatre', async ({ page }) => {
  await page.setExtraHTTPHeaders(as(member))
  await page.setViewportSize({ width: 1280, height: 900 })
  await visit(page, '/account/membership')
  await page.getByRole('link', { name: `Apply to join Committee ${stamp}` }).click()
  await page.waitForURL(`**/join/${schemeKey}`)
  await expect(page.getByText('Why do you want to join?')).toBeVisible()
  await shot(page, 'join-with-form')
  await axe(page)
  // The form is checked before anything is sent.
  await page.getByRole('button', { name: `Join Committee ${stamp}` }).click()
  await expect(page.getByLabel('Why do you want to join?')).toHaveAttribute('aria-invalid', 'true')
  await page.getByLabel('Why do you want to join?').fill('I want to help run the theatre.')
  await page.getByRole('button', { name: `Join Committee ${stamp}` }).click()
  await expect(page.getByText('Waiting for the theatre to look at your application.').first()).toBeVisible()
  await shot(page, 'join-waiting-approval')
})
