// Site readiness (C-42): until the theatre says the site is ready, every page asks search engines to
// stay away and robots.txt turns them away; the readiness screen lists the starter page with the
// file to edit, and turning search engines away off lets them in, while the starter page itself
// stays out of search results. The Admin overview says when something is unfinished.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (accountId: string, name: string, abilities: string[]) => ({ kind: 'person', accountId, name, assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(grant) })
const owner = person('acc_readyowner', 'Ready Owner', ['core.settings.manage', 'core.modules.manage', 'public-site.site.configure'])
const editor = person('acc_readyeditor', 'Rhian Ready', ['public-site.readiness.view', 'public-site.site.configure'])
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
const noViolations = async (page: Page) => {
  await page.mouse.move(0, 0)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}
const robotsMeta = (page: Page) => page.locator('meta[name="robots"]')

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ playwright }) => {
  const settings = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(owner) })
  const set = async (changes: { key: string, value: unknown }[]) => {
    const response = await settings.put('/api/core/settings', { data: { changes, confirm: true } })
    expect(response.ok(), await response.text()).toBe(true)
  }
  await set([{ key: 'core.rate-limits.default', value: { count: 10000, per: '1m' } }, { key: 'core.rate-limits.write', value: { count: 10000, per: '1m' } }])
  expect((await settings.put('/api/core/modules/public-site', { data: { on: true } })).ok()).toBe(true)
  // As a fresh install has it, whatever an earlier file left.
  await set([{ key: 'public-site.search.hidden', value: true }])
  await settings.dispose()
})

test('until the site is ready, every page asks search engines to stay away', async ({ page, request }) => {
  await visit(page, '/whats-on')
  await expect(robotsMeta(page)).toHaveAttribute('content', 'noindex')
  await visit(page, '/')
  await expect(robotsMeta(page)).toHaveAttribute('content', 'noindex')
  const robots = await (await request.get('/robots.txt')).text()
  expect(robots).toMatch(/^Disallow: \/$/m)
  expect(robots).not.toContain('Sitemap:')
})

test.describe('someone who looks after the public site', () => {
  test.use(as(editor))

  test('is told on the Admin overview that something is unfinished', async ({ page }) => {
    await visit(page, '/admin')
    await expect(page.getByText(/on the public site (is|are) unfinished/)).toBeVisible()
    await page.getByRole('link', { name: 'See site readiness' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Site readiness' })).toBeVisible()
  })

  test('sees the starter page with its file, and lets search engines in', async ({ page, request }) => {
    await visit(page, '/admin/site-readiness')
    await expect(page.getByRole('heading', { level: 1, name: 'Site readiness' })).toBeVisible()
    await expect(page.getByText('Search engines are being turned away')).toBeVisible()
    const pages = page.getByRole('region', { name: 'Pages with starter text' })
    await expect(pages.getByRole('link', { name: /Welcome/ })).toHaveAttribute('href', '/')
    await expect(pages.getByText(/Edit site\/content\/pages\/index\.md/)).toBeVisible()
    await expect(page.getByRole('region', { name: 'Nothing left to do' }).getByText('Every part a page uses is switched on.')).toBeVisible()
    await noViolations(page)

    // The switch is a button on the warning itself; there is no settings card at the foot.
    await expect(page.getByRole('switch', { name: 'Turn search engines away' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Let search engines in' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Let search engines in' }).click()
    await expect(page.getByText('Search engines may list the site', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Turn search engines away' })).toBeVisible()

    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).not.toMatch(/^Disallow: \/$/m)
    expect(robots).toContain('Sitemap: http://localhost:8788/sitemap.xml')
    await visit(page, '/whats-on')
    await expect(robotsMeta(page)).toHaveCount(0)
    // The starter home page is still marked placeholder, so it stays out of search results.
    await visit(page, '/')
    await expect(robotsMeta(page)).toHaveAttribute('content', 'noindex')
  })
})

test('without the ability, site readiness is not offered', async ({ browser }) => {
  const page = await browser.newPage(as(person('acc_notready', 'Nora Notready', ['core.role.read'])))
  await page.goto('/admin/site-readiness')
  await expect(page.getByRole('heading', { level: 1, name: 'Site readiness' })).toHaveCount(0)
  await page.close()
})
