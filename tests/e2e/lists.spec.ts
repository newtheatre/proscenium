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

  test('a page can say a line about the answer through the note slot', async ({ page }) => {
    await visit(page, '/console/gallery/shows')
    await expect(page.getByRole('status').filter({ hasText: '2 cancelled shows are not shown.' })).toBeVisible()
  })

  test('the view that opens its rows starts them open', async ({ page }) => {
    await visit(page, '/console/gallery/shows')
    await expect(page.getByText('2026-11-20 19:30 (1)')).toBeVisible()
  })

  test('a column another module adds comes after the owner\'s, with one request for the page', async ({ page }) => {
    const asked: string[] = []
    page.on('request', (r) => { if (r.url().includes('/api/gallery/shows-sales')) asked.push(r.url()) })
    await visit(page, '/console/gallery/shows?view=all')
    await expect(page.getByRole('columnheader', { name: 'Sales' })).toBeVisible()
    await expect(page.getByTestId('show-sales').first()).toHaveText('84 sold')
    expect(await page.getByTestId('show-sales').count()).toBe(5)
    expect(asked.length).toBeLessThanOrEqual(1) // server render fetched it already; the browser asks at most once more
  })

  test('a record page has a trail to its list, which returns the list as it was left', async ({ page }) => {
    await visit(page, '/console/gallery/list?status=draft&sort=seats')
    await visit(page, '/console/gallery/productions/prod-1')
    const trail = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(trail.getByRole('link', { name: 'Sample list' })).toHaveAttribute('href', /status=draft&sort=seats|sort=seats&status=draft/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await page.setViewportSize({ width: 500, height: 800 })
    await expect(page.getByRole('link', { name: 'Back to Sample list' })).toBeVisible()
    await expect(trail).toBeHidden()
    await noViolations(page)
  })

  test('a result that matched in a hidden column says which, and words that are too short are said not to be searched', async ({ page }) => {
    await visit(page, '/console/gallery/shows?view=all&q=studio')
    await expect(page.getByText('Matches Venue: Studio').first()).toBeVisible()
    await visit(page, '/console/gallery/shows?view=all&q=ha')
    await expect(page.getByRole('status').filter({ hasText: 'Nothing was searched' })).toBeVisible()
    await visit(page, '/console/gallery/shows?view=all&q=ham+of')
    await expect(page.getByRole('status').filter({ hasText: 'Words under three letters are not searched: of' })).toBeVisible()
    await noViolations(page)
  })

  test('the server names a key it does not know', async ({ page }) => {
    const response = await page.request.get('/api/gallery/shows?colour=red', { headers: { 'x-test-actor': JSON.stringify(staff) } })
    expect(response.status()).toBe(422)
    expect((await response.json()).fields).toEqual({ colour: 'core.list.unknown' })
  })
})
