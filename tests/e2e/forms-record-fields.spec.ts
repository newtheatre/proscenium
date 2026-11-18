// Custom fields (FB-503): a set of fields is built in record mode, attached for every record of a
// type, and filled in on a record's own page, where it is still there on coming back.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const author = { kind: 'person', accountId: 'acc_formsauthor', name: 'Ada Author', assurance: 'strong', reassertedAt: Date.now(), grants: ['forms.form.create', 'forms.form.edit', 'forms.form.publish', 'gallery.sample.view', 'gallery.sample.manage'].map(grant) }
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

test('custom fields are built, attached for every record and filled in on one', async ({ page }) => {
  const record = `/console/gallery/productions/prod-${run}?tab=fields`
  await visit(page, record)
  const attached = page.getByRole('list', { name: 'Custom fields attached here' })

  // ---- a new set of fields opens in the builder, with no link and no stages ----
  // The template the gallery ships for this slot is offered first and chosen; this test starts blank.
  await page.getByRole('button', { name: 'New set of fields' }).click()
  const dialog = page.getByRole('dialog', { name: 'New set of fields' })
  await expect(dialog.getByRole('combobox', { name: 'Start from' })).toHaveText(/Show details/)
  await expect(dialog.getByText(/Running time and whether there is an interval\. 2 questions\./)).toBeVisible()
  await axe(page)
  await dialog.getByRole('combobox', { name: 'Start from' }).click()
  await page.getByRole('option', { name: 'A blank set of fields' }).click()
  await dialog.getByRole('button', { name: 'Create the set' }).click()
  await page.waitForURL(/\/console\/forms\/frm_/)
  const builder = new URL(page.url()).pathname
  await expect(page.getByText('Custom fields', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Add a question', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Short text', exact: true }).click()
  await page.getByLabel('Question', { exact: true }).fill(`Director ${run}`)
  await expect(page.locator('[aria-live=polite]').filter({ hasText: /^\s*Saved\s*$/ })).toBeVisible()
  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('menuitem', { name: 'Stages' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'Share' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.getByRole('button', { name: 'Publish version 1' }).click()
  await expect(page.getByText('Attach these fields where they belong, and they appear on every record there.', { exact: true })).toBeVisible()

  // ---- attached, they appear on the record and are filled in there ----
  await visit(page, record)
  await page.getByLabel('Attach a set of fields').click()
  await page.getByRole('option', { name: 'Details of a show' }).last().click()
  await expect(page.getByText('The fields are attached', { exact: true })).toBeVisible()
  await visit(page, record)
  const question = page.getByLabel(`Director ${run}`)
  await expect(question).toBeVisible()
  await axe(page)
  await question.fill('Ana Ng')
  const set = page.getByRole('region', { name: 'Details of a show' }).filter({ has: question })
  await set.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Details of a show saved', { exact: true })).toBeVisible()
  await expect(set.getByText(/^Last saved /)).toBeVisible()

  // Still there on coming back, and another record has its own.
  await visit(page, record)
  await expect(page.getByLabel(`Director ${run}`)).toHaveValue('Ana Ng')
  await visit(page, `/console/gallery/productions/other-${run}?tab=fields`)
  await expect(page.getByLabel(`Director ${run}`)).toHaveValue('')

  // ---- taken away, they are gone from the record ----
  const row = attached.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Edit the fields of Details of a show' }).and(page.locator(`[href="${builder}"]`)) })
  await row.getByRole('button', { name: 'Take away Details of a show' }).click()
  await expect(page.getByText('The fields were taken away', { exact: true })).toBeVisible()
  await visit(page, record)
  await expect(page.getByLabel(`Director ${run}`)).toHaveCount(0)
})
