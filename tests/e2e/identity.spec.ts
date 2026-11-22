// Identity's screens in the browser: they render on a fresh site and pass axe, light and dark.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test('the sign-in page asks for an email address first, offers only ways in that work, with a passkey as another way', async ({ page }) => {
  const owner = { 'x-test-actor': JSON.stringify({ kind: 'person', accountId: 'acc_keyholder', name: 'Key Holder', grants: [{ ability: 'core.identity-settings.manage', via: 'test' }], assurance: 'strong', reassertedAt: Date.now() }) }
  const saveBotCheck = (value: string | null) => page.request.post('/api/core/credentials', { headers: owner, data: { keys: { CORE_TURNSTILE_SECRET_KEY: value } } })
  // Without the bot check's secret no code can be sent, and no provider is set up: only the passkey.
  await page.goto('/sign-in')
  const passkey = page.getByRole('button', { name: 'Sign in with a passkey' })
  await expect(passkey).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Email address' })).toHaveCount(0)
  expect((await saveBotCheck('0x4AAAAAAAe2e-identity-check')).ok()).toBe(true)
  try {
    await page.goto('/sign-in')
    await expect(page.getByText('Sign in', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Email address' })).toBeVisible()
    const carryOn = page.getByRole('button', { name: 'Continue' })
    await expect(carryOn).toBeVisible()
    // The address comes first; the code and any provider are offered once it is given.
    expect((await carryOn.boundingBox())!.y).toBeLessThan((await passkey.boundingBox())!.y)
    await expect(page.getByRole('button', { name: 'Email me a code' })).toHaveCount(0)
  }
  finally {
    await saveBotCheck(null)
  }
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
  await expect(page.getByLabel('Contact email address')).toHaveValue('')
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

test('opening an emailed link in a browser that did not ask spends nothing until Sign in is pressed', async ({ page }) => {
  const asked: { here?: boolean }[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/core/sign-in/link') asked.push(request.postDataJSON())
  })
  // The shape of a real token (43 characters), so the refusal is the unknown link, not the input check.
  const answered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/core/sign-in/link')
  await page.goto(`/sign-in/link#${'x'.repeat(43)}`)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  // The page asks once whether this is the browser that asked; the answer is the press and nothing is spent (12).
  const first = await answered
  expect(first.status()).toBe(200)
  expect(await first.json()).toEqual({ press: true })
  expect(asked.map(a => a.here)).toEqual([true])
  const signIn = page.getByRole('button', { name: 'Sign in' })
  await expect(signIn).toBeEnabled()
  expect(page.url()).not.toContain('#')
  const results = await new AxeBuilder({ page }).withTags(tags).analyze()
  expect(results.violations.map(v => v.id)).toEqual([])
  await signIn.click()
  await expect(page.getByRole('alert')).toContainText('This link is not valid.')
  expect(asked.map(a => a.here)).toEqual([true, undefined])
})

for (const [path, endpoint, button] of [
  ['/sign-in/verify-address', '/api/core/me/addresses/verify', 'Confirm address'],
  ['/sign-in/confirm-erasure', '/api/core/me/data-requests/confirm', 'Confirm erasure'],
]) {
  test(`opening ${path} uses nothing until ${button} is pressed`, async ({ page }) => {
    const used: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === endpoint) used.push(request.url())
    })
    await page.goto(`${path}#not-a-real-token`)
    await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
    await expect(page.getByRole('button', { name: button })).toBeVisible()
    expect(used).toEqual([])
    await page.getByRole('button', { name: button }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    expect(used).toHaveLength(1)
  })
}
