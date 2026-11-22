// Sources (docs/specs/form-builder, slice 6): a "record from a source" question is given a source
// in the builder and is answered by searching it.
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

test('a question chooses from a source, and the preview searches it', async ({ page }) => {
  await visit(page, '/console/forms')
  await page.getByRole('button', { name: 'New form' }).first().click()
  await page.getByRole('textbox', { name: /^Title/ }).fill(`Venue hire ${run}`)
  await page.getByRole('button', { name: 'Create form' }).click()
  await page.waitForURL(/\/console\/forms\/frm_/)
  await page.getByRole('button', { name: 'Add a question', exact: true }).click()
  await page.getByRole('menuitem', { name: 'From our records', exact: true }).click()
  await page.getByLabel('Question', { exact: true }).fill('Which venue?')
  // Until it has a source it is a problem.
  await expect(page.getByRole('button', { name: '1 problem' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Chosen from' }).click()
  await expect(page.getByRole('option', { name: 'People' })).toBeVisible()
  await page.getByRole('option', { name: 'Venues' }).click()
  await expect(page.getByRole('button', { name: '0 problems' })).toBeVisible()
  // Only a question of people can be marked as naming those involved.
  await expect(page.getByRole('switch', { name: 'These people are involved' })).toHaveCount(0)
  await saved(page)
  await axe(page)

  await page.getByRole('button', { name: 'Preview' }).click()
  const answer = page.getByRole('button', { name: 'Which venue?' })
  await expect(answer).toBeVisible()
  await answer.click()
  await expect(page.getByText('Type 2 letters or more.')).toBeVisible()
  await page.getByPlaceholder('Type a name').fill('zzzz')
  await expect(page.getByText('Nothing matches.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Nothing matches.')).toBeHidden()
  await axe(page)
})
