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
  test.use(as(siteOwner('Sol Site', ['core.audit.view'])))

  test('has the strip, a way back to the site, the overview and no link in a console that is not theirs', async ({ page }) => {
    await visit(page, '/admin')
    await expect(page).toHaveTitle(/^Site administration/)
    await expect(page.getByText('Site administration', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to the site' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    await expect(page.getByText('Nothing needs attention')).toBeVisible()
    await page.getByRole('navigation', { name: 'Site administration' }).getByRole('button', { name: 'Upkeep' }).click()
    await expect(page.getByRole('navigation', { name: 'Site administration' })).toContainText('Advanced')
    await noViolations(page)
  })

  test('the Advanced page lists the engineering limits, and settings search lands on it', async ({ page }) => {
    await visit(page, '/admin/advanced')
    await expect(page.getByRole('heading', { level: 1, name: 'Advanced' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
    await page.getByRole('searchbox').first().fill('rate')
    await expect(page.getByRole('link').filter({ hasText: /limit/i }).first()).toBeVisible()
    await noViolations(page)
  })

  test('Advanced opens with a warning, and Changed leaves only what differs from its default', async ({ page }) => {
    await visit(page, '/admin/advanced')
    await expect(page.getByText('These are engineering limits')).toBeVisible()
    const shown = await page.getByRole('heading', { level: 2 }).count()
    expect(shown).toBeGreaterThan(1)
    await page.getByRole('switch', { name: 'Show only settings I have changed' }).click()
    await expect(page.getByText('Nothing on this page differs from its default')).toBeVisible()
    await expect(page.locator('form')).toHaveCount(0)
    await noViolations(page)
  })

  test('edits a rate limit as a number of times in a period', async ({ page }) => {
    await visit(page, '/admin/advanced')
    await expect(page.getByText('[object Object]')).toHaveCount(0)
    const count = page.getByRole('spinbutton', { name: 'Rate limit: exports: how many times' })
    const period = page.getByRole('spinbutton', { name: 'Rate limit: exports: in what period' })
    await expect(count).toHaveValue('10')
    await expect(period).toHaveValue('1')
    await count.fill('12')
    await count.blur()
    await period.fill('2')
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
    await visit(page, '/admin/advanced')
    await expect(page.getByRole('spinbutton', { name: 'Rate limit: exports: how many times' })).toHaveValue('12')
    await expect(page.getByRole('spinbutton', { name: 'Rate limit: exports: in what period' })).toHaveValue('2')
    await expect(page.getByText('Default: 10 in 1h.')).toBeVisible()
    await period.fill('2')
    await page.locator('[id^="setting-"]').filter({ has: period }).getByRole('combobox', { name: 'Unit' }).click()
    await page.getByRole('option', { name: 'days' }).click()
    await page.locator('form').filter({ has: period }).getByRole('button', { name: /^Save/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Save the change' }).click()
    await expect(page.getByText(/period between 1 minute and 1 day/)).toBeVisible()
  })

  test('a changed setting shows who changed it, its history opens and Revert puts it back, and Settings history lists the change', async ({ page }) => {
    await visit(page, '/admin/advanced')
    const size = page.getByRole('combobox', { name: 'Rows on a page of a list' })
    await expect(size).toBeVisible()
    await size.click()
    await page.getByRole('option', { name: '50' }).click()
    const section = page.locator('form').filter({ has: size })
    await section.getByRole('button', { name: /^Save/ }).click()
    await expect(page.getByText('Saved 1 change', { exact: true })).toBeVisible()
    await expect(section.getByRole('button', { name: /^Changed by the system, / })).toBeVisible()
    await section.getByRole('button', { name: /^Changed by the system, .*Show the history of Rows on a page of a list/ }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toContainText('From 25 to 50.')
    await noViolations(page)
    await drawer.getByRole('button', { name: /^Revert Rows on a page of a list/ }).click()
    await expect(page.getByText('Rows on a page of a list reverted', { exact: true })).toBeVisible()
    await expect(drawer).toContainText('From 50 to 25.')
    await page.keyboard.press('Escape')
    await visit(page, '/admin/settings-history')
    await expect(page.getByRole('heading', { level: 1, name: 'Settings history' })).toBeVisible()
    await expect(page.getByText('From 50 to 25.').first()).toBeVisible()
    await noViolations(page)
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
    await page.keyboard.type('Theatre')
    await expect(page.getByRole('dialog').getByRole('option', { name: /Theatre/ }).first()).toBeVisible()
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
    await visit(page, '/admin/theatre')
    await expect(page.getByRole('heading', { level: 1, name: 'Theatre' })).toBeVisible()
    await noViolations(page)
  })
})
