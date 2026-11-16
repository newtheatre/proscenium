// Lists in a real browser (UI-11): built-in views as tabs, the Filters panel's kinds, rows that open.
// Runs against the gallery build's "Sample shows", which reads its address with the shared codec.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const staff = { kind: 'person', accountId: 'acc_lena', name: 'Lena Lists', grants: [grant('gallery.sample.view')] }

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
const noViolations = async (page: Page) => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => v.id)).toEqual([])

test.describe('a list with views and rows that open', () => {
  test.use({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(staff) } })

  test('the default view shows its own filter as a chip, and another view replaces it', async ({ page }) => {
    await visit(page, '/console/gallery/shows')
    await expect(page.getByRole('tab', { name: 'Now and next' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: /Remove the filter State: On sale/ })).toBeVisible()
    await expect(page.getByText('2 in all').first()).toBeVisible()
    await page.getByRole('tab', { name: 'Drafts' }).click()
    await expect(page).toHaveURL(/view=drafts/)
    await expect(page.getByRole('button', { name: /Remove the filter State: Draft/ })).toBeVisible()
    await expect(page.getByText('2 in all').first()).toBeVisible()
    await page.getByRole('tab', { name: 'All' }).click()
    await expect(page.getByText('5 in all').first()).toBeVisible()
    await noViolations(page)
  })

  test('the Filters panel takes several values, a yes or no, and keeps one history entry for a visit', async ({ page }) => {
    await visit(page, '/console/gallery/shows?view=all')
    const history = await page.evaluate(() => history.length)
    await page.getByRole('button', { name: 'Filters' }).click()
    await page.getByRole('checkbox', { name: 'Draft' }).click()
    await page.getByRole('checkbox', { name: 'Past' }).click()
    await page.getByRole('radio', { name: 'Yes' }).click()
    await expect(page).toHaveURL(/state=draft%2Cpast|state=draft,past/)
    await expect(page).toHaveURL(/listed=yes/)
    await noViolations(page)
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('button', { name: /Remove the filter State: Draft, Past/ })).toBeVisible()
    expect(await page.evaluate(() => history.length)).toBe(history + 1)
    await page.goBack()
    await expect(page).not.toHaveURL(/listed=yes/)
  })

  test('a row opens to show its performances, with the chevron named for the row, and expand all', async ({ page }) => {
    await visit(page, '/console/gallery/shows?view=all')
    const chevron = page.getByRole('button', { name: 'Show performances of Hamlet' })
    await expect(chevron).toHaveAttribute('aria-expanded', 'false')
    await chevron.click()
    await expect(page.getByRole('button', { name: 'Hide performances of Hamlet' })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('2026-11-20 19:30 (1)')).toBeVisible()
    await page.getByRole('button', { name: 'Expand all' }).click()
    await expect(page.getByText('2027-02-10 19:30 (3)')).toBeVisible()
    await page.getByRole('button', { name: 'Collapse all' }).click()
    await expect(page.getByText('2027-02-10 19:30 (3)')).toHaveCount(0)
    await noViolations(page)
  })

  test('the view that opens its rows starts them open', async ({ page }) => {
    await visit(page, '/console/gallery/shows')
    await expect(page.getByText('2026-11-20 19:30 (1)')).toBeVisible()
  })

  test('the server names a key it does not know', async ({ page }) => {
    const response = await page.request.get('/api/gallery/shows?colour=red', { headers: { 'x-test-actor': JSON.stringify(staff) } })
    expect(response.status()).toBe(422)
    expect((await response.json()).fields).toEqual({ colour: 'core.list.unknown' })
  })
})
