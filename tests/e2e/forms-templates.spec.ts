// Templates (FB-208): a new form starts from a shipped template, is saved as the theatre's own
// template, and a second form starts from that.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const author = { kind: 'person', accountId: 'acc_formsauthor', name: 'Ada Author', assurance: 'strong', reassertedAt: Date.now(), grants: ['forms.form.create', 'forms.form.edit', 'forms.form.publish', 'forms.template.manage'].map(grant) }
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

test('a form starts from a template, becomes a template of its own, and another starts from that', async ({ page }) => {
  const mine = `Our survey ${run}`
  await visit(page, '/console/forms')
  await page.getByRole('button', { name: 'New form' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New form' })
  await dialog.getByRole('textbox', { name: /^Title/ }).fill(`After the show ${run}`)
  await dialog.getByRole('combobox', { name: 'Start from' }).click()
  await page.getByRole('option', { name: 'Feedback survey' }).click()
  await expect(dialog.getByText(/A short survey after a show.*4 questions\./)).toBeVisible()
  await axe(page)
  await dialog.getByRole('button', { name: 'Create form' }).click()
  await page.waitForURL(/\/console\/forms\/frm_/)
  // The template's questions are there, and it is a form with no problems.
  await expect(page.getByText('How was your visit overall?').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '0 problems' })).toBeVisible()

  // ---- saved as the theatre's own ----
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Save as a template' }).click()
  const saving = page.getByRole('dialog', { name: 'Save as a template' })
  await saving.getByLabel('Name of the template').fill(mine)
  await saving.getByLabel('What it is for').fill('How we ask after every show.')
  await axe(page)
  await saving.getByRole('button', { name: 'Save the template' }).click()
  await expect(page.getByText(`Saved as the template ${mine}`, { exact: true })).toBeVisible()

  // ---- and a second form starts from it ----
  await visit(page, '/console/forms')
  await page.getByRole('button', { name: 'New form' }).first().click()
  await dialog.getByRole('textbox', { name: /^Title/ }).fill(`Second survey ${run}`)
  await dialog.getByRole('combobox', { name: 'Start from' }).click()
  await page.getByRole('option', { name: mine }).click()
  await expect(dialog.getByText(/How we ask after every show\. 4 questions\./)).toBeVisible()
  await dialog.getByRole('button', { name: 'Create form' }).click()
  await page.waitForURL(/\/console\/forms\/frm_/)
  await expect(page.getByText('How was your visit overall?').first()).toBeVisible()

  // ---- the template is removed, with Undo ----
  await visit(page, '/console/forms')
  await page.getByRole('button', { name: 'New form' }).first().click()
  await dialog.getByRole('combobox', { name: 'Start from' }).click()
  await page.getByRole('option', { name: mine }).click()
  await dialog.getByRole('button', { name: `Remove the template ${mine}` }).click()
  await expect(page.getByText(`The template ${mine} was removed`, { exact: true })).toBeVisible()
  await dialog.getByRole('combobox', { name: 'Start from' }).click()
  await expect(page.getByRole('option', { name: mine })).toHaveCount(0)
})
