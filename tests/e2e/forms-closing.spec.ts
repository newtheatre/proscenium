// Slice 7 (docs/specs/form-builder): a form is closed and archived from the builder with Undo, and
// one move is made on several responses at once from the table.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const author = { kind: 'person', accountId: 'acc_formsauthor', name: 'Ada Author', assurance: 'strong', reassertedAt: Date.now(), grants: ['forms.form.create', 'forms.form.edit', 'forms.form.publish', 'forms.response.read', 'forms.response.move', 'forms.response.decide'].map(grant) }
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
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

test('several responses take one move, and the form is closed, archived and brought back', async ({ page, browser, baseURL }) => {
  await visit(page, '/console/forms')
  await page.getByRole('button', { name: 'New form' }).first().click()
  await page.getByRole('textbox', { name: /^Title/ }).fill(`Volunteer sign-up ${run}`)
  await page.getByRole('button', { name: 'Create form' }).click()
  await page.waitForURL(/\/console\/forms\/frm_/)
  await page.getByRole('button', { name: 'Add a question', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Short text', exact: true }).click()
  await page.getByLabel('Question', { exact: true }).fill('Your name?')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Stages' }).click()
  const stages = page.getByRole('dialog', { name: 'Stages' })
  await stages.getByRole('button', { name: 'Add review stages' }).click()
  await stages.getByRole('button', { name: 'Close' }).last().click()
  await expect(page.locator('[aria-live=polite]').filter({ hasText: /^\s*Saved\s*$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.getByRole('button', { name: 'Publish version 1' }).click()
  const share = page.getByRole('dialog', { name: 'Share' })
  await expect(share.getByLabel('Address')).toHaveValue(/\/forms\//)
  const address = new URL(await share.getByLabel('Address').inputValue()).pathname
  const builder = new URL(page.url()).pathname
  await share.getByRole('button', { name: 'Share the form' }).click()
  await expect(page.getByText('The form is shared', { exact: true })).toBeVisible()

  // ---- three people answer ----
  for (const n of [1, 2, 3]) {
    const who = { kind: 'person', accountId: `acc_closing${run}${n}`, name: `Member ${n}`, assurance: 'strong', reassertedAt: Date.now(), grants: [] }
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'x-test-actor': JSON.stringify(who) } })
    const mine = await context.newPage()
    await visit(mine, address)
    await mine.getByLabel('Your name?').fill(`Member ${n}`)
    await mine.getByRole('button', { name: 'Send' }).click()
    await expect(mine.getByText(/Your reference is/)).toBeVisible()
    await context.close()
  }

  // ---- one move on two of them ----
  await visit(page, `${builder}/responses`)
  const table = page.getByRole('table', { name: 'Responses' })
  await expect(table.getByRole('cell', { name: 'Received', exact: true })).toHaveCount(3)
  const boxes = table.getByRole('checkbox', { name: /^Choose response / })
  await boxes.nth(0).click()
  await boxes.nth(1).click()
  const bar = page.getByRole('group', { name: '2 chosen' })
  await expect(bar).toBeVisible()
  await axe(page)
  await bar.getByRole('button', { name: 'Start review' }).click()
  const confirm = page.getByRole('dialog', { name: 'Start review' })
  await expect(confirm.getByText('2 responses move to In review.')).toBeVisible()
  await confirm.getByRole('button', { name: 'Start review' }).click()
  await expect(page.getByText('2 responses are now In review', { exact: true })).toBeVisible()
  await expect(table.getByRole('cell', { name: 'In review', exact: true })).toHaveCount(2)
  // Rows in different stages share no move.
  await table.getByRole('checkbox', { name: 'Choose every response on this page' }).click()
  await expect(page.getByText('Choose responses in the same stage to move them together.')).toBeVisible()

  // ---- the form is closed, then archiving waits for the responses ----
  await visit(page, builder)
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Close the form' }).click()
  await expect(page.getByText('The form is closed', { exact: true })).toBeVisible()
  await expect(page.getByText('Closed', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('menu')).toHaveCount(0)
  await axe(page)
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Archive the form' }).click()
  await expect(page.getByText('3 responses are still waiting on somebody.', { exact: true })).toBeVisible()
  // It can be opened again.
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Open the form again' }).click()
  await expect(page.getByText('The form is taking responses', { exact: true })).toBeVisible()
})
