// Identity's My account screens (identity spec part 6, ID-11 to ID-16) in a real browser: each is an
// entry on the overview, renders inside the public shell with its trail, and passes axe. The test
// sign-in has no session, so the screens that read the session show their error state here; their
// behaviour is covered by the server's integration tests.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (name: string, grants: ReturnType<typeof grant>[]) => ({ kind: 'person', accountId: `acc_${name.toLowerCase().replace(/\W/g, '')}`, name, grants })
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const siteOwner = () => ({ ...person('Privacy Owner', [grant('core.settings.manage'), grant('core.identity-settings.manage')]), assurance: 'strong', reassertedAt: Date.now() })

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(siteOwner()) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: { count: 10000, per: '1m' } }] } })
  await api.dispose()
})

async function visit(page: Page, url: string) {
  const response = await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  return response
}

async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test.describe('My account', () => {
  test.use(as(person('Mo Account', [])))

  test('lists identity\'s screens as entries', async ({ page }) => {
    await visit(page, '/account')
    for (const [name, href] of [
      ['Your details', '/account/details'],
      ['Email addresses', '/account/email'],
      ['Signing in', '/account/sign-in'],
      ['Where you are signed in', '/account/sessions'],
      ['Your data', '/account/data'],
    ]) await expect(page.getByRole('link', { name }).first()).toHaveAttribute('href', href)
  })

  for (const [path, title] of [
    ['/account/details', 'Your details'],
    ['/account/email', 'Email addresses'],
    ['/account/sign-in', 'Signing in'],
    ['/account/sessions', 'Where you are signed in'],
    ['/account/data', 'Your data'],
  ]) {
    test(`${path} renders under My account and has no violations`, async ({ page }) => {
      await visit(page, path!)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(page.getByRole('link', { name: 'My account' }).first()).toBeVisible()
      await noViolations(page)
    })
  }

  test('the forms carry their labels', async ({ page }) => {
    await visit(page, '/account/details')
    await expect(page.getByLabel('Your name')).toBeVisible()
    await expect(page.getByLabel('Pronouns')).toBeVisible()
    await visit(page, '/account/email')
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send the link' })).toBeVisible()
  })

  test('Your data offers nothing until the theatre names its privacy contact, then offers both', async ({ page, playwright }) => {
    await visit(page, '/account/data')
    await expect(page.getByText('Downloads and erasure are not available yet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Make a download' })).toBeHidden()

    const owner = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(siteOwner()) })
    const set = (value: unknown) => owner.put('/api/core/settings', { data: { changes: [value] } })
    expect((await set({ key: 'core.privacy.contact', value: 'privacy@example.org' })).ok()).toBe(true)
    try {
      await visit(page, '/account/data')
      await expect(page.getByRole('button', { name: 'Make a download' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Erase my account' })).toBeVisible()
      await noViolations(page)
    }
    finally {
      await set({ key: 'core.privacy.contact', reset: true })
      await owner.dispose()
    }
  })
})
