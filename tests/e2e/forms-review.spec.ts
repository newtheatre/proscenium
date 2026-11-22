// Review (docs/specs/form-builder, slice 5): a stage asks a panel to vote, each reviewer votes in
// private from their own account, the chair releases the result to the panel and decides with a
// reason that the person who sent the response never sees.
import { test, expect, type Browser, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const someone = (id: string, name: string, grants: string[] = []) => ({ kind: 'person', accountId: `acc_${id}${run}`, name, assurance: 'strong', reassertedAt: Date.now(), grants: grants.map(grant) })
const author = { kind: 'person', accountId: 'acc_formsauthor', name: 'Ada Author', assurance: 'strong', reassertedAt: Date.now(), grants: ['forms.form.create', 'forms.form.edit', 'forms.form.publish', 'forms.response.decide'].map(grant) }
const member = someone('reviewmember', 'Mo Member')
const ann = someone('reviewann', 'Ann Panel')
const ben = someone('reviewben', 'Ben Panel')
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
  // A colour or a closing menu still in motion is not what the page settles to.
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))))
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}
const saved = (page: Page) => expect(page.locator('[aria-live=polite]').filter({ hasText: /^\s*Saved\s*$/ })).toBeVisible()
async function as(browser: Browser, actor: object) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
  return context.newPage()
}

test('a panel votes in private, the chair releases the result and decides with a reason', async ({ page, browser }) => {
  // ---- the author asks for a vote at the review stage ----
  await visit(page, '/console/forms')
  await page.getByRole('button', { name: 'New form' }).first().click()
  await page.getByRole('textbox', { name: /^Title/ }).fill(`Award nominations ${run}`)
  await page.getByRole('button', { name: 'Create form' }).click()
  await page.waitForURL(/\/console\/forms\/frm_/)
  const builder = new URL(page.url()).pathname
  const formId = builder.split('/').pop()!
  await page.getByRole('button', { name: 'Add a question', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Short text', exact: true }).click()
  await page.getByLabel('Question', { exact: true }).fill('Who do you nominate?')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Stages' }).click()
  const stages = page.getByRole('dialog', { name: 'Stages' })
  await stages.getByRole('button', { name: 'Add review stages' }).click()
  await stages.getByRole('combobox', { name: 'Review in stage 2' }).click()
  await page.getByRole('option', { name: 'A vote: for, against or abstain' }).click()
  // A review nobody is asked for is a problem until somebody is.
  await expect(stages.getByText('Nobody is asked to review here.')).toBeVisible()
  await expect(stages.getByLabel('Least number who must vote')).toBeVisible()
  await stages.getByRole('checkbox', { name: /^Ask for a reason/ }).last().check()
  await axe(page)
  await stages.getByRole('button', { name: 'Close' }).last().click()
  await saved(page)

  // The panel is named by account. The test's people have no accounts to search for, so they are
  // written into the draft directly, as an imported form would carry them.
  const got = await (await page.request.get(`/api/forms/forms/${formId}`)).json()
  const definition = got.draft.definition
  definition.workflow.stages[1].review = { mode: 'vote', reviewers: { people: [ann.accountId, ben.accountId] }, pass: 'majority', quorum: 2 }
  expect((await page.request.put(`/api/forms/forms/${formId}/draft`, { data: { definition, editRevision: got.draft.editRevision } })).ok()).toBe(true)
  await visit(page, builder)
  await expect(page.getByRole('button', { name: '0 problems' })).toBeVisible()

  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.getByRole('button', { name: 'Publish version 1' }).click()
  const share = page.getByRole('dialog', { name: 'Share' })
  await expect(share.getByLabel('Address')).toHaveValue(/\/forms\//)
  const address = new URL(await share.getByLabel('Address').inputValue()).pathname
  // Publishing for the first time shared it in the same step.
  await expect(share.getByText('0 responses so far')).toBeVisible()

  // ---- a member sends a nomination, and the chair puts it to the panel ----
  const mine = await as(browser, member)
  await visit(mine, address)
  await mine.getByLabel('Who do you nominate?').fill('Sam Stagehand')
  await mine.getByRole('button', { name: 'Send' }).click()
  await expect(mine.getByText(/Your reference is/)).toBeVisible()
  const reference = (await mine.getByText(/Your reference is/).innerText()).match(/is ([A-Z0-9-]+)\./)![1]!

  await visit(page, `${builder}/responses`)
  await page.getByRole('button', { name: `Open response ${reference}` }).click()
  const panel = page.getByRole('dialog', { name: `Response ${reference}` })
  await panel.getByRole('button', { name: 'Start review' }).click()
  await page.getByRole('dialog', { name: 'Start review' }).getByRole('button', { name: 'Start review' }).click()
  await expect(panel.getByText('0 of 2 have voted.')).toBeVisible()
  await expect(panel.getByText('Each review is private until the reviews are released.')).toBeVisible()

  // ---- each reviewer votes from their own account ----
  const first = await as(browser, ann)
  await visit(first, '/account/forms')
  await expect(first.getByRole('heading', { name: 'To review' })).toBeVisible()
  await expect(first.getByText('Your vote is needed')).toBeVisible()
  await first.getByRole('link', { name: new RegExp(`Award nominations ${run}`) }).click()
  await expect(first.getByText('Sam Stagehand')).toBeVisible()
  // Sending with no vote says so beside the choice.
  await first.getByRole('button', { name: 'Send my review' }).click()
  await expect(first.getByText('Choose for, against or abstain.')).toBeVisible()
  await first.getByRole('radio', { name: 'For', exact: true }).check()
  await first.getByLabel(/^Comment/).fill('Kept the get-in running all year')
  await axe(first)
  await first.getByRole('button', { name: 'Send my review' }).click()
  await expect(first.getByText('Your review is in', { exact: true })).toBeVisible()
  await expect(first.getByText('1 of 2 have voted.')).toBeVisible()
  await expect(first.getByText('Passed', { exact: true })).toHaveCount(0)

  const second = await as(browser, ben)
  await visit(second, '/account/forms')
  await second.getByRole('link', { name: new RegExp(`Award nominations ${run}`) }).click()
  await second.getByRole('radio', { name: 'For', exact: true }).check()
  await second.getByRole('button', { name: 'Send my review' }).click()
  await expect(second.getByText('Your review is in', { exact: true })).toBeVisible()

  // ---- the chair releases the result, and the panel sees the count ----
  await visit(page, `${builder}/responses`)
  await page.getByRole('button', { name: `Open response ${reference}` }).click()
  await expect(panel.getByText('2 of 2 have voted.')).toBeVisible()
  await panel.getByRole('button', { name: 'Release the reviews to the panel' }).click()
  await expect(page.getByText('The reviews are released', { exact: true })).toBeVisible()
  await expect(panel.getByText('Passed', { exact: true })).toBeVisible()
  await expect(panel.getByText('Kept the get-in running all year')).toBeVisible()
  await axe(page)

  await first.reload()
  await expect(first.getByText('Passed', { exact: true })).toBeVisible()
  await expect(first.getByText('The reviews have been released, so yours can no longer be changed.')).toBeVisible()
  await expect(first.getByRole('button', { name: 'Change my review' })).toHaveCount(0)
  await axe(first)

  // ---- the decision: this form asks for a reason when declining ----
  await panel.getByRole('button', { name: 'Decline' }).click()
  const decline = page.getByRole('dialog', { name: 'Decline' })
  await decline.getByRole('button', { name: 'Decline' }).click()
  await expect(decline.getByText('Give a reason for the record.')).toBeVisible()
  await decline.getByLabel(/^Reason for the decision/).fill('Already honoured this year')
  await decline.getByRole('button', { name: 'Decline' }).click()
  await expect(page.getByText(`${reference} is now Declined`, { exact: true })).toBeVisible()
  await expect(panel.getByText('Already honoured this year')).toBeVisible()

  // The person who sent it sees where it ended, and nothing of the review or the reason.
  await visit(mine, '/account/forms')
  await mine.getByRole('link', { name: new RegExp(`Award nominations ${run}`) }).click()
  await expect(mine.getByText('Declined', { exact: true })).toBeVisible()
  await expect(mine.getByText('Already honoured this year')).toHaveCount(0)
  await expect(mine.getByText('Kept the get-in running all year')).toHaveCount(0)
})
