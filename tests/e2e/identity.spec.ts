// Identity's screens in the browser: they render on a fresh site and pass axe, light and dark.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test('the sign-in page asks for an email address first, with a passkey as another way', async ({ page }) => {
  await page.goto('/sign-in')
  await expect(page.getByText('Sign in', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Email address' })).toBeVisible()
  const link = page.getByRole('button', { name: 'Email me a link' })
  const passkey = page.getByRole('button', { name: 'Sign in with a passkey' })
  await expect(link).toBeVisible()
  await expect(passkey).toBeVisible()
  // The emailed link comes first.
  expect((await link.boundingBox())!.y).toBeLessThan((await passkey.boundingBox())!.y)
})

test('a Google refusal is explained on the sign-in page', async ({ page }) => {
  await page.goto('/sign-in?error=core.sign-in.provider-domain')
  await expect(page.getByRole('alert')).toContainText('not from an organisation that can sign in here')
})

test('first-run setup asks for the first Owner, then the theatre and its time zone', async ({ page }) => {
  await page.goto('/setup')
  await expect(page.getByLabel('Your name')).toBeVisible()
  // Type once the page is live: what is typed into the server's page before then is not kept.
  await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled()
  await page.getByLabel('Your name').fill('Olive Owner')
  await page.getByLabel('Your email address').fill('olive@example.org')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByLabel('The theatre\'s name')).toBeVisible()
  await expect(page.getByText('Time zone', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Contact email address')).toHaveValue('olive@example.org')
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

test('the built Worker takes its own origin from the request, so a same-site change is allowed', async ({ request, baseURL }) => {
  const same = await request.post('/api/core/sign-in/passkey/options', { data: {}, headers: { origin: baseURL! } })
  expect(same.status()).toBe(200)
  expect((await same.json()).options.rpId).toBe(new URL(baseURL!).hostname)
  const other = await request.post('/api/core/sign-in/passkey/options', { data: {}, headers: { origin: 'https://elsewhere.example' } })
  expect(other.status()).toBe(403)
})
