// The emailed link for sending changes (R-19). The link's token reaches only the email, so the whole
// journey is covered by the integration tests (layers/forms/tests/integration/changes.test.ts);
// here, a link that does not work says so plainly, signed out, and the page is accessible.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

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

test('a link for changes that does not work says so, and what to do instead', async ({ page }) => {
  await visit(page, '/forms/changes/not-a-real-token')
  await expect(page.getByText('This link no longer works')).toBeVisible()
  await expect(page.getByText(/reply to the email the theatre sent you/)).toBeVisible()
  await axe(page)
})
