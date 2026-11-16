// The record page and the home page (UI-12, UI-16) in a real browser, against the gallery build.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (name: string, grants: ReturnType<typeof grant>[]) => ({ kind: 'person', accountId: `acc_${name.toLowerCase().replace(/\W/g, '')}`, name, grants })
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
const noViolations = async (page: Page) => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => v.id)).toEqual([])

test.describe('someone who may view the gallery', () => {
  test.use(as(person('Rita Record', [grant('gallery.sample.view')])))

  test('console home is a queue: the urgent card first, a zero-count card absent', async ({ page }) => {
    await visit(page, '/console')
    const text = await page.getByRole('main').innerText()
    expect(text.indexOf('Overdue')).toBeGreaterThan(-1)
    expect(text.indexOf('Overdue')).toBeLessThan(text.indexOf('Good to know'))
    expect(text).toContain('3 sample drafts are waiting.')
    expect(text).not.toContain('never shows')
    expect(text).not.toContain('Due today')
    await noViolations(page)
  })

  test('the record page has a status with a word, one primary action, a summary strip and tabs', async ({ page }) => {
    await visit(page, '/console/gallery/productions/prod-1')
    await expect(page.getByRole('heading', { level: 1, name: 'Hamlet' })).toBeVisible()
    await expect(page.getByText('On sale')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open the form' })).toBeVisible()
    await expect(page.getByText('Seats sold')).toBeVisible()
    await expect(page.getByText('Overview of prod-1.')).toBeVisible()
    await page.getByRole('tab', { name: 'Details' }).click()
    await expect(page.getByText('Details of prod-1.')).toBeVisible()
    await expect(page.getByText('Seats sold')).toBeVisible() // the summary stays as tabs change
    await page.getByRole('tab', { name: /Tickets/ }).click()
    await expect(page.getByTestId('gallery-tickets-tab')).toContainText('prod-1')
    await noViolations(page)
  })

  test('the history panel says when the person may not see it', async ({ page }) => {
    await visit(page, '/console/gallery/productions/prod-1')
    await page.getByRole('button', { name: 'History', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('not available to you')
  })
})

test.describe('someone with the history ability', () => {
  test.use(as(person('Hana History', [grant('gallery.sample.view'), grant('core.history.view')])))

  test('sees the history panel, empty when nothing has changed', async ({ page }) => {
    await visit(page, '/console/gallery/productions/prod-9')
    await page.getByRole('button', { name: 'History', exact: true }).click()
    await expect(page.getByText('Nothing has changed yet')).toBeVisible()
  })
})
