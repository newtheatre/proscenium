// The browser tier: the built Worker, served by wrangler, in Chromium, checked with axe.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('the home page renders from content and quotes a setting', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome' })).toBeVisible()
  await expect(page.locator('[data-setting]')).toHaveText('GBP')
})

test('the home page has no accessibility violations', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations).toEqual([])
})

test('an unknown page is a 404', async ({ page }) => {
  const response = await page.goto('/no-such-page')
  expect(response?.status()).toBe(404)
})

test('the health endpoint answers', async ({ request }) => {
  const response = await request.get('/api/core/health')
  expect(response.ok()).toBe(true)
  expect(await response.json()).toMatchObject({ status: 'ok' })
})

test.describe('in dark mode on a phone', () => {
  test.use({ colorScheme: 'dark', viewport: { width: 390, height: 844 } })

  test('the home page has no accessibility violations', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveClass(/dark/)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations).toEqual([])
  })
})

test('the skip link moves to the page content', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
})
