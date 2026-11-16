// Site administration, the fourth shell (R-33): who may enter, how it differs from the console,
// the site settings page, the palette and the phone layout.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (name: string, grants: ReturnType<typeof grant>[]) => ({ kind: 'person', accountId: `acc_${name.toLowerCase().replace(/\W/g, '')}`, name, grants })
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
// Site settings are privileged, so a site owner has signed in strongly and just now.
const siteOwner = (name: string, extra: string[] = []) => ({ ...person(name, [grant('core.settings.manage'), ...extra.map(grant)]), assurance: 'strong', reassertedAt: Date.now() })

async function visit(page: Page, url: string) {
  const response = await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  return response
}
const noViolations = async (page: Page) => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])

test.describe('a site owner with no console', () => {
  test.use(as(siteOwner('Sol Site')))

  test('has the strip, a way back to the site, the overview and no link in a console that is not theirs', async ({ page }) => {
    await visit(page, '/admin')
    await expect(page).toHaveTitle(/^Site administration/)
    await expect(page.getByText('Site administration', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to the site' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    await expect(page.getByText('Nothing needs attention')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Site administration' })).toContainText('Site settings')
    await noViolations(page)
  })

  test('the site settings page lists settings of the site, and settings search lands on it', async ({ page }) => {
    await visit(page, '/admin/settings')
    await expect(page.getByRole('heading', { level: 1, name: 'Site settings' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
    await page.getByRole('searchbox').first().fill('rate')
    await expect(page.getByRole('link').filter({ hasText: /limit/i }).first()).toBeVisible()
    await noViolations(page)
  })

  test('edits a rate limit as a number of times in a period', async ({ page }) => {
    await visit(page, '/admin/settings')
    await expect(page.getByText('[object Object]')).toHaveCount(0)
    const count = page.getByRole('spinbutton', { name: 'Rate limit: exports: how many times' })
    const period = page.getByRole('textbox', { name: 'Rate limit: exports: in what period' })
    await expect(count).toHaveValue('10')
    await expect(period).toHaveValue('1h')
    await count.fill('12')
    await count.blur()
    await period.fill('2h')
    const section = page.locator('form').filter({ has: count })
    await section.getByRole('button', { name: /^Save/ }).click()
    // Rate limits are confirmed: the dialog says what will change, and Go back saves nothing.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Rate limit: exports goes from 10 in 1h to 12 in 2h.')
    await dialog.getByRole('button', { name: 'Go back' }).click()
    await expect(page.getByText('Saved 1 change')).toHaveCount(0)
    await section.getByRole('button', { name: /^Save/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Save the change' }).click()
    await expect(page.getByText('Saved 1 change', { exact: true })).toBeVisible() // not the toaster's own live-region copy
    await visit(page, '/admin/settings')
    await expect(page.getByRole('spinbutton', { name: 'Rate limit: exports: how many times' })).toHaveValue('12')
    await expect(page.getByRole('textbox', { name: 'Rate limit: exports: in what period' })).toHaveValue('2h')
    await expect(page.getByText('Default: 10 in 1h.')).toBeVisible()
    await period.fill('2d')
    await page.locator('form').filter({ has: period }).getByRole('button', { name: /^Save/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Save the change' }).click()
    await expect(page.getByText(/period between 1 minute and 1 day/)).toBeVisible()
  })

  test('is not offered the console', async ({ page }) => {
    await visit(page, '/admin')
    expect((await page.goto('/console'))?.status()).toBe(404)
  })
})

test.describe('staff who also run the console', () => {
  test.use(as(siteOwner('Sky Staff', ['gallery.sample.view'])))

  test('move between the shells from the account menu, and the console sidebar has no link in', async ({ page }) => {
    await visit(page, '/console')
    expect(await page.getByRole('navigation', { name: 'Console' }).innerText()).not.toContain('Site administration')
    await page.getByRole('button', { name: /Open the menu for Sky Staff/ }).first().click()
    await page.getByRole('menuitem', { name: 'Site administration' }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('link', { name: 'Back to console' })).toBeVisible()
  })

  test('the palette names the shell of each screen', async ({ page }) => {
    await visit(page, '/admin')
    await page.keyboard.press('Control+k')
    await page.keyboard.type('Site settings')
    await expect(page.getByRole('dialog').getByRole('option', { name: /Site settings/ }).first()).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText('Site administration')
  })
})

test.describe('a person with no admin ability', () => {
  test.use(as(person('Nia None', [grant('gallery.sample.view')])))

  test('finds /admin is not there, and no menu entry for it', async ({ page }) => {
    expect((await page.goto('/admin'))?.status()).toBe(404)
    await visit(page, '/console')
    await page.getByRole('button', { name: /Open the menu for Nia None/ }).first().click()
    await expect(page.getByRole('menuitem', { name: 'Site administration' })).toHaveCount(0)
  })
})

test.describe('on a phone, in dark mode', () => {
  test.use({ ...as(siteOwner('Pip Phone')), viewport: { width: 390, height: 844 }, colorScheme: 'dark' })

  test('the strip carries the drawer toggle and the drawer opens', async ({ page }) => {
    await visit(page, '/admin')
    await page.getByRole('button', { name: 'Open or close the menu' }).first().click()
    await expect(page.getByRole('link', { name: 'Back to the site' })).toBeVisible()
    await page.getByRole('link', { name: 'Site settings' }).click()
    await expect(page).toHaveURL(/\/admin\/settings/)
    await noViolations(page)
  })
})
