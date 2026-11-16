// Identity's screens in the browser: they render on a fresh site and pass axe, light and dark.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test('the sign-in page offers a passkey first', async ({ page }) => {
  await page.goto('/sign-in')
  await expect(page.getByText('Sign in', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible()
})

test('a Google refusal is explained on the sign-in page', async ({ page }) => {
  await page.goto('/sign-in?error=core.sign-in.provider-domain')
  await expect(page.getByRole('alert')).toContainText('not from an organisation that can sign in here')
})

test('first-run setup asks for the first Owner', async ({ page }) => {
  await page.goto('/setup')
  await expect(page.getByLabel('Your name')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Make my passkey' })).toBeVisible()
})

for (const path of ['/sign-in', '/setup', '/sign-in/confirm']) {
  test(`${path} has no accessibility violations`, async ({ page }) => {
    await page.goto(path)
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([])
  })
}

test.describe('in dark mode on a phone', () => {
  test.use({ colorScheme: 'dark', viewport: { width: 390, height: 844 } })

  test('the sign-in page has no accessibility violations', async ({ page }) => {
    await page.goto('/sign-in')
    await expect(page.locator('html')).toHaveClass(/dark/)
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([])
  })
})
