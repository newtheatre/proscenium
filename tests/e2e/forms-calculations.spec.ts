// Calculations (FB-104): the Show proposal template's total has a name, reads as money and sits on
// the budget page; a calculation is added and its formula built from rows in the builder.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const author = { kind: 'person', accountId: 'acc_formsauthor', name: 'Ada Author', assurance: 'strong', reassertedAt: Date.now(), grants: ['forms.form.create', 'forms.form.edit', 'forms.form.publish'].map(grant) }
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
test.use({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(author) }, viewport: { width: 1440, height: 900 } })

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

test('the proposal\'s total reads as money on its page, and a calculation is built from rows', async ({ page }) => {
  await visit(page, '/console/forms')
  await page.getByRole('button', { name: 'New form' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New form' })
  await dialog.getByRole('textbox', { name: /^Title/ }).fill(`Proposals ${run}`)
  await dialog.getByRole('combobox', { name: 'Start from' }).click()
  await page.getByRole('option', { name: 'Show proposal' }).click()
  await dialog.getByRole('button', { name: 'Create form' }).click()
  await page.waitForURL(/\/console\/forms\/frm_/)
  await expect(page.getByRole('button', { name: '0 problems' })).toBeVisible()

  // ---- the total, in the outline and on the budget page ----
  const outline = page.getByRole('navigation', { name: 'Pages, endings and calculations' })
  await outline.getByRole('button', { name: 'Total budget', exact: true }).click()
  const card = page.locator('[data-calculation="total"]')
  await expect(card).toContainText('Total budget')
  await expect(card).toContainText('= Performing rights + Set and props + Costume + Anything else')
  const details = page.getByRole('complementary', { name: 'Details' })
  await expect(details.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Total budget')
  await expect(details.getByRole('switch', { name: 'Count a blank answer as nothing' })).toBeChecked()
  await axe(page)

  // ---- a new one: the share of the budget that goes on the set ----
  await page.getByRole('button', { name: 'Add a question', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Calculation', exact: true }).click()
  await expect(page.getByRole('button', { name: '1 problem' })).toBeVisible()
  await details.getByRole('textbox', { name: 'Name', exact: true }).fill('Set share')
  await details.getByRole('combobox', { name: 'Shown as' }).click()
  await page.getByRole('option', { name: 'A percentage' }).click()
  await details.getByRole('combobox', { name: 'What it reads' }).click()
  await page.getByRole('option', { name: 'The answer to a question' }).click()
  await details.getByRole('combobox', { name: 'The answer to a question' }).click()
  await page.getByRole('option', { name: 'Set and props' }).click()
  await details.getByRole('button', { name: 'Add to the formula' }).click()
  const second = details.locator('[data-formula-row="1"]')
  await second.getByRole('combobox', { name: 'How it joins the line before' }).click()
  await page.getByRole('option', { name: /divide by/ }).click()
  await second.getByRole('combobox', { name: 'What it reads' }).click()
  await page.getByRole('option', { name: 'Another calculation' }).click()
  await expect(details.locator('[data-formula-sentence]')).toHaveText('= Set and props ÷ Total budget')
  await expect(page.getByRole('button', { name: '0 problems' })).toBeVisible()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // ---- answered in the preview: each on its own page, worked out as the answers change ----
  await page.getByRole('button', { name: 'Preview' }).click()
  await page.getByRole('textbox', { name: /What is the show called/ }).fill('Posh')
  await page.getByRole('textbox', { name: /Tell us about it/ }).fill('A play about a dining club.')
  // The builder's own cards are still in the page, hidden; only what the preview shows counts.
  await expect(page.locator('[data-calculation]:visible')).toHaveCount(0)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Add another' }).click()
  await page.getByRole('textbox', { name: /^Name/ }).fill('Ada')
  await page.getByRole('textbox', { name: /^Role/ }).fill('Director')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('spinbutton', { name: 'Performing rights' }).fill('150')
  await page.getByRole('spinbutton', { name: 'Set and props' }).fill('330')
  await page.getByRole('spinbutton', { name: 'Costume' }).click()
  const total = page.locator('[data-calculation="total"]:visible')
  await expect(total).toContainText('Total budget')
  await expect(total).toContainText('£480.00')
  await expect(page.locator('[data-calculation]:visible').filter({ hasText: 'Set share' })).toContainText('68.8%')
  await axe(page)
})
