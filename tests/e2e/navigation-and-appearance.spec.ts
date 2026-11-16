// What a person notices when moving about: where focus goes, what the tab says, which colour mode
// the page arrives in, and that the guard still answers when the browser decides without asking.
// Runs against the gallery build, like the other browser tests.
import { test, expect, type Browser, type Page } from '@playwright/test'

const BASE = 'http://localhost:8788'
const grant = (ability: string) => ({ ability, via: 'test' })
const person = (name: string, grants: ReturnType<typeof grant>[]) => ({ kind: 'person', accountId: `acc_${name.toLowerCase().replace(/\W/g, '')}`, name, grants })
const staff = person('Nora Navigator', [grant('gallery.sample.view'), grant('gallery.sample.manage')])
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })

async function visit(page: Page, url: string) {
  const response = await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  return response
}

/** Changes settings as a site owner for the length of `run`, then puts them back. */
async function withSettings(browser: Browser, changes: { key: string, value: unknown }[], run: () => Promise<void>) {
  const siteOwner = { ...person('Sasha Settings', [grant('core.settings.manage')]), assurance: 'strong', reassertedAt: Date.now() }
  const owner = await browser.newContext({ baseURL: BASE, ...as(siteOwner) })
  const put = (body: object[]) => owner.request.put('/api/core/settings', { data: { changes: body } })
  expect((await put(changes)).ok()).toBe(true)
  try {
    await run()
  }
  finally {
    await put(changes.map(c => ({ key: c.key, reset: true })))
    await owner.close()
  }
}

test.describe('moving between pages', () => {
  test.use(as(staff))

  test('focus moves to the main content after following a link, and stays put when only a filter changes', async ({ page }) => {
    await visit(page, '/console')
    await page.getByRole('navigation', { name: 'Console' }).getByRole('button', { name: 'Gallery' }).click()
    await page.getByRole('navigation', { name: 'Console' }).getByRole('link', { name: /Sample list/ }).click()
    await expect(page).toHaveURL(/\/console\/gallery\/list/)
    await expect(page.locator('main#main')).toBeFocused()

    const search = page.getByRole('searchbox').first()
    await search.fill('ham')
    await expect(page).toHaveURL(/=ham/)
    await expect(search).toBeFocused()
  })

  test('the tab names the page and the theatre', async ({ page }) => {
    await visit(page, '/console/gallery/list')
    await expect(page).toHaveTitle(/^.+ · .+$/)
    const first = await page.title()
    await visit(page, '/console')
    expect(await page.title()).not.toBe(first)
    expect((await page.title()).split(' · ').pop()).toBe(first.split(' · ').pop())
  })

  test('a menu entry opens without asking the server again, and a page outside the menu is still refused', async ({ page }) => {
    await visit(page, '/console')
    const asked: string[] = []
    page.on('request', (request) => { if (request.url().includes('/api/core/access')) asked.push(request.url()) })
    await page.getByRole('navigation', { name: 'Console' }).getByRole('button', { name: 'Gallery' }).click()
    await page.getByRole('navigation', { name: 'Console' }).getByRole('link', { name: /Sample list/ }).click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(asked).toEqual([])

    // An address the menu does not vouch for is asked, and the server's answer stands.
    await page.evaluate(() => { void (window as unknown as { useNuxtApp: () => { $router: { push: (to: string) => Promise<unknown> } } }).useNuxtApp().$router.push('/console/gallery/denied').catch(() => null) })
    await expect(page.getByRole('alert')).toContainText('Ask an administrator for this permission.')
    expect(asked.length).toBe(1)
  })
})

test.describe('the colour mode a page arrives in', () => {
  test('the server sends the starting mode with the page, so nothing is corrected afterwards', async ({ browser }) => {
    await withSettings(browser, [{ key: 'core.appearance.default', value: 'dark' }], async () => {
      const visitor = await browser.newContext({ baseURL: BASE, colorScheme: 'light' })
      const response = await visitor.request.get('/', { headers: { accept: 'text/html' } })
      expect(response.headers()['set-cookie']).toContain('nuxt-color-mode=dark')
      // With scripts off the class is set by the page's own first script alone: turn the app off and look.
      const page = await visitor.newPage()
      await page.route('**/_nuxt/**', route => route.abort())
      await page.goto('/')
      await expect(page.locator('html')).toHaveClass(/dark/)
      await visitor.close()
    })
  })

  test('a person\'s own choice is kept over the starting mode', async ({ browser }) => {
    const visitor = await browser.newContext({ baseURL: BASE, colorScheme: 'light', ...as(person('Cleo Chooser', [])) })
    const page = await visitor.newPage()
    await visit(page, '/')
    await page.getByRole('button', { name: /Cleo Chooser/ }).click()
    await page.getByRole('menuitem', { name: 'Appearance' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await withSettings(browser, [{ key: 'core.appearance.default', value: 'light' }], async () => {
      await visit(page, '/')
      await expect(page.locator('html')).toHaveClass(/dark/)
    })
    // With the choice turned off, everyone gets the starting mode.
    await withSettings(browser, [{ key: 'core.appearance.default', value: 'light' }, { key: 'core.appearance.let-people-choose', value: false }], async () => {
      await visit(page, '/')
      await expect(page.locator('html')).not.toHaveClass(/dark/)
    })
    await visitor.close()
  })

  test('public pages stay light when dark is off for them, from the first paint, and the mode returns in a shell', async ({ browser }) => {
    await withSettings(browser, [{ key: 'core.appearance.default', value: 'dark' }, { key: 'core.appearance.public-dark', value: false }], async () => {
      const visitor = await browser.newContext({ baseURL: BASE, ...as(staff) })
      const html = await (await visitor.request.get('/', { headers: { accept: 'text/html' } })).text()
      expect(html).toMatch(/<html[^>]*data-color-mode-forced="light"/)
      const page = await visitor.newPage()
      await visit(page, '/')
      await expect(page.locator('html')).toHaveClass(/light/)
      await expect(page.locator('html')).not.toHaveClass(/dark/)
      await visit(page, '/console')
      await expect(page.locator('html')).toHaveClass(/dark/)
      await visitor.close()
    })
  })
})
