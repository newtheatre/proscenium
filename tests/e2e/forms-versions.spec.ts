// Version history (screen 9): each published version is listed with what changed, opens as it was
// published, and an earlier one is made the draft again with Undo.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const author = { kind: 'person', accountId: 'acc_formsauthor', name: 'Ada Author', assurance: 'strong', reassertedAt: Date.now(), grants: ['forms.form.create', 'forms.form.edit', 'forms.form.publish'].map(grant) }
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
test.use({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(author) }, viewport: { width: 1280, height: 900 } })

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

test('published versions are listed, read as they were, and one is made the draft again', async ({ page }) => {
  await visit(page, '/console/forms')
  await page.getByRole('button', { name: 'New form' }).first().click()
  await page.getByRole('textbox', { name: /^Title/ }).fill(`Sign-up ${run}`)
  await page.getByRole('button', { name: 'Create form' }).click()
  await page.waitForURL(/\/console\/forms\/frm_/)
  const builder = new URL(page.url()).pathname
  await page.getByRole('button', { name: 'Add a question', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Short text', exact: true }).click()
  await page.getByLabel('Question', { exact: true }).fill('Your name?')
  await saved(page)
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.getByRole('button', { name: 'Publish version 1' }).click()
  await page.getByRole('dialog', { name: 'Share' }).getByRole('button', { name: 'Close' }).first().click()

  // A second version adds a question.
  await page.getByRole('button', { name: 'Add a question', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Yes or no', exact: true }).click()
  await page.getByLabel('Question', { exact: true }).fill('Have you been before?')
  await saved(page)
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.getByRole('button', { name: 'Publish version 2' }).click()
  await expect(page.getByText('Version 2 is published', { exact: false }).first()).toBeVisible()

  // ---- the history ----
  // History is a tab of the form, beside Build and Responses.
  await page.getByRole('navigation', { name: 'Parts of this form' }).getByRole('link', { name: 'History' }).click()
  await page.waitForURL(/\/versions$/)
  const list = page.getByRole('list', { name: 'Version history' })
  await expect(list.getByText('Version 2', { exact: true })).toBeVisible()
  await expect(list.getByText('Live', { exact: true })).toHaveCount(1)
  await expect(list.getByText(/0 responses · 1 question changed/)).toBeVisible()
  await expect(list.getByText(/the first version/)).toBeVisible()
  await axe(page)

  // Version 2 says what changed; version 1 reads as it was, with one question.
  await page.getByRole('link', { name: /^Version 2/ }).click()
  const panel = page.getByRole('dialog', { name: 'Version 2' })
  await expect(panel.getByText('Have you been before?').first()).toBeVisible()
  await expect(panel.getByText('New question')).toBeVisible()
  await axe(page)
  await panel.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('link', { name: /^Version 1/ }).click()
  const first = page.getByRole('dialog', { name: 'Version 1' })
  await expect(first.getByLabel('Your name?')).toBeVisible()
  await expect(first.getByText('Have you been before?')).toHaveCount(0)

  // ---- it becomes the draft again; nothing is published by that ----
  await first.getByRole('button', { name: 'Make this the draft' }).click()
  await expect(page.getByText('Version 1 is now the draft', { exact: true })).toBeVisible()
  await visit(page, builder)
  await expect(page.getByText('Your name?').first()).toBeVisible()
  await expect(page.getByText('Have you been before?')).toHaveCount(0)
  await expect(page.getByText('Version 2', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Not shared yet').first()).toBeVisible()
})
