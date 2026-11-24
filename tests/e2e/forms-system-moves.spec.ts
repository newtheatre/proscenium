// System moves (FB-514): somebody who may mark lets the system make a move when its condition holds,
// and a response that meets it arrives already moved on, with nobody's name on the move.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const marker = { kind: 'person', accountId: 'acc_formsmarker', name: 'Mia Marker', assurance: 'strong', reassertedAt: Date.now(), grants: ['forms.form.create', 'forms.form.edit', 'forms.form.publish', 'forms.form.mark', 'forms.response.read', 'forms.response.move', 'forms.response.decide'].map(grant) }
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const member = { kind: 'person', accountId: `acc_systemmember${run}`, name: 'Mo Member', assurance: 'strong', reassertedAt: Date.now(), grants: [] }
test.use({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(marker) }, viewport: { width: 1280, height: 900 } })

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
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))))
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test('a response that meets a system move\'s condition arrives already moved on', async ({ page, browser }) => {
  await visit(page, '/console/forms')
  await page.getByRole('button', { name: 'New form' }).first().click()
  await page.getByRole('textbox', { name: /^Title/ }).fill(`Crew sign-up ${run}`)
  await page.getByRole('button', { name: 'Create form' }).click()
  await page.waitForURL(/\/console\/forms\/frm_/)
  await page.getByRole('button', { name: 'Add a question', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Short text', exact: true }).click()
  await page.getByLabel('Question', { exact: true }).fill('Your name')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Stages' }).click()
  const stages = page.getByRole('dialog', { name: 'Stages' })
  await stages.getByRole('button', { name: 'Add review stages' }).click()

  // Move 1, Received to In review, becomes the system's: it needs a condition first.
  await stages.getByRole('combobox', { name: 'Who makes move 1' }).click()
  await page.getByRole('option', { name: 'The system', exact: true }).click()
  await expect(stages.getByText('An automatic move needs a condition, so it is made only when that holds.')).toBeVisible()
  await stages.getByRole('button', { name: 'Add a condition' }).click()
  await expect(stages.getByRole('button', { name: 'Question to look at' })).toHaveText('Your name')
  await stages.getByRole('combobox', { name: 'Comparison' }).click()
  await page.getByRole('option', { name: 'is answered' }).click()
  await expect(stages.getByText('An automatic move needs a condition, so it is made only when that holds.')).toHaveCount(0)
  await axe(page)
  await page.screenshot({ path: test.info().outputPath('system-move.png') })
  await stages.getByRole('button', { name: 'Close' }).last().click()
  await expect(page.getByRole('button', { name: '0 problems' })).toBeVisible()

  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.getByRole('button', { name: 'Publish version 1' }).click()
  const share = page.getByRole('dialog', { name: 'Share' })
  await expect(share.getByLabel('Address')).toHaveValue(/\/forms\//)
  const address = new URL(await share.getByLabel('Address').inputValue()).pathname
  const builder = new URL(page.url()).pathname

  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: { 'x-test-actor': JSON.stringify(member) } })
  const mine = await context.newPage()
  await visit(mine, address)
  await mine.getByLabel('Your name').fill('Mo')
  await mine.getByRole('button', { name: 'Send' }).click()
  await expect(mine.getByText(/Your reference is/)).toBeVisible()
  const reference = (await mine.getByText(/Your reference is/).innerText()).match(/is ([A-Z0-9-]+)\./)![1]!

  await visit(page, `${builder}/responses`)
  await page.getByRole('button', { name: `Open response ${reference}` }).click()
  const panel = page.getByRole('dialog', { name: `Response ${reference}` })
  await expect(panel.getByText(/Start review: now In review/)).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Approve' })).toBeVisible()
})
