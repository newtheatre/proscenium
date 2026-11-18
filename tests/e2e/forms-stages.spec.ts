// Stages (docs/specs/form-builder, slice 4): a form that wants them is given stages in the builder,
// staff move a response on and send it back with a note, the person changes their answers under
// My forms and sends them again, and staff see what changed.
import { test, expect, type Browser, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const author = { kind: 'person', accountId: 'acc_formsauthor', name: 'Ada Author', assurance: 'strong', reassertedAt: Date.now(), grants: ['forms.form.create', 'forms.form.edit', 'forms.form.publish', 'forms.response.read', 'forms.response.move'].map(grant) }
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const member = { kind: 'person', accountId: `acc_stagesmember${run}`, name: 'Mo Member', assurance: 'strong', reassertedAt: Date.now(), grants: [] }
test.use({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(author) }, viewport: { width: 1280, height: 900 } })

test.beforeAll(async ({ playwright, baseURL }) => {
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

test('a response moves through stages, goes back for changes and returns as a new version', async ({ page, browser }) => {
  // ---- the author gives the form stages ----
  await visit(page, '/console/forms')
  await page.getByRole('button', { name: 'New form' }).first().click()
  await page.getByRole('textbox', { name: /^Title/ }).fill(`Show proposals ${run}`)
  await page.getByRole('button', { name: 'Create form' }).click()
  await page.waitForURL(/\/console\/forms\/frm_/)
  await page.getByRole('button', { name: 'Add a question', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Short text', exact: true }).click()
  await page.getByLabel('Question', { exact: true }).fill('Which show?')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Stages' }).click()
  const stages = page.getByRole('dialog', { name: 'Stages' })
  await expect(stages.getByText('This form has no stages.')).toBeVisible()
  await stages.getByRole('button', { name: 'Add review stages' }).click()
  await expect(stages.getByLabel('Name of stage 1')).toHaveValue('Received')
  await expect(stages.getByLabel('Wording of move 2')).toHaveValue('Return for changes')
  await axe(page)

  // A stage with no name is a problem, listed with the rest and shown beside the stage.
  await stages.getByLabel('Name of stage 2').fill('')
  await expect(stages.getByText('Needs a name.')).toBeVisible()
  await stages.getByRole('button', { name: 'Close' }).last().click()
  await expect(page.getByRole('button', { name: '1 problem' })).toBeVisible()
  await page.getByRole('button', { name: '1 problem' }).click()
  await page.getByRole('button', { name: /A stage\s+Needs a name\./ }).click()
  await stages.getByLabel('Name of stage 2').fill('With the committee')
  await stages.getByLabel('What the person is told in stage 2').fill('Being considered')
  await stages.getByRole('button', { name: 'Close' }).last().click()
  await expect(page.getByRole('button', { name: '0 problems' })).toBeVisible()
  await saved(page)

  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.getByRole('button', { name: 'Publish version 1' }).click()
  const share = page.getByRole('dialog', { name: 'Share' })
  await expect(share.getByLabel('Address')).toHaveValue(/\/forms\//)
  const address = new URL(await share.getByLabel('Address').inputValue()).pathname
  const builder = new URL(page.url()).pathname
  await share.getByRole('button', { name: 'Share the form' }).click()
  await expect(page.getByText('The form is shared')).toBeVisible()

  // ---- a member answers ----
  const mine = await as(browser, member)
  await visit(mine, address)
  await mine.getByLabel('Which show?').fill('Hamlet')
  await mine.getByRole('button', { name: 'Send' }).click()
  await expect(mine.getByText(/Your reference is/)).toBeVisible()
  const reference = (await mine.getByText(/Your reference is/).innerText()).match(/is ([A-Z0-9-]+)\./)![1]!

  // ---- staff move it on, then send it back with a note ----
  await visit(page, `${builder}/responses`)
  const table = page.getByRole('table', { name: 'Responses' })
  await expect(table.getByRole('cell', { name: 'Received', exact: true })).toBeVisible()
  await page.getByRole('button', { name: `Open response ${reference}` }).click()
  const panel = page.getByRole('dialog', { name: `Response ${reference}` })
  await panel.getByRole('button', { name: 'Start review' }).click()
  const confirm = page.getByRole('dialog', { name: 'Start review' })
  await expect(confirm.getByText('The response moves to With the committee.')).toBeVisible()
  await confirm.getByRole('button', { name: 'Start review' }).click()
  await expect(panel.getByText('With the committee', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Return for changes' }).click()
  const back = page.getByRole('dialog', { name: 'Return for changes' })
  await back.getByLabel(/^A note to the person who sent it/).fill('Which translation would you use?')
  await axe(page)
  await back.getByRole('button', { name: 'Return for changes' }).click()
  await expect(panel.getByText('They were told: Which translation would you use?')).toBeVisible()
  // Nothing more for staff to do until it comes back.
  await expect(panel.getByRole('button', { name: 'Approve' })).toHaveCount(0)

  // ---- the member changes their answer and sends it again ----
  await visit(mine, '/account/forms')
  await expect(mine.getByText('Returned for changes')).toBeVisible()
  await mine.getByRole('link', { name: new RegExp(`Show proposals ${run}`) }).click()
  await expect(mine.getByText('Which translation would you use?')).toBeVisible()
  await axe(mine)
  await mine.getByRole('button', { name: 'Make changes' }).click()
  await expect(mine.getByLabel('Which show?')).toHaveValue('Hamlet')
  await mine.getByLabel('Which show?').fill('Hamlet, in the Arden text')
  await mine.getByRole('button', { name: 'Send changes' }).click()
  await expect(mine.getByText('Your changes have been sent', { exact: true })).toBeVisible()
  // They are told what the form chose to tell them, not the stage's own name.
  await expect(mine.getByText('Being considered', { exact: true })).toBeVisible()
  await expect(mine.getByRole('button', { name: 'Make changes' })).toHaveCount(0)

  // ---- staff see what changed, compare with the first version, and decide ----
  await visit(page, `${builder}/responses?open=`)
  await page.getByRole('button', { name: `Open response ${reference}` }).click()
  await expect(panel.getByText('Hamlet, in the Arden text')).toBeVisible()
  await expect(panel.getByText('Changed', { exact: true })).toBeVisible()
  await panel.getByRole('combobox', { name: 'Version of the answers' }).click()
  await page.getByRole('option', { name: 'Version 1' }).click()
  await expect(panel.getByText('Hamlet', { exact: true })).toBeVisible()
  await expect(panel.getByText('Changed', { exact: true })).toHaveCount(0)
  await expect(panel.getByText(/Return for changes: now Returned for changes/)).toBeVisible()
  await axe(page)
  await panel.getByRole('button', { name: 'Approve' }).click()
  await page.getByRole('dialog', { name: 'Approve' }).getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText(`${reference} is now Approved`, { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Close' }).click()
  await expect(panel).toBeHidden()

  // The table filters by stage, from the address.
  await page.getByRole('combobox').filter({ hasText: 'Any stage' }).click()
  await page.getByRole('option', { name: 'Declined' }).click()
  await expect(page.getByText('No responses match these filters')).toBeVisible()
  await expect(page).toHaveURL(/stage=declined/)
})
