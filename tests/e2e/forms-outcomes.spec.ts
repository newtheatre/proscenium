// Slots and outcome actions (docs/specs/form-builder, slice 6): a move is given something another
// module does next, the published form is attached to that module's record, answered there, and
// the response shows what was asked of the module once it is approved.
import { test, expect, type Browser, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const author = { kind: 'person', accountId: 'acc_formsoutcomes', name: 'Ada Author', assurance: 'strong', reassertedAt: Date.now(), grants: ['forms.form.create', 'forms.form.edit', 'forms.form.publish', 'forms.response.decide', 'gallery.sample.view', 'gallery.sample.manage'].map(grant) }
const member = { kind: 'person', accountId: 'acc_formsoutcomesmember', name: 'Mo Member', assurance: 'strong', reassertedAt: Date.now(), grants: [] }
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
test.use({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(author) }, viewport: { width: 1280, height: 900 } })

test.beforeAll(async ({ playwright, baseURL }) => {
  // A form is checked against today in the theatre's time zone.
  const owner = { kind: 'person', accountId: 'acc_formsowner', name: 'Forms Owner', assurance: 'strong', reassertedAt: Date.now(), grants: [grant('core.settings.manage')] }
  const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { 'x-test-actor': JSON.stringify(owner) } })
  expect((await api.put('/api/core/settings', { data: { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }], confirm: true } })).ok()).toBe(true)
  await api.dispose()
})

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}
const saved = (page: Page) => expect(page.locator('[aria-live=polite]').filter({ hasText: /^\s*Saved\s*$/ })).toBeVisible()
async function as(browser: Browser, actor: object) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
  return context.newPage()
}

test('a form is attached to a record, answered there, and its approval asks the module to act', async ({ page, browser }) => {
  const title = `Show feedback ${run}`

  // ---- the author puts something to do next on the approving move ----
  await visit(page, '/console/forms')
  await page.getByRole('button', { name: 'New form' }).first().click()
  await page.getByRole('textbox', { name: /^Title/ }).fill(title)
  await page.getByRole('button', { name: 'Create form' }).click()
  await page.waitForURL(/\/console\/forms\/frm_/)
  await page.getByRole('button', { name: 'Add a question', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Short text', exact: true }).click()
  await page.getByLabel('Question', { exact: true }).fill('What stood out?')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Stages' }).click()
  const stages = page.getByRole('dialog', { name: 'Stages' })
  await stages.getByRole('button', { name: 'Add review stages' }).click()
  await expect(stages.getByLabel('Wording of move 4')).toHaveValue('Approve')
  await stages.getByRole('button', { name: 'Add something to do after move 4' }).click()
  await page.getByRole('menuitem', { name: 'Note it against the show' }).click()
  await expect(stages.getByText('Then: Note it against the show')).toBeVisible()
  // What it needs has not been given a question yet.
  await expect(stages.getByText(/needs an answer it has not been given/)).toBeVisible()
  await stages.getByRole('combobox', { name: 'What to note' }).click()
  await page.getByRole('option', { name: 'What stood out?' }).click()
  await expect(stages.getByText(/needs an answer it has not been given/)).toHaveCount(0)
  await axe(page)
  await stages.getByRole('button', { name: 'Close' }).last().click()
  await expect(page.getByRole('button', { name: '0 problems' })).toBeVisible()
  await saved(page)
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.getByRole('button', { name: 'Publish version 1' }).click()
  await expect(page.getByRole('dialog', { name: 'Share' })).toBeVisible()
  const builder = new URL(page.url()).pathname

  // ---- it is attached to a show, on the show's own page ----
  await visit(page, `/console/gallery/productions/prod-${run}`)
  await page.getByRole('tab', { name: 'Forms' }).click()
  await expect(page.getByText('No form is attached here yet.')).toBeVisible()
  await page.getByLabel('Attach a form').click()
  await page.getByRole('option', { name: title }).click()
  const terms = page.getByRole('dialog', { name: 'Attach this form' })
  await expect(terms.getByRole('combobox', { name: 'Who can answer' })).toHaveText(/Only people signed in/)
  await axe(page)
  await terms.getByRole('button', { name: 'Attach the form' }).click()
  await expect(page.getByText('The form is attached', { exact: true })).toBeVisible()
  const attached = page.getByRole('list', { name: 'Forms attached here' })
  await expect(attached.getByText(title)).toBeVisible()
  await expect(attached.getByText('Open', { exact: true })).toBeVisible()
  const address = (await attached.getByText(/\/forms\/.+\?place=/).innerText()).trim()
  await axe(page)

  // ---- a member answers it there ----
  const mine = await as(browser, member)
  await visit(mine, new URL(address).pathname + new URL(address).search)
  await mine.getByLabel('What stood out?').fill('The storm scene')
  await mine.getByRole('button', { name: 'Send' }).click()
  await expect(mine.getByText(/Your reference is/)).toBeVisible()
  const reference = (await mine.getByText(/Your reference is/).innerText()).match(/is ([A-Z0-9-]+)\./)![1]!

  // ---- approving it asks the module to act, and the response says so ----
  await visit(page, `${builder}/responses`)
  await page.getByRole('button', { name: `Open response ${reference}` }).click()
  const panel = page.getByRole('dialog', { name: `Response ${reference}` })
  await expect(panel.getByText('Feedback on')).toBeVisible()
  await panel.getByRole('button', { name: 'Start review' }).click()
  await page.getByRole('dialog', { name: 'Start review' }).getByRole('button', { name: 'Start review' }).click()
  await expect(panel.getByText('In review', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Approve' }).click()
  await page.getByRole('dialog', { name: 'Approve' }).getByRole('button', { name: 'Approve' }).click()
  await expect(panel.getByRole('heading', { name: 'What happened next' })).toBeVisible()
  await expect(panel.getByText('Note it against the show')).toBeVisible()
  await expect(panel.getByText(/^(Waiting|Done)$/)).toBeVisible()
  await axe(page)

  // Taken away, nobody can answer it there any more.
  await visit(page, `/console/gallery/productions/prod-${run}`)
  await page.getByRole('tab', { name: 'Forms' }).click()
  await page.getByRole('button', { name: `Take away ${title}` }).click()
  await expect(page.getByText('The form was taken away', { exact: true })).toBeVisible()
  await expect(page.getByText('No form is attached here yet.')).toBeVisible()
})
